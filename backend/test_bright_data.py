"""
Standalone Bright Data connection test — run this directly, completely
outside the Dopmin app, to find out whether the problem is:
  (a) your Bright Data credentials / zone, or
  (b) the Dopmin app's own logic.

Usage:
    1. Put this file in your backend/ folder (next to .env).
    2. pip install playwright python-dotenv --break-system-packages
       (only if not already installed)
    3. python3 test_bright_data.py

It will print a timestamped log of every step: connecting to Bright Data,
opening Google Maps, waiting for results — so you can see exactly where
(and after how long) it hangs or fails.
"""
import asyncio
import os
import time
from dotenv import load_dotenv

load_dotenv()

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


async def main():
    endpoint = os.getenv("BRIGHT_DATA_WS_ENDPOINT")
    if not endpoint:
        log("FAIL: BRIGHT_DATA_WS_ENDPOINT not found in .env (checked current dir and parents).")
        log(f"      Current working dir: {os.getcwd()}")
        return

    # Don't print the raw endpoint (it contains your zone password) — just
    # confirm shape so you can sanity check it without leaking it in logs.
    masked = endpoint.split("@")[-1] if "@" in endpoint else "(unexpected format)"
    log(f"Found BRIGHT_DATA_WS_ENDPOINT. Host part: {masked}")
    if not endpoint.startswith("wss://") or "brd" not in endpoint:
        log("WARNING: this doesn't look like a typical Bright Data Scraping Browser "
            "endpoint (expected something like wss://brd-customer-...-zone-...:PASSWORD@brd.superproxy.io:9222). "
            "Double check you copied the *Scraping Browser* connection string, not a plain proxy one.")

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        log("Connecting to Bright Data (connect_over_cdp)...")
        t0 = time.monotonic()
        try:
            browser = await asyncio.wait_for(p.chromium.connect_over_cdp(endpoint), timeout=30)
        except Exception as e:
            log(f"FAIL: could not connect to Bright Data at all: {e}")
            log("      -> This points to a Bright Data account/zone problem: wrong credentials, "
                "zone paused, trial expired, or wrong product type (must be 'Scraping Browser', "
                "not a plain residential/datacenter proxy).")
            return
        log(f"Connected in {time.monotonic() - t0:.1f}s.")

        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()

        log("Navigating to Google Maps search (60s timeout, same as the app)...")
        t0 = time.monotonic()
        try:
            await page.goto(
                "https://www.google.com/maps/search/restaurants+in+colombo?hl=en",
                timeout=60000,
                wait_until="domcontentloaded",
            )
            log(f"Page loaded in {time.monotonic() - t0:.1f}s.")
        except Exception as e:
            log(f"FAIL: navigation timed out/errored after {time.monotonic() - t0:.1f}s: {e}")
            log("      -> This means Bright Data connects fine, but can't actually load Google "
                "Maps in time. That's a Bright Data unblocking issue for this specific site, not "
                "an app bug. Worth raising with Bright Data support / checking their Maps-specific docs.")
            await browser.close()
            return

        log("Checking for a 'blocked' / anti-bot page...")
        text = await page.evaluate("() => document.body?.innerText || ''")
        if "unusual traffic" in text.lower() or "automated queries" in text.lower():
            log("FAIL: Google served an anti-bot page even through Bright Data.")
            await browser.close()
            return

        log("Waiting for the results feed to render...")
        t0 = time.monotonic()
        try:
            await page.wait_for_selector('div[role="feed"], div[role="main"]', timeout=15000)
            log(f"Feed appeared in {time.monotonic() - t0:.1f}s. SUCCESS — Bright Data + Google Maps works.")
        except Exception as e:
            log(f"FAIL: feed never appeared after {time.monotonic() - t0:.1f}s: {e}")
            log("      -> Page loaded but Maps' JS never fully hydrated through this proxy.")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())