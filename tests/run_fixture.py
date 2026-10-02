"""Run the browser regression fixture headlessly and print the results.

Requires Node.js and Playwright for Python:
    pip install playwright && python -m playwright install chromium
Usage:
    python tests/run_fixture.py
Exits non-zero if any check fails.
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "http://127.0.0.1:8765/watch?v=fixture"


def main():
    server = subprocess.Popen(
        ["node", os.path.join(ROOT, "tests", "serve.cjs")],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    try:
        time.sleep(0.8)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(URL)
            page.wait_for_function("window.testResults !== undefined", timeout=20000)
            results = page.evaluate("window.testResults")
            browser.close()
    finally:
        server.terminate()

    for c in results["checks"]:
        print(("PASS " if c["pass"] else "FAIL ") + c["name"])
    if results.get("error"):
        print("ERROR", results["error"])
    print(f"\n{results['passed']} passed, {results['failed']} failed")
    sys.exit(1 if results["failed"] else 0)


if __name__ == "__main__":
    main()
