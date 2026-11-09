/*
 * Browser-extension and desktop-app glue. In both, the app runs in a window the user may close
 * at any time, so a running timer is recorded here and something outside the page (the background
 * worker, or the desktop shell) raises the end-of-session notification. Every function is a no-op
 * in the web app.
 */

const RUNNING_TIMER_KEY = "bft:runningTimer";
const DESKTOP_NOTIFICATIONS_OFF_KEY = "bft:desktopNotificationsOff";
const BLOB_URL_LIFETIME_MS = 10_000;

interface ExtensionRuntime {
  runtime: { id?: string; sendMessage(message: BackgroundMessage): Promise<unknown> };
}

interface DesktopShell {
  core: { invoke(command: string, args: Record<string, unknown>): Promise<unknown> };
}

export type BackgroundMessage =
  | { type: "open-app" }
  | { type: "open-url"; url: string }
  | { type: "schedule-end"; at: number; title: string; body: string; notify: boolean }
  | { type: "cancel-end" };

function runtime(): ExtensionRuntime["runtime"] | null {
  const candidate = (globalThis as { chrome?: Partial<ExtensionRuntime> }).chrome;
  return candidate?.runtime?.id ? candidate.runtime : null;
}

function desktopShell(): DesktopShell | null {
  return (globalThis as { __TAURI__?: DesktopShell }).__TAURI__ ?? null;
}

export const isDesktopApp = (): boolean => desktopShell() !== null;

/** True when something outside the page shows end-of-session notifications. */
export const hasBackgroundWorker = (): boolean => runtime() !== null || isDesktopApp();

/** The build marks popup.html with `data-view="popup"`; the full-page tab has no marker. */
export const isPopupView = (): boolean =>
  typeof document !== "undefined" && document.documentElement.dataset.view === "popup";

async function send(message: BackgroundMessage): Promise<void> {
  try {
    const desktop = desktopShell();
    if (desktop) {
      const { type, ...args } = message;
      await desktop.core.invoke(type.replace("-", "_"), args);
      return;
    }
    await runtime()?.sendMessage(message);
  } catch (error) {
    console.error(`Background message "${message.type}" failed:`, error);
  }
}

/** Opens (or focuses) the full-page app tab, then closes the popup once the request has been delivered. */
export async function openFullPage(): Promise<void> {
  await send({ type: "open-app" });
  if (isPopupView()) window.close();
}

/** The desktop window cannot follow `target="_blank"`, so the default browser opens the link. */
export function openLinkOnDesktop(event: { preventDefault(): void }, url: string): void {
  if (!isDesktopApp()) return;
  event.preventDefault();
  void send({ type: "open-url", url });
}

/** Resolves false when the user cancels the desktop save dialog; rejects if the file can't be written. */
export async function saveBackupFile(fileName: string, contents: string): Promise<boolean> {
  const desktop = desktopShell();
  if (desktop) return (await desktop.core.invoke("save_backup", { fileName, contents })) === true;
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: fileName }).click();
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS);
  return true;
}

function keepsNativeMenu(target: EventTarget | null): boolean {
  const isEditable = target instanceof Element && target.closest("input, textarea, [contenteditable]") !== null;
  return isEditable || Boolean(window.getSelection()?.toString());
}

/** WebView2's default menu offers Reload and Print; only cut, copy and paste belong in an app. */
export function suppressDesktopContextMenu(): () => void {
  if (!isDesktopApp()) return () => {};
  const suppress = (event: MouseEvent) => {
    if (!keepsNativeMenu(event.target)) event.preventDefault();
  };
  document.addEventListener("contextmenu", suppress);
  return () => document.removeEventListener("contextmenu", suppress);
}

export const desktopNotificationsOn = (): boolean => localStorage.getItem(DESKTOP_NOTIFICATIONS_OFF_KEY) === null;

/** Applies at once: a running session's end is rescheduled with the new choice. */
export function setDesktopNotificationsOn(isOn: boolean): void {
  if (isOn) localStorage.removeItem(DESKTOP_NOTIFICATIONS_OFF_KEY);
  else localStorage.setItem(DESKTOP_NOTIFICATIONS_OFF_KEY, "true");
  const running = readRunningTimer();
  if (running) trackRunningTimer(running);
}

export interface RunningTimer {
  readonly kind: "focus" | "break";
  readonly sessionId: string;
  /** Epoch ms when the countdown reaches zero. */
  readonly endAt: number;
  readonly totalMs: number;
  readonly goal: string;
}

/**
 * Records the running countdown so a reopened popup continues it, and has the background
 * worker notify at `endAt` even when no app page is open.
 */
export function trackRunningTimer(timer: RunningTimer): void {
  if (!hasBackgroundWorker()) return;
  localStorage.setItem(RUNNING_TIMER_KEY, JSON.stringify(timer));
  const notification =
    timer.kind === "focus"
      ? { title: "Focus session complete", body: `${timer.goal.trim() || "Nice work"} · time for a break.` }
      : { title: "Break is over", body: "Ready for the next focus session?" };
  void send({ type: "schedule-end", at: timer.endAt, notify: desktopNotificationsOn(), ...notification });
}

export function clearRunningTimer(): void {
  if (!hasBackgroundWorker() || localStorage.getItem(RUNNING_TIMER_KEY) === null) return;
  localStorage.removeItem(RUNNING_TIMER_KEY);
  void send({ type: "cancel-end" });
}

export function readRunningTimer(): RunningTimer | null {
  if (!hasBackgroundWorker()) return null;
  try {
    const stored = localStorage.getItem(RUNNING_TIMER_KEY);
    return stored ? (JSON.parse(stored) as RunningTimer) : null;
  } catch (error) {
    console.error("Unreadable running timer record:", error);
    return null;
  }
}
