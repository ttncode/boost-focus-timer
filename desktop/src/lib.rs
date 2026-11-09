pub mod timer;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use timer::ScheduledEnd;

const APP_NAME: &str = "Boost Focus Timer";
const MAIN_WINDOW: &str = "main";
const HIDDEN_ARG: &str = "--hidden";
const AUTOSTART_OFF_MARKER: &str = "autostart-off";
const CLOSE_NOTICE_MARKER: &str = "close-notice-shown";
const TRAY_ID: &str = "main";
const END_POLL: Duration = Duration::from_secs(1);
const UPDATE_CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const SESSION_RUNNING_MESSAGE: &str = "A session is running. Check again when it has finished.";
// WebView2 writes localStorage to disk a few seconds late, and ending the app abruptly loses those writes.
const STORAGE_COMMIT_WAIT: Duration = Duration::from_secs(6);

#[derive(Default)]
struct AppState {
    scheduled_end: Mutex<Option<ScheduledEnd>>,
    update_check_busy: AtomicBool,
    declined_update: Mutex<Option<String>>,
}

#[tauri::command]
fn schedule_end(state: State<AppState>, at: f64, title: String, body: String, notify: bool) -> Result<(), String> {
    let mut slot = state.scheduled_end.lock().map_err(|error| error.to_string())?;
    *slot = Some(ScheduledEnd { at_ms: at, title, body, notify });
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

/// Async so the blocking save dialog stays off the main thread. Returns false if the user cancels.
#[tauri::command(async)]
fn save_backup(app: AppHandle, file_name: String, contents: String) -> Result<bool, String> {
    let Some(picked) = app.dialog().file().set_file_name(file_name).add_filter("JSON", &["json"]).blocking_save_file() else {
        return Ok(false);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    std::fs::write(path, contents).map_err(|error| error.to_string())?;
    Ok(true)
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
        if let Some(end) = due.filter(|end| end.notify) {
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

fn show_message(app: &AppHandle, text: String) {
    app.dialog().message(text).title(APP_NAME).show(|_| {});
}

fn set_tray_tooltip(app: &AppHandle, text: &str) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
}

/// Never restarts under a running session, which may have started during the download.
fn install_update(app: &AppHandle, update: Update, bytes: Vec<u8>) {
    if timer_running(app) {
        show_message(app, SESSION_RUNNING_MESSAGE.to_string());
        return;
    }
    hide_main(app);
    std::thread::sleep(STORAGE_COMMIT_WAIT);
    match update.install(bytes) {
        Ok(()) => app.restart(),
        Err(error) => {
            show_main(app);
            show_message(app, format!("Couldn't install the update: {error}"));
        }
    }
}

fn ask_to_install(app: &AppHandle, version: &str) -> bool {
    app.dialog()
        .message(format!("Version {version} is available. Install it now? The app will close and reopen."))
        .title(APP_NAME)
        .buttons(MessageDialogButtons::OkCancelCustom("Install and restart".to_string(), "Later".to_string()))
        .blocking_show()
}

fn was_declined(app: &AppHandle, version: &str) -> bool {
    app.state::<AppState>().declined_update.lock().is_ok_and(|slot| slot.as_deref() == Some(version))
}

fn remember_declined(app: &AppHandle, version: &str) {
    if let Ok(mut slot) = app.state::<AppState>().declined_update.lock() {
        *slot = Some(version.to_string());
    }
}

/// Automatic checks ask once per version per run, so "Later" is not repeated every few hours.
async fn offer_update(app: &AppHandle, update: Update, from_tray: bool) {
    if timer_running(app) {
        if from_tray {
            show_message(app, SESSION_RUNNING_MESSAGE.to_string());
        }
        return;
    }
    if !from_tray && was_declined(app, &update.version) {
        return;
    }
    if !ask_to_install(app, &update.version) {
        remember_declined(app, &update.version);
        return;
    }
    set_tray_tooltip(app, "Downloading update…");
    let downloaded = update.download(|_, _| {}, || {}).await;
    set_tray_tooltip(app, APP_NAME);
    match downloaded {
        Ok(bytes) => install_update(app, update, bytes),
        Err(error) => show_message(app, format!("Couldn't download the update: {error}")),
    }
}

/// An automatic check that fails stays silent and is retried later; from the tray it says why.
async fn run_update_check(app: &AppHandle, from_tray: bool) {
    let result = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    match result {
        Ok(Some(update)) => offer_update(app, update, from_tray).await,
        Ok(None) if from_tray => show_message(app, format!("{APP_NAME} {} is the latest version.", app.package_info().version)),
        Err(error) if from_tray => show_message(app, format!("Couldn't check for updates: {error}")),
        _ => {}
    }
}

async fn check_for_update(app: AppHandle, from_tray: bool) {
    let state = app.state::<AppState>();
    if state.update_check_busy.swap(true, Ordering::SeqCst) {
        if from_tray {
            show_message(&app, "An update check is already running.".to_string());
        }
        return;
    }
    run_update_check(&app, from_tray).await;
    state.update_check_busy.store(false, Ordering::SeqCst);
}

/// The app lives in the tray for weeks, so checking only at launch would leave it behind.
fn start_update_checks(app: AppHandle) {
    std::thread::spawn(move || loop {
        tauri::async_runtime::block_on(check_for_update(app.clone(), false));
        std::thread::sleep(UPDATE_CHECK_EVERY);
    });
}

fn app_marker(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(name))
}

fn write_marker(marker: &Path) {
    if let Some(dir) = marker.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(marker, b"");
}

/// Start with Windows is on unless the user turned it off from the tray, which leaves a marker file.
fn apply_autostart_choice(app: &AppHandle) -> bool {
    let turned_off = app_marker(app, AUTOSTART_OFF_MARKER).is_some_and(|marker| marker.exists());
    if !turned_off {
        let _ = app.autolaunch().enable();
    }
    !turned_off
}

fn set_autostart(app: &AppHandle, enabled: bool) {
    let Some(marker) = app_marker(app, AUTOSTART_OFF_MARKER) else { return };
    if enabled {
        let _ = std::fs::remove_file(&marker);
        let _ = app.autolaunch().enable();
    } else {
        write_marker(&marker);
        let _ = app.autolaunch().disable();
    }
}

fn hide_on_close(app: &AppHandle) {
    hide_main(app);
    let Some(marker) = app_marker(app, CLOSE_NOTICE_MARKER) else { return };
    if marker.exists() {
        return;
    }
    write_marker(&marker);
    show_message(
        app,
        format!("{APP_NAME} is still running in the system tray, so sessions and notifications carry on. Click the tray icon to reopen it (it may be under the ^ arrow). To exit, right-click the icon and choose Quit."),
    );
}

fn exit_after_storage_commit(app: &AppHandle) {
    hide_main(app);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(STORAGE_COMMIT_WAIT);
        app.exit(0);
    });
}

fn quit(app: &AppHandle) {
    if !timer_running(app) {
        exit_after_storage_commit(app);
        return;
    }
    let confirmed_app = app.clone();
    app.dialog()
        .message("A session is running. Quit anyway? You won't get its end notification.")
        .title(APP_NAME)
        .buttons(MessageDialogButtons::OkCancelCustom("Quit".to_string(), "Keep running".to_string()))
        .show(move |confirmed| {
            if confirmed {
                exit_after_storage_commit(&confirmed_app);
            }
        });
}

fn build_tray(app: &AppHandle, autostart_on: bool) -> tauri::Result<()> {
    let version = MenuItem::with_id(app, "version", format!("{APP_NAME} {}", app.package_info().version), false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", format!("Open {APP_NAME}"), true, None::<&str>)?;
    let check = MenuItem::with_id(app, "check-updates", "Check for updates", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart_on, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&version, &open, &check, &autostart, &separator, &quit_item])?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![schedule_end, cancel_end, open_url, save_backup])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                hide_on_close(window.app_handle());
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
            start_update_checks(handle);
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
