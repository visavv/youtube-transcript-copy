# YouTube Transcript Copy

Copy the full transcript of any YouTube video with one click.

![Copy transcript button under a YouTube video](docs/screenshots/copy-button.png)

## Features

- **Copy transcript** button under every video. No need to open the transcript first.
- Also copy from the transcript panel, the toolbar popup, or a keyboard shortcut (Alt+Shift+C).
- Plain paragraphs, one line per caption, or timestamps.
- Chapter titles included when the video has chapters.
- Optional video info: title, channel, length, views, date and link.
- Shows how many words were copied.
- Works offline in your browser. No tracking, no data sent anywhere.

## Screenshots

One click copies the whole transcript:

![Copied 14,037 words](docs/screenshots/one-click-result.png)

Copy button in the transcript panel:

<img src="docs/screenshots/transcript-panel.png" alt="Copy button in the transcript panel" width="400">

What gets copied, in each format:

![Copied text in each format](docs/screenshots/copied-text.png)

Settings:

<img src="docs/screenshots/popup.png" alt="Settings popup" width="300">

## Install

Works in Chrome, Edge, Brave and other Chromium browsers. A Chrome Web Store version is coming.

1. Download the latest zip from [Releases](https://github.com/visavv/youtube-transcript-copy/releases/latest).
2. Unzip it into a folder you will keep.
3. Open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder.

To change the shortcut, go to `chrome://extensions/shortcuts`.

To update, replace the folder with the new release and click the reload icon on the extension in `chrome://extensions`.

## Use

Open a YouTube video and click **Copy transcript** under it (or press Alt+Shift+C). Then paste anywhere.

## Settings

Click the extension icon in the toolbar:

| Setting | Effect |
|---|---|
| Include timestamps | Each line starts with its time, e.g. `0:42` |
| One line per caption | Each caption on its own line |
| Chapter headings | Chapter titles above each section (on by default) |
| Add video info | Title, channel, length, views, date and link at the top |

## Permissions

| Permission | Why |
|---|---|
| youtube.com | Adds the buttons and reads the transcript on the page |
| Clipboard | Copies the transcript |
| Storage | Saves your settings |
| Active tab, scripting | Lets the popup and shortcut work in tabs opened before install |

## Limitations

- Clear the transcript search box before copying, or only matching lines are copied.
- Regular videos only. Shorts are not supported yet.
- If YouTube changes its layout and the buttons disappear, please open an issue.

## Development

No build step. Load the folder unpacked, edit, then reload the extension and the YouTube tab.

- Tests: `python tests/run_fixture.py` (needs Node.js and `pip install playwright`)
- Package: `python scripts/package.py` creates the zip in `dist/`

## License

[MIT](LICENSE). Not affiliated with YouTube or Google. Screenshots show a public video by Josh Strife Hayes.
