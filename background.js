importScripts("shared.js");

// Service worker: routes the keyboard shortcut to the active YouTube tab. The
// content script copies in-page (the page has focus) and shows its own toast.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "copy-transcript") return;
  const run = (t) => requestTranscriptCopy(t, true).catch(() => {});
  if (tab) {
    run(tab);
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => run(tabs && tabs[0]));
  }
});
