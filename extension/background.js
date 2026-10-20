// Background worker. The toolbar button opens the compact app in a popup window; this worker also
// opens the full-page tab on request and raises the end-of-session notification, because the
// popup window may be closed while a timer runs.
const APP_URL = chrome.runtime.getURL("index.html");
const POPUP_URL = chrome.runtime.getURL("popup.html");
const POPUP_SIZE = { width: 420, height: 640 };
const POPUP_EDGE_MARGIN_PX = 16;
const POPUP_TOOLBAR_OFFSET_PX = 72;
const POPUP_BOUNDS_KEY = "popupBounds";
const ICON_URL = chrome.runtime.getURL("icons/icon-128.png");
const END_ALARM = "session-end";
const PENDING_KEY = "pendingNotification";

/** One app tab only: two running timers would race on the same local data. */
async function openApp() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["TAB"], documentUrls: [APP_URL] });
  const existing = contexts.find((context) => context.tabId !== -1);
  if (!existing) {
    await chrome.tabs.create({ url: APP_URL });
    return;
  }
  await chrome.tabs.update(existing.tabId, { active: true });
  await chrome.windows.update(existing.windowId, { focused: true });
}

async function popupContext() {
  const [context] = await chrome.runtime.getContexts({ contextTypes: ["TAB"], documentUrls: [POPUP_URL] });
  return context ?? null;
}

/** Top-right of the current browser window, under its toolbar, like the dropdown it replaces. */
function defaultPopupBounds(browserWindow) {
  return {
    left: Math.max(0, browserWindow.left + browserWindow.width - POPUP_SIZE.width - POPUP_EDGE_MARGIN_PX),
    top: Math.max(0, browserWindow.top + POPUP_TOOLBAR_OFFSET_PX),
    ...POPUP_SIZE,
  };
}

async function openPopup() {
  const existing = await popupContext();
  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  const { [POPUP_BOUNDS_KEY]: saved } = await chrome.storage.local.get(POPUP_BOUNDS_KEY);
  const bounds = saved ?? defaultPopupBounds(await chrome.windows.getLastFocused());
  await chrome.windows.create({ url: POPUP_URL, type: "popup", focused: true, ...bounds });
}

async function rememberPopupBounds(browserWindow) {
  const popup = await popupContext();
  if (popup?.windowId !== browserWindow.id) return;
  const { left, top, width, height } = browserWindow;
  await chrome.storage.local.set({ [POPUP_BOUNDS_KEY]: { left, top, width, height } });
}

async function scheduleEnd({ at, title, body }) {
  await chrome.storage.session.set({ [PENDING_KEY]: { title, body } });
  await chrome.alarms.create(END_ALARM, { when: at });
}

async function cancelEnd() {
  await chrome.alarms.clear(END_ALARM);
  await chrome.storage.session.remove(PENDING_KEY);
}

chrome.action.onClicked.addListener(() => {
  openPopup().catch((error) => console.error("Failed to open the popup window:", error));
});

chrome.windows.onBoundsChanged.addListener((browserWindow) => {
  rememberPopupBounds(browserWindow).catch((error) => console.error("Failed to remember the popup size:", error));
});

chrome.runtime.onMessage.addListener((message) => {
  const handlers = { "open-app": openApp, "schedule-end": scheduleEnd, "cancel-end": cancelEnd };
  handlers[message?.type]?.(message).catch((error) => console.error(`Failed to handle ${message.type}:`, error));
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== END_ALARM) return;
  const { [PENDING_KEY]: pending } = await chrome.storage.session.get(PENDING_KEY);
  if (!pending) return;
  await chrome.storage.session.remove(PENDING_KEY);
  // A fresh id per notification: reusing one swaps the text in silently without a pop-up.
  await chrome.notifications.create(`session-end-${Date.now()}`, {
    type: "basic",
    iconUrl: ICON_URL,
    title: pending.title,
    message: pending.body,
  });
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  openApp().catch((error) => console.error("Failed to open the app:", error));
});
