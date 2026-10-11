// Toolbar button (and its optional keyboard shortcut): focus the open timer tab, or open one.
// A single tab matters because two running timers would race on the same local data.
const APP_URL = chrome.runtime.getURL("index.html");

async function findAppTab() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["TAB"], documentUrls: [APP_URL] });
  return contexts.find((context) => context.tabId !== -1) ?? null;
}

chrome.action.onClicked.addListener(async () => {
  const existing = await findAppTab();
  if (!existing) {
    await chrome.tabs.create({ url: APP_URL });
    return;
  }
  await chrome.tabs.update(existing.tabId, { active: true });
  await chrome.windows.update(existing.windowId, { focused: true });
});
