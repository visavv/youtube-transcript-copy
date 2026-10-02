// Shared by the popup and the service worker: ask a YouTube tab's content
// script to copy its transcript. Tabs that were already open when the
// extension was installed or updated have no live content script, so inject
// ours (allowed by activeTab, which the click or hotkey grants) and retry once.
const YT_WATCH_URL = /^https:\/\/www\.youtube\.com\/watch\?/;

async function requestTranscriptCopy(tab, inPage) {
  if (!tab || tab.id == null || !YT_WATCH_URL.test(tab.url || "")) {
    return { ok: false, reason: "not-video" };
  }
  const message = { type: "COPY_TRANSCRIPT", inPage };
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (_e) {
    const target = { tabId: tab.id };
    await chrome.scripting.insertCSS({ target, files: ["content.css"] });
    await chrome.scripting.executeScript({ target, files: ["content.js"] });
    return await chrome.tabs.sendMessage(tab.id, message);
  }
}
