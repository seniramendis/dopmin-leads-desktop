"""Pure Playwright port of client/src/main/scraper.js's Google Maps pipeline.
Scrapling has been completely removed to fix SPA hydration race conditions.
"""

import sys
import io

# CRITICAL FIX: Force UTF-8 output for Windows console / Node IPC 
# This prevents the 'charmap' crash when Google Maps returns \u202f spaces in prices/reviews.
if sys.stdout and hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import asyncio
import random
import re
import time
from urllib.parse import quote, urlencode, urljoin, urlparse, parse_qs, urlunparse

from playwright.async_api import async_playwright

from constants import (
    REPUTATION_THRESHOLDS,
    DETAIL_CONCURRENCY,
    DISCOVERY_CONCURRENCY,
    MAX_DETAIL_RETRIES,
    NAV_TIMEOUT_MS,
    SLOW_NAV_THRESHOLD_MS,
    MAX_CONSECUTIVE_NETWORK_FAILURES,
)
from netutil import (
    NetworkHealth,
    is_offline_error,
    is_stall_error,
    measure_connection_quality,
)
from query_expansion import expand_query, broaden_query

async def block_maps_resources(route):
    """Blocks heavy media but allows Maps SPA to hydrate (keeps stylesheets/scripts)."""
    if route.request.resource_type() in ("image", "media", "font"):
        await route.abort()
    else:
        await route.continue_()


BLOCKED_RE = re.compile(r"unusual traffic|automated queries|our systems have detected", re.I)
RATING_RE = re.compile(r"([\d.]+)\s*star", re.I)
REVIEWS_RE = re.compile(r"([\d,]+)\s*review", re.I)
OPEN_STATUS_RE = re.compile(r"^(open|closed|opens|closes)\b", re.I)

PLACE_ID_RE = re.compile(r"!1s(0x[0-9a-f]+:0x[0-9a-f]+)", re.I)


def canonical_place_key(href):
    match = PLACE_ID_RE.search(href or "")
    if match:
        return match.group(1)
    try:
        parsed = urlparse(href)
        return parsed.path  
    except Exception:
        return href


class RateLimitedError(Exception):
    def __init__(self):
        super().__init__("Google temporarily rate-limited this search. Wait a bit and try again.")


def classify_reputation(rating):
    if rating is None:
        return "unrated"
    if rating >= REPUTATION_THRESHOLDS["excellent"]:
        return "excellent"
    if rating >= REPUTATION_THRESHOLDS["good"]:
        return "good"
    if rating >= REPUTATION_THRESHOLDS["average"]:
        return "average"
    return "poor"


def with_locale(href):
    try:
        if not re.match(r"^https?://", href or "", re.I):
            href = urljoin("https://www.google.com/maps/", href or "")
        parts = urlparse(href)
        query = parse_qs(parts.query)
        query["hl"] = ["en"]
        return urlunparse(parts._replace(query=urlencode(query, doseq=True)))
    except Exception:
        return href


def clean_text(text):
    """Failsafe to scrub unicode spaces if the IO wrapper misses them."""
    if not text: return ""
    return str(text).replace('\u202f', ' ').replace('\xa0', ' ').strip()


async def _dismiss_consent(page):
    for selector in (
        'button:has-text("Accept all")',
        'button:has-text("I agree")',
        'form[action*="consent"] button',
    ):
        try:
            btn = page.locator(selector).first
            if await btn.is_visible(timeout=1000):
                await btn.click(timeout=2000)
                await page.wait_for_timeout(1000)
                return
        except Exception:
            continue


