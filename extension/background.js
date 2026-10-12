// Background worker. The toolbar button opens the popup (manifest `default_popup`); this worker
// opens the full-page tab on request and raises the end-of-session notification, because the
// popup is destroyed whenever it loses focus and cannot wait for a timer itself.
const APP_URL = chrome.runtime.getURL("index.html");
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

async function scheduleEnd({ at, title, body }) {
  await chrome.storage.session.set({ [PENDING_KEY]: { title, body } });
  await chrome.alarms.create(END_ALARM, { when: at });
}

async function cancelEnd() {
  await chrome.alarms.clear(END_ALARM);
  await chrome.storage.session.remove(PENDING_KEY);
}

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
