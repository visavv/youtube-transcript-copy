/* YouTube Transcript Copy
 * Injects a "Copy" button into YouTube's transcript panel header and copies the
 * full transcript to the clipboard. Also supports one-action copy (toolbar
 * popup button / keyboard shortcut) that opens the transcript if it's closed.
 *
 * Handles classic and modern transcript markup:
 *  - classic:  ytd-transcript-segment-renderer / .segment-text / .segment-timestamp
 *  - modern:   transcript-segment-view-model / span[role="text"] /
 *              .ytwTranscriptSegmentViewModelTimestamp
 */
(() => {
  "use strict";

  // The popup and hotkey inject this script on demand into tabs that were open
  // before an install or update. Run once per isolated world, and replace any
  // controls left behind by an orphaned instance from a previous version.
  if (window.__ytcopyLoaded) return;
  window.__ytcopyLoaded = true;
  document
    .querySelectorAll(".ytcopy-actions-row, #ytcopy-copy-btn, .ytcopy-panel-toolbar, .ytcopy-toast")
    .forEach((el) => el.remove());

  // False once the extension is reloaded or updated underneath this page.
  const alive = () => {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_e) {
      return false;
    }
  };

  const BTN_ID = "ytcopy-copy-btn";

  // The transcript panel ships under two different target-ids; match both.
  const PANEL_SELECTOR =
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"],' +
    'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]';

  const SEG_MODERN = "transcript-segment-view-model";
  const SEG_CLASSIC = "ytd-transcript-segment-renderer";
  // Chapter headings sit between captions, in document order.
  const CHAPTER_MODERN = "timeline-chapter-view-model";
  const CHAPTER_CLASSIC = "ytd-transcript-section-header-renderer";
  const CONTENT_SELECTOR = "ytd-transcript-renderer," + SEG_MODERN + "," + SEG_CLASSIC;
  let navigating = false;
  let navigationVersion = 0;
  const isWatchPage = () => !navigating && location.pathname === "/watch" &&
    !!new URLSearchParams(location.search).get("v");
  const cleanText = (text) => (text || "").replace(/\s+/g, " ").trim();

  const DEFAULTS = {
    includeTimestamps: false, // prefix each line with its timestamp
    oneLinePerCaption: false, // newline per caption instead of one paragraph
    includeHeader: false,     // prepend video info (title, channel, link, ...)
    includeChapters: true,    // chapter titles as section headings, if any
  };

  const COPY_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/>' +
    "</svg>";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (items) => {
          if (chrome.runtime && chrome.runtime.lastError) resolve(DEFAULTS);
          else resolve(Object.assign({}, DEFAULTS, items));
        });
      } catch (_e) {
        resolve(DEFAULTS);
      }
    });
  }

  // ---- transcript reading (both layouts) --------------------------------

  function readSegment(seg, modern) {
    if (modern) {
      const tsEl = seg.querySelector(".ytwTranscriptSegmentViewModelTimestamp");
      const ts = tsEl ? tsEl.textContent.trim() : "";
      let text = "";
      const cands = seg.querySelectorAll(
        'span[role="text"], .yt-core-attributed-string'
      );
      for (let i = 0; i < cands.length; i++) {
        if (tsEl && (tsEl.contains(cands[i]) || cands[i].contains(tsEl))) continue;
        if (cands[i].textContent && cands[i].textContent.trim()) {
          text = cands[i].textContent;
          break;
        }
      }
      if (!text.trim()) {
        const copy = seg.cloneNode(true);
        copy.querySelectorAll(".ytwTranscriptSegmentViewModelTimestamp, .ytwTranscriptSegmentViewModelTimestampA11yLabel")
          .forEach((el) => el.remove());
        text = copy.textContent || "";
      }
      return { ts, text: text.replace(/\s+/g, " ").trim() };
    }
    const textEl = seg.querySelector(".segment-text");
    const tsEl = seg.querySelector(".segment-timestamp");
    return {
      ts: tsEl ? tsEl.textContent.trim() : "",
      text: (textEl ? textEl.textContent : "").replace(/\s+/g, " ").trim(),
    };
  }

  // The panel to read from: the caller's own panel, else the visible one with
  // captions, else any panel with captions.
  function pickPanel(preferredPanel) {
    if (preferredPanel) return preferredPanel;
    const segs = SEG_MODERN + "," + SEG_CLASSIC;
    const panels = [...transcriptPanels()];
    return (
      panels.find((p) => isVisible(p) && p.querySelector(segs)) ||
      panels.find((p) => p.querySelector(segs)) ||
      null
    );
  }

  // YouTube's "Search transcript" box filters the caption list, so a copy made
  // while it holds text may be partial.
  function searchActive(panel) {
    // Modern layouts use a textarea for the search field, classic an input.
    const field = panel && panel.querySelector("input, textarea");
    return !!(field && field.value && field.value.trim());
  }

  // Captions as {ts, text}, with {chapter} markers where chapters begin.
  function collectSegments(preferredPanel) {
    if (!isWatchPage()) return [];
    const panel = pickPanel(preferredPanel);
    if (!panel) return [];
    const modern = !!panel.querySelector(SEG_MODERN);
    const chapterSel = modern ? CHAPTER_MODERN : CHAPTER_CLASSIC;
    const nodes = panel.querySelectorAll((modern ? SEG_MODERN : SEG_CLASSIC) + "," + chapterSel);
    const out = [];
    let captions = 0;
    nodes.forEach((node) => {
      if (node.matches(chapterSel)) {
        const title = cleanText((node.querySelector("h3, h2") || node).textContent);
        if (title) out.push({ chapter: title });
        return;
      }
      const s = readSegment(node, modern);
      if (s.text) {
        out.push(s);
        captions++;
      }
    });
    return captions ? out : [];
  }

  function transcriptStats(segments) {
    let words = 0;
    for (const s of segments) {
      if (s.text) words += s.text.split(/\s+/).filter(Boolean).length;
    }
    return { words, minutes: Math.max(1, Math.round(words / 200)) };
  }

  // ---- video metadata ---------------------------------------------------

  function videoTitle() {
    const el = document.querySelector(
      "h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string"
    );
    const t = el ? el.textContent : "";
    return cleanText(t || document.title.replace(/ - YouTube$/, ""));
  }

  function fmtDuration(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }

  function canonicalUrl() {
    const id = new URLSearchParams(location.search).get("v");
    return id ? location.origin + "/watch?v=" + id : location.origin + location.pathname;
  }

  function videoMeta() {
    const meta = { title: videoTitle(), url: canonicalUrl() };
    const ch = document.querySelector(
      "ytd-watch-metadata #owner ytd-channel-name a, #owner ytd-channel-name a, ytd-channel-name#channel-name a"
    );
    if (ch && ch.textContent.trim()) meta.channel = cleanText(ch.textContent);

    const v = document.querySelector("video.html5-main-video, video");
    if (v && isFinite(v.duration) && v.duration > 0) meta.duration = fmtDuration(v.duration);

    const infoEl = document.querySelector(
      "ytd-watch-info-text, ytd-watch-metadata #info-container, #info-container"
    );
    if (infoEl) {
      // Animated counters contain every digit in textContent, not just the value.
      const viewEl = infoEl.querySelector("#view-count");
      const t = cleanText(infoEl.innerText);
      const viewText = (viewEl && viewEl.getAttribute("aria-label")) || t;
      const vm = viewText.match(/([\d.,]+(?:[KMB])?)\s*views/i);
      if (vm) meta.views = vm[1].trim() + " views";
      const dm =
        t.match(/\b([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s*\d{4})\b/) ||
        t.match(/\b(\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4})\b/) ||
        t.match(/\b(\d+\s?[a-z]+\s+ago)\b/i); // "3 months ago" or compact "2w ago"
      if (dm) meta.date = dm[1].trim();
    }
    return meta;
  }

  function metaHeader(meta) {
    const line2 = [meta.channel, meta.duration, meta.views, meta.date]
      .filter(Boolean)
      .join(" · ");
    const lines = [meta.title];
    if (line2) lines.push(line2);
    lines.push(meta.url);
    return lines.join("\n");
  }

  function buildText(items, settings) {
    const render = (segs) => {
      if (settings.includeTimestamps) return segs.map((s) => (s.ts ? s.ts + " " + s.text : s.text)).join("\n");
      if (settings.oneLinePerCaption) return segs.map((s) => s.text).join("\n");
      return segs.map((s) => s.text).join(" ");
    };
    // Split into chapter sections. Videos without chapters form one section.
    const sections = [];
    let current = { title: null, segs: [] };
    for (const item of items) {
      if (item.chapter !== undefined) {
        if (current.segs.length) sections.push(current);
        current = { title: item.chapter, segs: [] };
      } else {
        current.segs.push(item);
      }
    }
    if (current.segs.length) sections.push(current);
    const withChapters = settings.includeChapters !== false;
    let body = withChapters
      ? sections.map((s) => (s.title ? s.title + "\n" : "") + render(s.segs)).join("\n\n")
      : render(sections.flatMap((s) => s.segs));
    if (settings.includeHeader) {
      body = metaHeader(videoMeta()) + "\n\n" + body;
    }
    return body;
  }

  // ---- clipboard + feedback ---------------------------------------------

  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      const previousFocus = document.activeElement;
      const selection = document.getSelection();
      const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
      ta.focus({ preventScroll: true });
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (_err) {
        ok = false;
      }
      ta.remove();
      if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      if (selection) {
        selection.removeAllRanges();
        ranges.forEach((range) => selection.addRange(range));
      }
      return ok;
    }
  }

  const flashTimers = new WeakMap();
  function flash(btn, message, isError) {
    // Keep the header width fixed; detailed stats belong in the toast.
    toast(message, isError);
    btn.classList.toggle("ytcopy-error", !!isError);
    btn.classList.toggle("ytcopy-done", !isError);
    clearTimeout(flashTimers.get(btn));
    flashTimers.set(btn, setTimeout(() => {
      btn.classList.remove("ytcopy-error", "ytcopy-done");
    }, 1800));
  }

  let toastEl = null;
  let toastTimer = null;
  function toast(message, isError) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "ytcopy-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.toggle("ytcopy-toast-error", !!isError);
    toastEl.classList.add("ytcopy-toast-show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("ytcopy-toast-show"), 2400);
  }

  function copiedLabel(stats, withRead, filtered) {
    const w = stats.words.toLocaleString() + (stats.words === 1 ? " word" : " words");
    const base = withRead ? "Copied " + w + " · ~" + stats.minutes + " min read" : "Copied " + w;
    return filtered ? base + " · search filter is on, clear it to copy everything" : base;
  }

  // In-panel button click: the panel is open, so segments are present.
  async function copyTranscript(btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    const version = navigationVersion;
    try {
      const panel = btn.closest("ytd-engagement-panel-section-list-renderer, ytd-transcript-renderer");
      const segments = collectSegments(panel);
      if (!segments.length) {
        flash(btn, "No transcript available", true);
        return;
      }
      const settings = await getSettings();
      if (version !== navigationVersion || !isWatchPage()) return;
      const text = buildText(segments, settings);
      const ok = await writeClipboard(text);
      flash(btn, ok ? copiedLabel(transcriptStats(segments), false, searchActive(panel)) : "Copy failed", !ok);
    } catch (_e) {
      flash(btn, "Copy failed", true);
    } finally {
      btn.disabled = false;
    }
  }

  // ---- one-action copy (popup / keyboard shortcut) ----------------------

  // Open the transcript panel if it isn't already; returns true if it tried.
  function triggerOpen() {
    // 1) The structured-description transcript section (locale-independent).
    const section = document.querySelector(
      "ytd-video-description-transcript-section-renderer"
    );
    let showBtn =
      section &&
      section.querySelector("button, ytd-button-renderer button, yt-button-shape button");

    // Limit fallback to the description and actual opening controls. A broad
    // "transcript" match also clicks our own Copy transcript button recursively.
    if (!showBtn) {
      const cands = document.querySelectorAll(
        'ytd-watch-metadata #description button, ytd-watch-metadata #description [role="button"]'
      );
      for (let i = 0; i < cands.length; i++) {
        const lbl = (
          cands[i].getAttribute("aria-label") ||
          cands[i].textContent ||
          ""
        ).toLowerCase();
        if (/^(show transcript|näytä litteraatti)$/.test(lbl.trim()) && isVisible(cands[i])) {
          showBtn = cands[i];
          break;
        }
      }
    }
    if (showBtn && !showBtn.disabled) {
      showBtn.click();
      return true;
    }

    return false;
  }

  let collectionPromise = null;
  async function ensureTranscriptAndCollect() {
    if (!isWatchPage()) return [];
    if (collectionPromise) return collectionPromise;
    const pending = loadTranscript();
    collectionPromise = pending;
    try {
      return await pending;
    } finally {
      if (collectionPromise === pending) collectionPromise = null;
    }
  }

  async function loadTranscript() {
    const version = navigationVersion;
    let segs = collectSegments();
    if (segs.length) return segs;
    let opened = triggerOpen();
    if (!opened) {
      const expand = document.querySelector("ytd-watch-metadata #description-inline-expander #expand");
      if (expand && isVisible(expand)) expand.click();
    }
    let signature = "";
    let stable = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      if (version !== navigationVersion || !isWatchPage()) return [];
      // Description content can be attached asynchronously after expansion.
      if (!opened) opened = triggerOpen();
      segs = collectSegments();
      const next = JSON.stringify(segs);
      stable = segs.length && next === signature ? stable + 1 : 0;
      signature = next;
      if (stable >= 3) return segs;
    }
    return []; // Do not report a still-changing partial transcript as complete.
  }

  async function handleCopyRequest(inPage) {
    if (!isWatchPage()) return { ok: false, reason: "not-video" };
    const version = navigationVersion;
    const segments = await ensureTranscriptAndCollect();
    if (version !== navigationVersion || !isWatchPage()) return { ok: false, reason: "navigated" };
    if (!segments.length) {
      if (inPage) toast("No transcript available", true);
      return { ok: false, reason: "no-transcript" };
    }
    const settings = await getSettings();
    if (version !== navigationVersion || !isWatchPage()) return { ok: false, reason: "navigated" };
    const text = buildText(segments, settings);
    const stats = transcriptStats(segments);
    const filtered = searchActive(pickPanel());
    if (inPage) {
      const ok = await writeClipboard(text);
      toast(ok ? copiedLabel(stats, true, filtered) : "Copy failed", !ok);
      return { ok, text, words: stats.words, minutes: stats.minutes, filtered, reason: ok ? null : "copy-failed" };
    }
    // The caller (popup) writes the clipboard from a focused context.
    return { ok: true, text, words: stats.words, minutes: stats.minutes, filtered, reason: null };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "COPY_TRANSCRIPT") {
      handleCopyRequest(!!msg.inPage)
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false, reason: "error" }));
      return true; // async response
    }
    return false;
  });

  // ---- button injection -------------------------------------------------

  function makeButton() {
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.className = "ytcopy-btn";
    btn.title = "Copy transcript to clipboard";
    btn.innerHTML =
      '<span class="ytcopy-icon">' + COPY_SVG + "</span>" +
      '<span class="ytcopy-label">Copy</span>';
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyTranscript(btn);
    });
    return btn;
  }

  function isVisible(el) {
    if (!el || el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function addPanelToolbar(panel, btn) {
    const toolbar = document.createElement("div");
    toolbar.className = "ytcopy-panel-toolbar";
    toolbar.appendChild(btn);
    panel.prepend(toolbar);
  }

  function injectInto(panel) {
    if (!panel || !isVisible(panel)) return;
    const th = panel.querySelector("ytd-engagement-panel-title-header-renderer");
    const anchor =
      th && (th.querySelector("#visibility-button") || th.querySelector("#menu"));
    const existing = panel.querySelector("#" + BTN_ID);
    if (existing) {
      // Captions can arrive before YouTube stamps the header. Once it exists,
      // move the button from the fallback toolbar to sit beside the close button.
      const bar = existing.closest(".ytcopy-panel-toolbar");
      if (bar && anchor && anchor.parentElement) {
        anchor.parentElement.insertBefore(existing, anchor);
        bar.remove();
      }
      return;
    }
    const btn = makeButton();
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(btn, anchor);
    } else if (th) {
      const row = th.querySelector("#header") || th;
      row.insertBefore(btn, row.firstChild);
    } else {
      addPanelToolbar(panel, btn);
    }
  }

  function transcriptPanels() {
    const panels = new Set();
    document.querySelectorAll(PANEL_SELECTOR).forEach((p) => panels.add(p));
    // Find one content root per panel instead of scanning every caption.
    document.querySelectorAll("ytd-engagement-panel-section-list-renderer, ytd-transcript-renderer").forEach((el) => {
      if (!el.querySelector(CONTENT_SELECTOR)) return;
      const panel =
        el.closest("ytd-engagement-panel-section-list-renderer") ||
        el.closest("ytd-transcript-renderer");
      if (panel) panels.add(panel);
    });
    return panels;
  }

  // ---- under-video actions-row button -----------------------------------

  const ACTIONS_BTN_ID = "ytcopy-actions-btn";

  function actionsRow() {
    return document.querySelector("ytd-watch-metadata #top-row");
  }

  async function handleActionCopy(btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    try {
      await handleCopyRequest(true);
    } catch (_e) {
      toast("Copy failed", true);
    } finally {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }

  function makeActionsButton() {
    const btn = document.createElement("button");
    btn.id = ACTIONS_BTN_ID;
    btn.type = "button";
    btn.className = "ytcopy-actions-btn";
    btn.title = "Copy this video's transcript";
    btn.innerHTML =
      '<span class="ytcopy-actions-icon">' + COPY_SVG + "</span>" +
      '<span class="ytcopy-actions-label">Copy transcript</span>';
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleActionCopy(btn);
    });
    return btn;
  }

  function injectActionsButton() {
    if (document.getElementById(ACTIONS_BTN_ID)) return;
    const row = actionsRow();
    if (!row) return;
    // A sibling of the top row does not participate in YouTube's native
    // non-wrapping action strip or its overflow measurements.
    const wrap = document.createElement("div");
    wrap.className = "ytcopy-actions-row";
    wrap.appendChild(makeActionsButton());
    row.insertAdjacentElement("afterend", wrap);
  }

  let scheduled = false;
  function scan() {
    scheduled = false;
    if (!alive()) return;
    if (!isWatchPage()) return;
    transcriptPanels().forEach(injectInto);
    injectActionsButton();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scan, 150);
  }

  const observer = new MutationObserver((records) => {
    // An orphaned instance stops watching; the fresh one takes over.
    if (!alive()) {
      observer.disconnect();
      return;
    }
    if (!isWatchPage()) return;
    const relevant = "ytd-watch-metadata, ytd-engagement-panel-section-list-renderer, ytd-transcript-renderer";
    if (records.some((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target && target.closest(".ytcopy-btn, .ytcopy-actions-row, .ytcopy-toast")) return false;
      if (target && target.closest(relevant)) return true;
      return [...record.addedNodes].some((node) => node instanceof Element &&
        (node.matches(relevant) || node.querySelector(relevant)));
    })) schedule();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["visibility"],
  });

  // YouTube is a single-page app, so re-check after in-app navigation too.
  document.addEventListener("yt-navigate-start", () => {
    navigating = true;
    navigationVersion++;
    collectionPromise = null;
    if (toastEl) toastEl.classList.remove("ytcopy-toast-show");
  });
  document.addEventListener("yt-navigate-finish", () => {
    navigating = false;
    schedule();
  });
  schedule();
})();
