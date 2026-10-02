# Changelog

## 1.3.0

- Works in YouTube tabs that were already open when the extension was
  installed or updated. The popup and keyboard shortcut now inject the
  content script on demand instead of asking you to reload the tab.
- Controls left behind by an older version after an update are replaced, and
  the old instance stops running.
- Chapter headings: when a video has chapters, their titles are copied as
  section headings. On by default, can be turned off in the popup. Headings
  are not counted in the word count.
- The transcript panel Copy button now always ends up next to the close
  button, even when captions load before YouTube draws the panel header.
- Warns when the transcript search box is filtering captions, since the copy
  may then be partial.
- The popup shows the keyboard shortcut that is actually assigned, or that
  none is set.
- Video info now includes compact upload dates such as "2w ago".
- Clearer popup error messages.

## 1.2.x

- "Copy transcript" button on its own line beneath the video's action buttons,
  readable in light and dark themes.
- Hardening: no layout shifts on feedback, scoped transcript reading, safe
  behaviour across YouTube navigation, focus-preserving clipboard fallback.
- Browser regression fixture in `tests/`.

## 1.1.0

- One-action copy from the toolbar popup and a keyboard shortcut
  (Alt+Shift+C), opening the transcript automatically.
- Optional video info header, and word count plus reading time in the
  feedback.

## 1.0.0

- Copy button in YouTube's transcript panel, supporting both the classic and
  the 2026 transcript layouts.
