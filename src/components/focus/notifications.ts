/*
 * Notifications have an app-level on/off choice on top of the browser permission:
 * inside the extension the permission is granted by the manifest, so without our own
 * choice the user would never be asked.
 */

const ICON_PATH = "icons/icon-128.png";
/*
 * Each notification gets a fresh id and the previous one is closed first. Reusing a tag/id
 * would make the browser swap the text into the old notification silently, without a pop-up.
 */
const NOTIFICATION_ID_PREFIX = "boost-focus-timer";
const PREFERENCE_KEY = "bft:notifications";
const LEGACY_DISMISSED_KEY = "bft:notificationOfferDismissed";
export const NOTIFICATIONS_ENABLED_EVENT = "bft:notifications-enabled";

/** The slice of the extension `chrome` API used here; the web build never has it. */
interface ExtensionApi {
  runtime: { id?: string; getURL(path: string): string };
  notifications: {
    create(id: string, options: { type: "basic"; iconUrl: string; title: string; message: string; silent?: boolean }): Promise<string>;
    clear(id: string): Promise<boolean>;
    onClicked: { addListener(listener: (id: string) => void): void };
  };
  tabs: {
    getCurrent(): Promise<{ id?: number; windowId?: number } | undefined>;
    update(tabId: number, properties: { active: boolean }): Promise<unknown>;
  };
  windows: { update(windowId: number, properties: { focused: boolean }): Promise<unknown> };
}

function extensionApi(): ExtensionApi | null {
  const candidate = (globalThis as { chrome?: Partial<ExtensionApi> }).chrome;
  return candidate?.runtime?.id && candidate.notifications ? (candidate as ExtensionApi) : null;
}

const hasWebNotifications = (): boolean => typeof window !== "undefined" && "Notification" in window;

export type NotificationStatus = "unsupported" | "undecided" | "on" | "off" | "blocked";

function readPreference(): "on" | "off" | null {
  const stored = localStorage.getItem(PREFERENCE_KEY);
  if (stored === "on" || stored === "off") return stored;
  return localStorage.getItem(LEGACY_DISMISSED_KEY) ? "off" : null;
}

const writePreference = (value: "on" | "off") => localStorage.setItem(PREFERENCE_KEY, value);

export function notificationStatus(): NotificationStatus {
  const preference = readPreference();
  if (extensionApi()) return preference ?? "undecided";
  if (!hasWebNotifications()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission === "default") return preference === "off" ? "off" : "undecided";
  return preference ?? "undecided";
}

let clickHandlerInstalled = false;
let previousExtensionId: string | null = null;
let previousWebNotification: Notification | null = null;

/** Clicking an extension notification brings the timer tab and its window to the front. */
function installExtensionClickHandler(api: ExtensionApi): void {
  if (clickHandlerInstalled) return;
  clickHandlerInstalled = true;
  api.notifications.onClicked.addListener(async () => {
    const tab = await api.tabs.getCurrent();
    if (tab?.id !== undefined) await api.tabs.update(tab.id, { active: true });
    if (tab?.windowId !== undefined) await api.windows.update(tab.windowId, { focused: true });
  });
}

function show(title: string, body: string): void {
  const api = extensionApi();
  try {
    if (api) {
      installExtensionClickHandler(api);
      if (previousExtensionId) void api.notifications.clear(previousExtensionId);
      const id = `${NOTIFICATION_ID_PREFIX}-${Date.now()}`;
      previousExtensionId = id;
      const options = { type: "basic" as const, iconUrl: api.runtime.getURL(ICON_PATH), title, message: body, silent: true };
      api.notifications.create(id, options).catch((error: unknown) => console.error("Could not show notification:", error));
      return;
    }
    previousWebNotification?.close();
    // Silent because the end bell already plays; the notification is the visual cue.
    const notification = new Notification(title, { body, icon: `/${ICON_PATH}`, silent: true });
    previousWebNotification = notification;
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.error("Could not show notification:", error);
  }
}

/** Shows a notification when the user turned them on. */
export function notify(title: string, body: string): void {
  if (notificationStatus() === "on") show(title, body);
}

/**
 * Turns notifications on and sends a sample so the user sees the result straight away.
 * Must run from a click: browsers ignore permission requests made outside a user gesture.
 */
export async function enableNotifications(): Promise<NotificationStatus> {
  if (!extensionApi() && hasWebNotifications() && Notification.permission === "default") {
    const permission = await Notification.requestPermission().catch((error: unknown) => {
      console.error("Notification permission request failed:", error);
      return "default" as const;
    });
    // Closing the browser dialog without a choice leaves the user undecided.
    if (permission !== "granted") return notificationStatus();
  }
  const status = notificationStatus();
  if (status === "blocked" || status === "unsupported") return status;
  writePreference("on");
  show("Notifications are on", "You'll get one when a focus session or break ends.");
  window.dispatchEvent(new Event(NOTIFICATIONS_ENABLED_EVENT));
  return "on";
}

export function disableNotifications(): void {
  writePreference("off");
}
