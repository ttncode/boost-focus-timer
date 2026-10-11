const ICON = "/icons/icon-192.png";
// Reusing one tag replaces a stale notification instead of stacking them.
const TAG = "boost-focus-timer";

const isSupported = (): boolean => typeof window !== "undefined" && "Notification" in window;

/** Asks once, from a click or key press; browsers ignore requests made outside a user gesture. */
export function requestNotificationPermission(): void {
  if (!isSupported() || Notification.permission !== "default") return;
  Notification.requestPermission().catch((error: unknown) => {
    console.error("Notification permission request failed:", error);
  });
}

/** Shows a system notification only while the timer tab is out of view; the chime covers the visible case. */
export function notify(title: string, body: string): void {
  if (!isSupported() || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  try {
    // Silent because the end bell already plays; the notification is the visual cue.
    const notification = new Notification(title, { body, icon: ICON, tag: TAG, silent: true });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.error("Could not show notification:", error);
  }
}