async def _run_sub_query(browser, sub_query, index, total, desired, shared, on_progress, health):
    if len(shared["listings"]) >= desired or shared["rate_limited"] or health.aborted:
        return
    
    shared["launched"] += 1
    search_url = f"https://www.google.com/maps/search/{quote(sub_query)}?hl=en"

    is_expanded = shared["is_expanded"]
    on_progress(
        {
            "phase": "searching",
            "message": (
                f'Broadening the search — trying "{sub_query}" ({index + 1}/{total})…'
                if is_expanded
                else f'Opening Google Maps for "{sub_query}"…'
            ),
        }
    )

    context = await browser.new_context(viewport={"width": 1920, "height": 1080})
    await context.route("**/*", block_maps_resources)
    page = await context.new_page()
    
    try:
        nav_start = time.monotonic()
        await page.goto(search_url, timeout=60000, wait_until="domcontentloaded")
        health.record_success((time.monotonic() - nav_start) * 1000)
        
        page_text = await page.evaluate("() => document.body?.innerText || ''")
        if BLOCKED_RE.search(page_text):
            shared["rate_limited"] = True
            raise RateLimitedError()

        await _dismiss_consent(page)
        
        try:
            await page.wait_for_selector('div[role="feed"], div[role="main"]', timeout=15000)
        except Exception:
            pass

        previous_count = 0
        stagnant_rounds = 0
        max_rounds = min(120, desired // 3 + 21)

        for _ in range(max_rounds):
            if len(shared["listings"]) >= desired:
                break

            try:
                feed_box = page.locator('div[role="feed"]').first
                if await feed_box.is_visible():
                    await feed_box.hover()
                    await page.mouse.wheel(0, 1600)
            except Exception:
                pass

            try:
                current_count = await page.evaluate("""() => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) feed.scrollTop = feed.scrollHeight;
                    else window.scrollTo(0, document.body.scrollHeight);
                    return document.querySelectorAll('a[href*="/maps/place/"]').length;
                }""")
            except Exception:
                current_count = previous_count

            on_progress({"phase": "discovering", "found": current_count, "target": desired})

            if current_count >= desired:
                break

            try:
                reached_end = await page.evaluate("() => /you.?ve reached the end of the list/i.test(document.body?.innerText || '')")
                if reached_end:
                    break
            except Exception:
                pass

            if current_count <= previous_count:
                stagnant_rounds += 1
                if stagnant_rounds >= 4:
                    break
            else:
                stagnant_rounds = 0

            previous_count = current_count
            await asyncio.sleep(random.uniform(0.3, 0.5))

        anchors = await page.locator('a[href*="/maps/place/"]').all()
        for anchor in anchors:
            href = await anchor.get_attribute("href")
            if not href: continue
            href = urljoin("https://www.google.com/maps/", href)
            key = canonical_place_key(href)
            if key in shared["listings"]: continue
            shared["listings"][key] = {"href": href, "quickName": clean_text(await anchor.get_attribute("aria-label"))}

    except RateLimitedError as e:
        raise e
    except Exception as error:
        health.record_failure(str(error))
    finally:
        await context.close()


async def discover_listings(browser, sub_queries, desired, on_progress, health, shared=None):
    if shared is None:
        shared = {
            "listings": {},
            "rate_limited": False,
            "launched": 0,
            "is_expanded": len(sub_queries) > 1,
        }

    semaphore = asyncio.Semaphore(DISCOVERY_CONCURRENCY if shared["is_expanded"] else 1)

    async def guarded(sub_query, i):
        async with semaphore:
            await _run_sub_query(browser, sub_query, i, len(sub_queries), desired, shared, on_progress, health)

    results = await asyncio.gather(*(guarded(q, i) for i, q in enumerate(sub_queries)), return_exceptions=True)
    for result in results:
        if isinstance(result, RateLimitedError):
            raise result

    return shared


async def extract_detail(browser, listing, health, counters):
    attempt = 0
    last_error = ""

    while attempt <= MAX_DETAIL_RETRIES:
        if health.aborted:
            return {"success": False, "href": listing["href"], "quickName": listing["quickName"], "error": "Connection lost"}

        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        await context.route("**/*", block_maps_resources)
        page = await context.new_page()

        try:
            nav_start = time.monotonic()
            await page.goto(with_locale(listing["href"]), timeout=45000, wait_until="domcontentloaded")
            health.record_success((time.monotonic() - nav_start) * 1000)

            await _dismiss_consent(page)

            page_text = await page.evaluate("() => document.body?.innerText || ''")
            if BLOCKED_RE.search(page_text):
                raise RateLimitedError()

            try:
                await page.wait_for_selector('h1, button[data-item-id="address"]', timeout=15000)
                await page.wait_for_timeout(1500) 
            except Exception:
                pass

            detail = await page.evaluate('''() => {
                const getText = (el) => el ? el.innerText.trim() : "";
                const getAttr = (el, attr) => el ? el.getAttribute(attr) || "" : "";

                const name = getText(document.querySelector('h1'));

                let phone = "";
                const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]') || document.querySelector('a[href^="tel:"]');
                if (phoneBtn) {
                    phone = getAttr(phoneBtn, 'aria-label').replace(/^phone:\\s*/i, '').trim() || getText(phoneBtn) || getAttr(phoneBtn, 'href').replace('tel:', '').trim();
                }

                const websiteEl = document.querySelector('a[data-item-id="authority"]');
                const website = getAttr(websiteEl, 'href');

                const addressBtn = document.querySelector('button[data-item-id="address"]');
                const address = getAttr(addressBtn, 'aria-label').replace(/^address:\\s*/i, '').trim();

                const category = getText(document.querySelector('button[jsaction*="category"]'));

                let openStatus = "";
                for (const span of document.querySelectorAll('span')) {
                    const txt = getText(span);
                    if (/^(open|closed|opens|closes)\\b/i.test(txt)) {
                        openStatus = txt;
                        break;
                    }
                }

                let rating = null;
                let reviewCount = 0;
                for (const span of document.querySelectorAll('span[aria-label]')) {
                    const label = getAttr(span, 'aria-label');
                    if (/^[\\d.]+\\s*star/i.test(label)) {
                        const rMatch = label.match(/([\\d.]+)\\s*star/i);
                        const revMatch = label.match(/([\\d,]+)\\s*review/i);
                        if (rMatch) rating = parseFloat(rMatch[1]);
                        if (revMatch) reviewCount = parseInt(revMatch[1].replace(/,/g, ''), 10);
                        break;
                    }
                }

                return {
                    name, phone, hasWebsite: !!websiteEl, website, address, category, openStatus, rating, reviewCount
                };
            }''')

            has_any_detail = bool(detail["name"] or detail["address"] or detail["phone"] or detail["website"])
            
            if not has_any_detail and attempt < MAX_DETAIL_RETRIES:
                last_error = "Detail page loaded but no business info was found"
                attempt += 1
                counters["retries"] += 1
                await asyncio.sleep(random.uniform(1.0, 2.0))
                continue

            return {
                "success": True,
                "href": listing["href"],
                "name": clean_text(detail["name"]) or listing["quickName"] or "Unnamed business",
                "phone": clean_text(detail["phone"]),
                "hasWebsite": detail["hasWebsite"],
                "website": detail["website"],
                "address": clean_text(detail["address"]),
                "category": clean_text(detail["category"]),
                "openStatus": clean_text(detail["openStatus"]),
                "rating": detail["rating"],
                "reviewCount": detail["reviewCount"],
            }

        except Exception as error:
            last_error = str(error)
            health.record_failure(str(error))
            attempt += 1
            counters["retries"] += 1
            if health.aborted:
                break
            if attempt <= MAX_DETAIL_RETRIES:
                await asyncio.sleep(random.uniform(1.0, 2.0))
        finally:
            await context.close()

    return {"success": False, "href": listing["href"], "quickName": listing["quickName"], "error": last_error}


async def run_detail_pool(browser, listings, on_progress, health):
    semaphore = asyncio.Semaphore(3) 
    counters = {"retries": 0, "completed": 0}
    total = len(listings)

    async def worker(listing):
        async with semaphore:
            if health.aborted: return None
            await asyncio.sleep(random.uniform(0.5, 1.5))
            result = await extract_detail(browser, listing, health, counters)
            counters["completed"] += 1
            on_progress({"phase": "extracting", "done": counters["completed"], "total": total, "retries": counters["retries"]})
            return result

    return await asyncio.gather(*(worker(listing) for listing in listings))


def to_lead(raw, index):
    rating = raw["rating"] if isinstance(raw.get("rating"), (int, float)) else None
    reputation = classify_reputation(rating)
    has_rating = rating is not None

    return {
        "id": f"{int(time.time() * 1000)}-{index}",
        "name": raw["name"],
        "phone": raw.get("phone") or "No phone listed",
        "address": raw.get("address") or "",
        "category": raw.get("category") or "",
        "openStatus": raw.get("openStatus") or "",
        "status": "Has Website" if raw["hasWebsite"] else "No Website Found",
        "hasWebsite": raw["hasWebsite"],
        "website": raw.get("website") or "",
        "rating": rating,
        "reviewCount": raw.get("reviewCount", 0),
        "reputation": reputation,
        "isHotLead": (not raw["hasWebsite"]) and has_rating and rating >= REPUTATION_THRESHOLDS["good"],
        "isReputationRisk": (not raw["hasWebsite"]) and has_rating and rating < 3.5,
        "mapsUrl": raw["href"],
    }


def _abort_result(health):
    """Builds the error result from whatever NetworkHealth actually recorded,
    instead of a single hardcoded "Connection dropped mid-search" string
    that used to fire for plain navigation timeouts (Google throttling an
    automated browser, local CPU contention) exactly the same as a real
    dropped connection. errorType now reflects which one actually
    happened."""
    return {
        "success": False,
        "error": health.abort_message or "The search stopped unexpectedly. Please try again.",
        "errorType": health.abort_reason or "offline",
    }


async def scrape_leads(query, max_results=20, options=None, on_progress=lambda payload: None):
    options = options or {}
    desired = max(1, min(500, int(max_results or 20)))
    sub_queries = expand_query(query, options.get("mode", ""))

    on_progress({"phase": "searching", "message": "Checking your internet connection…"})
    connection = await measure_connection_quality()
    if not connection["reachable"]:
        return {"success": False, "error": "No internet connection detected.", "errorType": "offline"}
    if connection["quality"] == "poor":
        on_progress({"phase": "connection-slow", "message": f"Connection is slow ({connection['latency_ms']:.0f}ms)."})

    health = NetworkHealth(on_progress=on_progress, slow_threshold_ms=SLOW_NAV_THRESHOLD_MS, max_consecutive_failures=MAX_CONSECUTIVE_NETWORK_FAILURES)

    try:
        async with async_playwright() as p:
            # SHUTTING THE VISUAL TABS DOWN - HEADLESS IS TRUE AGAIN
            browser = await p.chromium.launch(
                headless=True, 
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    '--no-sandbox',
                ]
            )

            shared = await discover_listings(browser, sub_queries, desired, on_progress, health)
            listings = list(shared["listings"].values())
            is_expanded = shared["is_expanded"]
            rate_limited = shared["rate_limited"]

            queries_used = list(sub_queries)
            if not is_expanded and len(listings) < desired and not rate_limited and not health.aborted:
                broader_queries = broaden_query(sub_queries[0], sub_queries)
                if broader_queries:
                    on_progress({"phase": "searching", "message": f"Only found {len(listings)} — broadening search…"})
                    shared["is_expanded"] = True
                    shared = await discover_listings(browser, broader_queries, desired, on_progress, health, shared=shared)
                    listings = list(shared["listings"].values())
                    is_expanded = True
                    queries_used = sub_queries + broader_queries

            if health.aborted: return _abort_result(health)
            if not listings: return {"success": True, "leads": [], "requested": desired, "totalFound": 0, "truncated": False, "failedCount": 0, "expanded": is_expanded, "queriesUsed": queries_used}

            target_listings = listings[:desired]
            on_progress({"phase": "extracting", "done": 0, "total": len(target_listings), "retries": 0})

            detail_results = await run_detail_pool(browser, target_listings, on_progress, health)

            if health.aborted: return _abort_result(health)

            attempted = [r for r in detail_results if r]
            succeeded = [r for r in attempted if r.get("success")]
            failed_count = len(attempted) - len(succeeded)
            leads = [to_lead(raw, i) for i, raw in enumerate(succeeded)]

            on_progress({"phase": "done", "total": len(leads)})

            await browser.close()

            return {
                "success": True,
                "leads": leads,
                "requested": desired,
                "totalFound": len(listings),
                "truncated": len(listings) > desired,
                "failedCount": failed_count,
                "expanded": is_expanded,
                "queriesUsed": queries_used,
            }
    except RateLimitedError as error:
        return {"success": False, "error": str(error)}
    except Exception as error:
        message = str(error)
        if is_offline_error(message):
            return {"success": False, "error": "Lost the internet connection. Please check your connection and try again.", "errorType": "offline"}
        if is_stall_error(message):
            return {
                "success": False,
                "error": (
                    "Google Maps stopped responding to page loads. This usually means Google is temporarily "
                    "rate-limiting automated searches, not a dropped connection — wait a few minutes and try again."
                ),
                "errorType": "stalled",
            }
        return {"success": False, "error": message}