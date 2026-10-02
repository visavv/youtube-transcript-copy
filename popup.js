const KEYS = ["includeTimestamps", "oneLinePerCaption", "includeChapters", "includeHeader"];
const DEFAULTS = {
  includeTimestamps: false,
  oneLinePerCaption: false,
  includeChapters: true,
  includeHeader: false,
};

// Optional donation link shown at the bottom of the popup.
// Replace YOUR_HANDLE with your own (e.g. https://www.buymeacoffee.com/janedoe
// or https://github.com/sponsors/janedoe). While it still contains YOUR_HANDLE
// the link stays hidden, so a forgotten placeholder never ships a dead link.
const SUPPORT_URL = "https://www.buymeacoffee.com/YOUR_HANDLE";

function setupSupportLink() {
  const link = document.getElementById("supportLink");
  if (!link) return;
  if (!SUPPORT_URL || SUPPORT_URL.includes("YOUR_HANDLE")) {
    link.parentElement.style.display = "none";
    return;
  }
  link.href = SUPPORT_URL;
}

function setStatus(msg, isErr) {
  const el = document.getElementById("copyStatus");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("err", !!isErr);
}

const FAILURES = {
  "not-video": "Open a YouTube video first.",
  navigated: "The video changed. Try again.",
  "no-transcript": "No transcript available for this video.",
};

// One-action copy: ask the active YouTube tab's content script to gather the
// transcript (opening the panel if needed), then write it to the clipboard
// here, where the popup has focus.
async function copyFromPopup() {
  const btn = document.getElementById("copyBtn");
  if (btn) btn.disabled = true;
  setStatus("Working…", false);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let resp;
    try {
      resp = await requestTranscriptCopy(tab, false);
    } catch (_e) {
      setStatus("Couldn't reach the page. Reload the video tab and try again.", true);
      return;
    }
    if (!resp) {
      setStatus("No response. Reload the video tab and try again.", true);
      return;
    }
    if (!resp.ok) {
      setStatus(FAILURES[resp.reason] || "Couldn't copy. Try again.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(resp.text);
    } catch (_e) {
      setStatus("Clipboard blocked. Use the Copy transcript button under the video.", true);
      return;
    }
    const n = Number(resp.words);
    let msg = "Copied " + n.toLocaleString() + (n === 1 ? " word" : " words") + " · ~" + resp.minutes + " min read";
    if (resp.filtered) msg += ". Transcript search is on, clear it to copy everything.";
    setStatus(msg, false);
  } catch (_e) {
    setStatus("Couldn't copy. Try again.", true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Chrome may leave the suggested hotkey unbound (conflicts) or the user may
// rebind it, so show the real binding.
function showShortcut() {
  const key = document.getElementById("shortcutKey");
  const help = document.getElementById("shortcutHelp");
  if (!key || !chrome.commands) return;
  chrome.commands.getAll((commands) => {
    const cmd = (commands || []).find((c) => c.name === "copy-transcript");
    if (cmd && cmd.shortcut) {
      key.textContent = cmd.shortcut;
    } else {
      key.textContent = "not set";
      if (help) help.textContent = "Add one at chrome://extensions/shortcuts.";
    }
  });
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (items) => {
    KEYS.forEach((k) => {
      const el = document.getElementById(k);
      if (el) el.checked = !!items[k];
    });
  });
}

function save() {
  const update = {};
  KEYS.forEach((k) => {
    const el = document.getElementById(k);
    if (el) update[k] = el.checked;
  });
  chrome.storage.sync.set(update);
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  setupSupportLink();
  showShortcut();
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn) copyBtn.addEventListener("click", copyFromPopup);
  KEYS.forEach((k) => {
    const el = document.getElementById(k);
    if (el) el.addEventListener("change", save);
  });
});
