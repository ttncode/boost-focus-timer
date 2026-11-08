pub mod timer;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use timer::ScheduledEnd;

const APP_NAME: &str = "Boost Focus Timer";
const MAIN_WINDOW: &str = "main";
const HIDDEN_ARG: &str = "--hidden";
const AUTOSTART_OFF_MARKER: &str = "autostart-off";
const GLOBAL_SHORTCUT: &str = "Ctrl+Alt+B";
const END_POLL: Duration = Duration::from_secs(1);
// WebView2 writes localStorage to disk a few seconds late, and the installer ends the app abruptly.
const STORAGE_COMMIT_WAIT: Duration = Duration::from_secs(6);

#[derive(Default)]
struct AppState {
    scheduled_end: Mutex<Option<ScheduledEnd>>,
}

#[tauri::command]
fn schedule_end(state: State<AppState>, at: f64, title: String, body: String) -> Result<(), String> {
    let mut slot = state.scheduled_end.lock().map_err(|error| error.to_string())?;
    *slot = Some(ScheduledEnd { at_ms: at, title, body });
    Ok(())
}

#[tauri::command]
fn cancel_end(state: State<AppState>) -> Result<(), String> {
    let mut slot = state.scheduled_end.lock().map_err(|error| error.to_string())?;
    *slot = None;
    Ok(())
}

fn is_web_url(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}

/// Only web links: the page's text must never be able to launch a local file or program.
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !is_web_url(&url) {
        return Err("only web links can be opened".to_string());
    }
    app.opener().open_url(url, None::<&str>).map_err(|error| error.to_string())
}

fn now_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0.0, |elapsed| elapsed.as_millis() as f64)
}

/// A hidden WebView2 throttles or unloads the page, so the end is announced from here. Polling the
/// wall clock keeps it right across PC sleep, which a single long sleep would not count.
fn start_end_timer(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(END_POLL);
        let state = app.state::<AppState>();
        let due = match state.scheduled_end.lock() {
            Ok(mut slot) => timer::take_due(&mut slot, now_ms()),
            Err(_) => None,
        };
        if let Some(end) = due {
            let _ = app.notification().builder().title(end.title).body(end.body).show();
        }
    });
}

fn timer_running(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    state.scheduled_end.lock().is_ok_and(|slot| slot.is_some())
}

fn window_state_flags() -> StateFlags {
    StateFlags::all() - StateFlags::VISIBLE
}

fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else { return };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn hide_main(app: &AppHandle) {
    let _ = app.save_window_state(window_state_flags());
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.hide();
    }
}

fn toggle_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else { return };
    let in_front = window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false);
    if in_front {
        hide_main(app);
    } else {
        show_main(app);
    }
}

fn show_message(app: &AppHandle, text: String) {
    app.dialog().message(text).title(APP_NAME).show(|_| {});
}

/// Never restarts under a running session: the next start or a tray check picks the update up.
fn install_update(app: &AppHandle, update: Update, bytes: Vec<u8>, from_tray: bool) {
    if timer_running(app) {
        if from_tray {
            show_message(app, "A session is running. Check again when it has finished.".to_string());
        }
        return;
    }
    hide_main(app);
    std::thread::sleep(STORAGE_COMMIT_WAIT);
    match update.install(bytes) {
        Ok(()) => app.restart(),
        Err(error) => show_message(app, format!("Couldn't install the update: {error}")),
    }
}

/// At start a failed check stays silent and is retried next start; from the tray it says why.
async fn check_for_update(app: AppHandle, from_tray: bool) {
    let result = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    match result {
        Ok(Some(update)) => match update.download(|_, _| {}, || {}).await {
            Ok(bytes) => install_update(&app, update, bytes, from_tray),
            Err(error) if from_tray => show_message(&app, format!("Couldn't download the update: {error}")),
            Err(_) => {}
        },
        Ok(None) if from_tray => show_message(&app, format!("{APP_NAME} {} is the latest version.", app.package_info().version)),
        Err(error) if from_tray => show_message(&app, format!("Couldn't check for updates: {error}")),
        _ => {}
    }
}

fn autostart_marker(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(AUTOSTART_OFF_MARKER))
}

/// Start with Windows is on unless the user turned it off from the tray, which leaves a marker file.
fn apply_autostart_choice(app: &AppHandle) -> bool {
    let turned_off = autostart_marker(app).is_some_and(|marker| marker.exists());
    if !turned_off {
        let _ = app.autolaunch().enable();
    }
    !turned_off
}

fn set_autostart(app: &AppHandle, enabled: bool) {
    let Some(marker) = autostart_marker(app) else { return };
    if enabled {
        let _ = std::fs::remove_file(&marker);
        let _ = app.autolaunch().enable();
    } else {
        if let Some(dir) = marker.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&marker, b"");
        let _ = app.autolaunch().disable();
    }
}

fn quit(app: &AppHandle) {
    let _ = app.save_window_state(window_state_flags());
    app.exit(0);
}

fn build_tray(app: &AppHandle, autostart_on: bool) -> tauri::Result<()> {
    let version = MenuItem::with_id(app, "version", format!("{APP_NAME} {}", app.package_info().version), false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", format!("Open {APP_NAME}"), true, None::<&str>)?;
    let check = MenuItem::with_id(app, "check-updates", "Check for updates", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart_on, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&version, &open, &check, &autostart, &separator, &quit_item])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip(APP_NAME)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "check-updates" => {
                tauri::async_runtime::spawn(check_for_update(app.clone(), true));
            }
            "autostart" => set_autostart(app, autostart.is_checked().unwrap_or(false)),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// WebView2's browser keys (F5, Ctrl+P, Ctrl+F find bar, Alt+arrows, …) would otherwise act
/// before the app's own shortcuts. Editing keys such as Ctrl+C and Ctrl+Z are not affected.
#[cfg(windows)]
fn disable_browser_keys(window: &WebviewWindow) {
    let _ = window.with_webview(|webview| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows_core::Interface;
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(settings) = core.Settings() else { return };
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Registered first, as the plugin requires: a second launch only brings the window forward,
        // because two running timers would race on the same data.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![HIDDEN_ARG])))
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(window_state_flags()).build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_main(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![schedule_end, cancel_end, open_url])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                hide_main(window.app_handle());
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let autostart_on = apply_autostart_choice(&handle);
            build_tray(&handle, autostart_on)?;
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                disable_browser_keys(&window);
            }
            let clicked = handle.clone();
            app.notification().on_action(move |_| show_main(&clicked))?;
            start_end_timer(handle.clone());
            let started_hidden = std::env::args().any(|arg| arg == HIDDEN_ARG);
            if !started_hidden {
                show_main(&handle);
            }
            if app.global_shortcut().register(GLOBAL_SHORTCUT).is_err() && !started_hidden {
                show_message(&handle, format!("{GLOBAL_SHORTCUT} is used by another program. Open the app from its tray icon instead."));
            }
            tauri::async_runtime::spawn(check_for_update(handle, false));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Boost Focus Timer");
}

#[cfg(test)]
mod tests {
    use super::is_web_url;

    #[test]
    fn only_web_links_may_open() {
        assert!(is_web_url("https://example.com"));
        assert!(is_web_url("http://example.com"));
        assert!(!is_web_url("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_web_url("C:\\Windows\\System32\\calc.exe"));
    }
}
