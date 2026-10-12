/*
 * Browser-extension glue. In the extension the app runs in a toolbar popup that is destroyed
 * whenever it loses focus, so a running timer is recorded here and the background worker
 * raises the end-of-session notification. Every function is a no-op in the web app.
 */

const RUNNING_TIMER_KEY = "bft:runningTimer";

interface ExtensionRuntime {
  runtime: { id?: string; sendMessage(message: BackgroundMessage): Promise<unknown> };
}

export type BackgroundMessage =
  | { type: "open-app" }
  | { type: "schedule-end"; at: number; title: string; body: string }
  | { type: "cancel-end" };

function runtime(): ExtensionRuntime["runtime"] | null {
  const candidate = (globalThis as { chrome?: Partial<ExtensionRuntime> }).chrome;
  return candidate?.runtime?.id ? candidate.runtime : null;
}

export const isExtensionPage = (): boolean => runtime() !== null;

/** The build marks popup.html with `data-view="popup"`; the full-page tab has no marker. */
export const isPopupView = (): boolean =>
  typeof document !== "undefined" && document.documentElement.dataset.view === "popup";

async function send(message: BackgroundMessage): Promise<void> {
  try {
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
  if (!isExtensionPage()) return;
  localStorage.setItem(RUNNING_TIMER_KEY, JSON.stringify(timer));
  const notification =
    timer.kind === "focus"
      ? { title: "Focus session complete", body: `${timer.goal.trim() || "Nice work"} · time for a break.` }
      : { title: "Break is over", body: "Ready for the next focus session?" };
  void send({ type: "schedule-end", at: timer.endAt, ...notification });
}

export function clearRunningTimer(): void {
  if (!isExtensionPage() || localStorage.getItem(RUNNING_TIMER_KEY) === null) return;
  localStorage.removeItem(RUNNING_TIMER_KEY);
  void send({ type: "cancel-end" });
}

export function readRunningTimer(): RunningTimer | null {
  if (!isExtensionPage()) return null;
  try {
    const stored = localStorage.getItem(RUNNING_TIMER_KEY);
    return stored ? (JSON.parse(stored) as RunningTimer) : null;
  } catch (error) {
    console.error("Unreadable running timer record:", error);
    return null;
  }
}
