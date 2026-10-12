/*
 * The browser permission is the only switch: the app asks the browser directly on first open.
 * Inside the extension the manifest grants it and the background worker shows the
 * end-of-session notifications (see lib/extension.ts), so pages there never notify themselves.
 */
import { isExtensionPage } from "../lib/extension";

const ICON_PATH = "/icons/icon-128.png";

const hasWebNotifications = (): boolean => typeof window !== "undefined" && "Notification" in window;

export type NotificationStatus = "unsupported" | NotificationPermission;

export function notificationStatus(): NotificationStatus {
  if (isExtensionPage()) return "granted";
  return hasWebNotifications() ? Notification.permission : "unsupported";
}

/**
 * Shows Chrome's own Allow/Block prompt. Called on first open without a click, Chrome may
 * show its quieter prompt (a bell in the address bar) instead; the menu entry asks again from a click.
 */
export async function requestNotificationPermission(): Promise<NotificationStatus> {
  if (notificationStatus() !== "default") return notificationStatus();
  try {
    return await Notification.requestPermission();
  } catch (error) {
    console.error("Notification permission request failed:", error);
    return notificationStatus();
  }
}

// A real prompt waits for the user; anything faster means the browser refused to show one.
const NO_PROMPT_SHOWN_MS = 500;
const GESTURE_EVENTS = ["pointerdown", "keydown"] as const;

/**
 * Asks on first open. Chrome shows its prompt straight away. Firefox and Safari only allow the
 * request inside a click or key press and answer "default" at once otherwise, so the ask is
 * repeated on the user's first interaction. Edge shows its quiet bell instead and keeps waiting.
 * Returns a cleanup that drops the pending first-interaction listener.
 */
export function askForNotificationsOnFirstOpen(): () => void {
  if (notificationStatus() !== "default") return () => {};
  let isDisposed = false;
  const askFromGesture = () => {
    stopListening();
    void requestNotificationPermission();
  };
  const stopListening = () => GESTURE_EVENTS.forEach((type) => window.removeEventListener(type, askFromGesture, true));
  const startedAt = Date.now();
  void requestNotificationPermission().then((result) => {
    const browserRefusedToPrompt = result === "default" && Date.now() - startedAt < NO_PROMPT_SHOWN_MS;
    if (!isDisposed && browserRefusedToPrompt) GESTURE_EVENTS.forEach((type) => window.addEventListener(type, askFromGesture, true));
  });
  return () => {
    isDisposed = true;
    stopListening();
  };
}

// The previous notification is closed first: a reused tag would swap the text in silently, without a pop-up.
let previousNotification: Notification | null = null;

function show(title: string, body: string): void {
  try {
    previousNotification?.close();
    // Silent because the end bell already plays; the notification is the visual cue.
    const notification = new Notification(title, { body, icon: ICON_PATH, silent: true });
    previousNotification = notification;
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.error("Could not show notification:", error);
  }
}

/** Shows a notification in the web app when the browser allows it; the extension's background worker handles its own. */
export function notify(title: string, body: string): void {
  if (!isExtensionPage() && notificationStatus() === "granted") show(title, body);
}
