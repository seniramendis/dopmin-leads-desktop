"""Full Scrapling port of client/src/main/scraper.js's Google Maps pipeline.

Two-phase design (unchanged from the JS original):
  Phase 1 (discovery) — scroll the results feed for the query and collect
  every unique place URL. Cheap: only anchor hrefs + aria-labels are read.

  Phase 2 (extraction) — visit each place's own detail page (in a pool of
  parallel pages) and read the sidebar directly. Every listing renders the
  same sidebar, which is what makes phone numbers and website presence
  trustworthy.
"""

import asyncio
import random
import re
import time
from urllib.parse import quote, urlencode, urljoin, urlparse, parse_qs, urlunparse

from scrapling.fetchers import AsyncStealthySession

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
    is_network_error,
    measure_connection_quality,
)
from query_expansion import expand_query, broaden_query

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


async def _page_text(page):
    try:
        return await page.evaluate("() => document.body?.innerText || ''")
    except Exception:
        return ""


async def _dismiss_consent(page):
    for selector in (
        'button:has-text("Accept all")',
        'button:has-text("I agree")',
        'form[action*="consent"] button',
    ):
        try:
            btn = await page.query_selector(selector)
            if btn:
                await btn.click(timeout=2000)
                await page.wait_for_timeout(1200)
                return
        except Exception:
            continue


