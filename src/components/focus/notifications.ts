/*
 * The browser permission is the only switch: the app asks Chrome directly on first open.
 * Inside the extension the manifest grants it, so there is nothing to ask.
 */

const ICON_PATH = "icons/icon-128.png";
/*
 * Each notification gets a fresh id and the previous one is closed first. Reusing a tag/id
 * would make the browser swap the text into the old notification silently, without a pop-up.
 */
const NOTIFICATION_ID_PREFIX = "boost-focus-timer";

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

export type NotificationStatus = "unsupported" | NotificationPermission;

export function notificationStatus(): NotificationStatus {
  if (extensionApi()) return "granted";
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

/** Shows a notification when the browser allows it. */
export function notify(title: string, body: string): void {
  if (notificationStatus() === "granted") show(title, body);
}
