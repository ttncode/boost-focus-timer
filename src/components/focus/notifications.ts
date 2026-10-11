const ICON = "/icons/icon-192.png";
// Reusing one tag replaces a stale notification instead of stacking them.
const TAG = "boost-focus-timer";
const OFFER_DISMISSED_KEY = "bft:notificationOfferDismissed";

const isSupported = (): boolean => typeof window !== "undefined" && "Notification" in window;

/** True until the user has decided: the browser hasn't asked yet and they haven't said "Not now". */
export function shouldOfferNotifications(): boolean {
  return isSupported() && Notification.permission === "default" && !localStorage.getItem(OFFER_DISMISSED_KEY);
}

export function dismissNotificationOffer(): void {
  localStorage.setItem(OFFER_DISMISSED_KEY, "1");
}

/** Must run from a click or key press; browsers ignore permission requests made outside a user gesture. */
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isSupported()) return null;
  try {
    return await Notification.requestPermission();
  } catch (error) {
    console.error("Notification permission request failed:", error);
    return null;
  }
}

export type NotificationStatus = "unsupported" | NotificationPermission;

export const notificationStatus = (): NotificationStatus => (isSupported() ? Notification.permission : "unsupported");

/** Shows a system notification when the user has allowed them; silent because the end bell already plays. */
export function notify(title: string, body: string): void {
  if (!isSupported() || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, { body, icon: ICON, tag: TAG, silent: true });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.error("Could not show notification:", error);
  }
}
