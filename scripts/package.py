"""Build the installable zip: dist/youtube-transcript-copy-v<version>.zip

The same zip is uploaded to the Chrome Web Store and attached to GitHub
releases. Only runtime files are included; docs, tests and scripts are not.
Usage: python scripts/package.py
"""
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "manifest.json",
    "background.js",
    "shared.js",
    "content.js",
    "content.css",
    "popup.html",
    "popup.js",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
]


def main():
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as fh:
        version = json.load(fh)["version"]
    missing = [f for f in FILES if not os.path.isfile(os.path.join(ROOT, *f.split("/")))]
    if missing:
        raise SystemExit("Missing files: " + ", ".join(missing))

    out_dir = os.path.join(ROOT, "dist")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"youtube-transcript-copy-v{version}.zip")
    # Forward-slash entry names with manifest.json at the root, as Chrome expects.
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in FILES:
            zf.write(os.path.join(ROOT, *f.split("/")), f)
    print(f"{out} ({os.path.getsize(out):,} bytes)")


if __name__ == "__main__":
    main()