async def _discovery_action(page, state, desired, on_progress, shared=None, global_desired=None):
    try:
        await page.wait_for_selector('div[role="feed"], div[role="main"]', timeout=15000)
    except Exception:
        pass

    if BLOCKED_RE.search(await _page_text(page)):
        state["blocked"] = True
        return

    await _dismiss_consent(page)
    await page.wait_for_timeout(1000)

    previous_count = 0
    stagnant_rounds = 0
    max_rounds = min(120, desired // 3 + 21)

    for _ in range(max_rounds):
        if shared is not None and global_desired is not None and len(shared["listings"]) >= global_desired:
            break

        try:
            feed_box = await page.query_selector('div[role="feed"]')
            if feed_box:
                box = await feed_box.bounding_box()
                if box:
                    await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                    await page.mouse.wheel(0, 1600)
        except Exception:
            pass

        try:
            current_count = await page.evaluate(
                """() => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) feed.scrollTop = feed.scrollHeight;
                    else window.scrollTo(0, document.body.scrollHeight);
                    return document.querySelectorAll('a[href*="/maps/place/"]').length;
                }"""
            )
        except Exception:
            current_count = previous_count

        on_progress({"phase": "discovering", "found": current_count, "target": desired})

        if current_count >= desired:
            break

        try:
            reached_end = await page.evaluate(
                "() => /you.?ve reached the end of the list/i.test(document.body?.innerText || '')"
            )
        except Exception:
            reached_end = False
        if reached_end:
            break

        if current_count <= previous_count:
            stagnant_rounds += 1
            if stagnant_rounds >= 4:
                break
        else:
            stagnant_rounds = 0

        previous_count = current_count
        await asyncio.sleep(random.uniform(0.3, 0.5))


async def _consent_only_action(page, _state, _desired, _on_progress):
    await _dismiss_consent(page)


async def _run_sub_query(session, sub_query, index, total, desired, shared, on_progress, health):
    if len(shared["listings"]) >= desired or shared["rate_limited"] or health.aborted:
        return
    global_desired = desired

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

    state = {"blocked": False}
    remaining = max(1, desired - len(shared["listings"]))

    async def action(page):
        await _discovery_action(
            page, state, remaining, on_progress, shared=shared, global_desired=global_desired
        )

    try:
        nav_start = time.monotonic()
        page = await session.fetch(
            search_url,
            page_action=action,
            timeout=60000,
            network_idle=False,
            wait=300,
        )
        health.record_success((time.monotonic() - nav_start) * 1000)
    except Exception as error:
        health.record_failure(str(error))
        return

    if state["blocked"] or BLOCKED_RE.search(page.get_all_text() or ""):
        if shared["listings"] or shared["launched"] > 1:
            shared["rate_limited"] = True
            return
        raise RateLimitedError()

    for anchor in page.css('a[href*="/maps/place/"]'):
        href = anchor.attrib.get("href")
        if not href:
            continue
        href = urljoin("https://www.google.com/maps/", href)
        key = canonical_place_key(href)
        if key in shared["listings"]:
            continue
        shared["listings"][key] = {"href": href, "quickName": anchor.attrib.get("aria-label", "")}


async def discover_listings(session, sub_queries, desired, on_progress, health, shared=None):
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
            await _run_sub_query(
                session, sub_query, i, len(sub_queries), desired, shared, on_progress, health
            )

    results = await asyncio.gather(
        *(guarded(q, i) for i, q in enumerate(sub_queries)), return_exceptions=True
    )
    for result in results:
        if isinstance(result, RateLimitedError):
            raise result

    return shared


def _text(selector):
    """Safely extracts text, bypassing Scrapling/selectolax API quirks."""
    if selector is None:
        return ""
    try:
        return selector.get_all_text(strip=True) or ""
    except AttributeError:
        try:
            return selector.text(strip=True) or ""
        except Exception:
            return ""


def parse_detail(page, listing):
    name = _text(page.css_first("h1"))

    phone = ""
    phone_btn = page.css_first('button[data-item-id^="phone:tel:"]') or page.css_first(
        'a[href^="tel:"]'
    )
    if phone_btn is not None:
        aria = phone_btn.attrib.get("aria-label", "")
        href = phone_btn.attrib.get("href", "")
        phone = (
            re.sub(r"^phone:\s*", "", aria, flags=re.I).strip()
            or _text(phone_btn)
            or href.replace("tel:", "").strip()
        )

    website_el = page.css_first('a[data-item-id="authority"]')
    website = website_el.attrib.get("href", "") if website_el is not None else ""

    address_btn = page.css_first('button[data-item-id="address"]')
    address = (
        re.sub(r"^address:\s*", "", address_btn.attrib.get("aria-label", ""), flags=re.I).strip()
        if address_btn is not None
        else ""
    )

    category = _text(page.css_first('button[jsaction*="category"]'))

    open_status = ""
    for span in page.css("span"):
        text = _text(span)
        if OPEN_STATUS_RE.match(text):
            open_status = text
            break

    rating = None
    review_count = 0
    for span in page.css("span[aria-label]"):
        label = span.attrib.get("aria-label", "")
        if re.match(r"^[\d.]+\s*star", label, re.I):
            rating_match = RATING_RE.search(label)
            review_match = REVIEWS_RE.search(label)
            rating = float(rating_match.group(1)) if rating_match else None
            review_count = int(review_match.group(1).replace(",", "")) if review_match else 0
            break

    return {
        "name": name,
        "phone": phone,
        "hasWebsite": website_el is not None,
        "website": website,
        "address": address,
        "category": category,
        "openStatus": open_status,
        "rating": rating,
        "reviewCount": review_count,
    }


async def extract_detail(session, listing, health, counters):
    attempt = 0
    last_error = ""

    while attempt <= MAX_DETAIL_RETRIES:
        if health.aborted:
            return {
                "success": False,
                "href": listing["href"],
                "quickName": listing["quickName"],
                "error": "Connection lost",
            }

        try:
            nav_start = time.monotonic()

            async def action(p):
                await _dismiss_consent(p)
                
                # Wait for the h1 to confirm the page has started loading
                try:
                    await p.wait_for_selector("h1", timeout=15000)
                except Exception:
                    pass
                
                # CRITICAL FIX: The Snapshot Race Condition.
                # Force Playwright to wait until the AJAX calls inject the data buttons (phone/website/address)
                # before allowing Scrapling to take the HTML snapshot.
                try:
                    for _ in range(20): # Poll for up to 10 seconds
                        is_hydrated = await p.evaluate('''() => {
                            const hasAddress = !!document.querySelector('button[data-item-id="address"]');
                            const hasPhone = !!document.querySelector('button[data-item-id^="phone:tel:"]') || !!document.querySelector('a[href^="tel:"]');
                            const hasWebsite = !!document.querySelector('a[data-item-id="authority"]');
                            const hasCategory = !!document.querySelector('button[jsaction*="category"]');
                            
                            // Return true if at least one piece of core metadata has rendered
                            return hasAddress || hasPhone || hasWebsite || hasCategory;
                        }''')
                        
                        if is_hydrated:
                            await p.wait_for_timeout(1000) # Give React 1 more second to finish appending classes
                            return
                        await p.wait_for_timeout(500)
                except Exception:
                    pass

            page = await session.fetch(
                with_locale(listing["href"]),
                page_action=action,
                timeout=45000, # Increased to 45s for safe buffer
                network_idle=False,
                wait=1000, # Give Scrapling 1 final second before snapping
            )
            health.record_success((time.monotonic() - nav_start) * 1000)

            if BLOCKED_RE.search(page.get_all_text() or ""):
                raise RuntimeError("Rate limited by Google Maps")

            detail = parse_detail(page, listing)

            has_any_detail = bool(
                detail["name"] or detail["address"] or detail["phone"] or detail["website"]
            )
            if not has_any_detail and attempt < MAX_DETAIL_RETRIES:
                last_error = "Detail page loaded but no business info was found"
                attempt += 1
                counters["retries"] += 1
                await asyncio.sleep(random.uniform(1.0, 2.0))
                continue

            return {
                "success": True,
                "href": listing["href"],
                "name": detail["name"] or listing["quickName"] or "Unnamed business",
                "phone": detail["phone"] or "",
                "hasWebsite": detail["hasWebsite"],
                "website": detail["website"],
                "address": detail["address"],
                "category": detail["category"],
                "openStatus": detail["openStatus"],
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

    return {
        "success": False,
        "href": listing["href"],
        "quickName": listing["quickName"],
        "error": last_error,
    }


async def run_detail_pool(session, listings, on_progress, health):
    # CRITICAL: Limit concurrency to 3
    semaphore = asyncio.Semaphore(3)
    counters = {"retries": 0, "completed": 0}
    total = len(listings)

    async def worker(listing):
        async with semaphore:
            if health.aborted:
                return None
            
            # CRITICAL: Jitter to avoid bot detection
            await asyncio.sleep(random.uniform(1.0, 2.5))
            
            result = await extract_detail(session, listing, health, counters)
            counters["completed"] += 1
            on_progress(
                {
                    "phase": "extracting",
                    "done": counters["completed"],
                    "total": total,
                    "retries": counters["retries"],
                }
            )
            await asyncio.sleep(random.uniform(0.5, 1.0))
            return result

    return await asyncio.gather(*(worker(listing) for listing in listings))


async def scrape_leads(query, max_results=20, options=None, on_progress=lambda payload: None):
    options = options or {}
    desired = max(1, min(500, int(max_results or 20)))
    sub_queries = expand_query(query, options.get("mode", ""))

    on_progress({"phase": "searching", "message": "Checking your internet connection…"})
    connection = await measure_connection_quality()
    if not connection["reachable"]:
        return {
            "success": False,
            "error": "No internet connection detected. Please check your connection and try again.",
            "errorType": "offline",
        }
    if connection["quality"] == "poor":
        on_progress(
            {
                "phase": "connection-slow",
                "message": f"Connection to Google is slow ({connection['latency_ms']:.0f}ms) — this search may take longer than usual.",
            }
        )

    health = NetworkHealth(
        on_progress=on_progress,
        slow_threshold_ms=SLOW_NAV_THRESHOLD_MS,
        max_consecutive_failures=MAX_CONSECUTIVE_NETWORK_FAILURES,
    )

    try:
        async with AsyncStealthySession(
            max_pages=3, 
            headless=True,
            disable_resources=False, 
            google_search=False, # CRITICAL: True alters Google's internal APIs
            hide_canvas=True,
            block_webrtc=True,
            locale="en-US",
            timeout=45000, 
        ) as session:
            shared = await discover_listings(session, sub_queries, desired, on_progress, health)
            listings = list(shared["listings"].values())
            is_expanded = shared["is_expanded"]
            rate_limited = shared["rate_limited"]

            queries_used = list(sub_queries)
            if not is_expanded and len(listings) < desired and not rate_limited and not health.aborted:
                broader_queries = broaden_query(sub_queries[0], sub_queries)
                if broader_queries:
                    on_progress(
                        {
                            "phase": "searching",
                            "message": f"Only found {len(listings)} — broadening the search to related categories nearby…",
                        }
                    )
                    shared["is_expanded"] = True
                    shared = await discover_listings(
                        session, broader_queries, desired, on_progress, health, shared=shared
                    )
                    listings = list(shared["listings"].values())
                    is_expanded = True
                    queries_used = sub_queries + broader_queries

            if health.aborted:
                return {
                    "success": False,
                    "error": "Your internet connection dropped mid-search. Please check your connection and try again.",
                    "errorType": "offline",
                }

            if not listings:
                return {
                    "success": True,
                    "leads": [],
                    "requested": desired,
                    "totalFound": 0,
                    "truncated": False,
                    "failedCount": 0,
                    "expanded": is_expanded,
                    "queriesUsed": queries_used,
                }

            target_listings = listings[:desired]
            on_progress({"phase": "extracting", "done": 0, "total": len(target_listings), "retries": 0})

            detail_results = await run_detail_pool(session, target_listings, on_progress, health)

            if health.aborted:
                return {
                    "success": False,
                    "error": "Your internet connection dropped mid-search. Please check your connection and try again.",
                    "errorType": "offline",
                }

            attempted = [r for r in detail_results if r]
            succeeded = [r for r in attempted if r.get("success")]
            failed_count = len(attempted) - len(succeeded)
            leads = [to_lead(raw, i) for i, raw in enumerate(succeeded)]

            on_progress({"phase": "done", "total": len(leads)})

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
        if is_network_error(str(error)):
            return {
                "success": False,
                "error": "Your internet connection dropped mid-search. Please check your connection and try again.",
                "errorType": "offline",
            }
        return {"success": False, "error": str(error)}