"""Full Scrapling port of client/src/main/scraper.js's Google Maps pipeline.

Two-phase design (unchanged from the JS original):
  Phase 1 (discovery) — scroll the results feed for the query and collect
  every unique place URL. Cheap: only anchor hrefs + aria-labels are read.

  Phase 2 (extraction) — visit each place's own detail page (in a pool of
  parallel pages) and read the sidebar directly. Every listing renders the
  same sidebar, which is what makes phone numbers and website presence
  trustworthy.

What changed vs the JS version — everything runs on Scrapling now:
  * AsyncStealthySession replaces hand-rolled chromium.launch + context:
    an anti-detect stealth browser with a persistent profile, a real
    browser-matched User-Agent, Google referer headers, canvas-noise and
    WebRTC-leak protections — all built in instead of hand-configured.
  * max_pages=DETAIL_CONCURRENCY gives a managed page pool, replacing the
    hand-written mapWithConcurrency/pool code.
  * disable_resources=True replaces the manual route() interception that
    blocked images/fonts/media/stylesheets.
  * Data extraction uses Scrapling's Selector API (css/css_first/attrib/
    get_all_text) on the returned Response instead of page.evaluate blobs.
  * Interactive bits (consent dismissal, feed scrolling) run inside
    Scrapling's page_action hook, which receives the underlying Playwright
    page after navigation.

NOTE: Scrapling swallows exceptions raised inside page_action (they're
logged, not re-raised), so actions communicate back through the `state`
dict closure instead of throwing.
"""

import asyncio
import random
import re
import time
from urllib.parse import quote, urlencode, urlparse, parse_qs, urlunparse

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
    check_internet_connection,
    is_network_error,
)
from query_expansion import expand_query, broaden_query

BLOCKED_RE = re.compile(r"unusual traffic|automated queries|our systems have detected", re.I)
RATING_RE = re.compile(r"([\d.]+)\s*star", re.I)
REVIEWS_RE = re.compile(r"([\d,]+)\s*review", re.I)
OPEN_STATUS_RE = re.compile(r"^(open|closed|opens|closes)\b", re.I)


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
    """Forces English on any Maps URL so the parsing logic behaves the same
    no matter which country/city the search targets."""
    try:
        parts = urlparse(href)
        query = parse_qs(parts.query)
        query["hl"] = ["en"]
        return urlunparse(parts._replace(query=urlencode(query, doseq=True)))
    except Exception:
        return href


# ---------------------------------------------------------------------------
# Browser-side actions (run inside Scrapling's page_action hook)
# ---------------------------------------------------------------------------


async def _page_text(page):
    try:
        return await page.evaluate("() => document.body?.innerText || ''")
    except Exception:
        return ""


async def _dismiss_consent(page):
    """Google occasionally shows an EU/UK cookie-consent interstitial before
    the app loads. Non-fatal when absent."""
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


async def _discovery_action(page, state, desired, on_progress):
    """Scrolls the Google Maps results feed until we have `desired` unique
    place URLs, Google's own "end of the list" marker appears, or the feed
    stops growing for several rounds in a row. Uses both a real wheel event
    and a direct scrollTop nudge every round, since Maps' lazy loading
    responds more reliably to genuine scroll input."""
    try:
        await page.wait_for_selector('div[role="feed"], div[role="main"]', timeout=15000)
    except Exception:
        pass

    if BLOCKED_RE.search(await _page_text(page)):
        state["blocked"] = True
        return

    await _dismiss_consent(page)
    await page.wait_for_timeout(1500)

    previous_count = 0
    stagnant_rounds = 0
    max_rounds = min(120, desired // 3 + 21)

    for _ in range(max_rounds):
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
        # With resources disabled the feed re-renders much faster, so a
        # short jittered wait keeps the scroll loop safe from bot detection
        # without long idle stretches.
        await asyncio.sleep(random.uniform(0.5, 0.8))


async def _consent_only_action(page, _state, _desired, _on_progress):
    await _dismiss_consent(page)


# ---------------------------------------------------------------------------
# Phase 1 — discovery
# ---------------------------------------------------------------------------


async def _run_sub_query(session, sub_query, index, total, desired, shared, on_progress, health):
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

    state = {"blocked": False}
    remaining = max(1, desired - len(shared["listings"]))

    async def action(page):
        await _discovery_action(page, state, remaining, on_progress)

    try:
        nav_start = time.monotonic()
        page = await session.fetch(
            search_url,
            page_action=action,
            timeout=60000,
            network_idle=False,
            wait=500,
        )
        health.record_success((time.monotonic() - nav_start) * 1000)
    except Exception as error:
        health.record_failure(str(error))
        # One sub-query failing shouldn't kill the whole search.
        return

    if state["blocked"] or BLOCKED_RE.search(page.get_all_text() or ""):
        if shared["listings"] or shared["launched"] > 1:
            shared["rate_limited"] = True
            return
        raise RateLimitedError()

    # Parse the result cards straight off Scrapling's Response — the feed is
    # fully scrolled by the time page_action returns, so every loaded anchor
    # is present in the final DOM snapshot.
    for anchor in page.css('a[href*="/maps/place/"]'):
        href = anchor.attrib.get("href")
        if not href or href in shared["seen"]:
            continue
        shared["seen"].add(href)
        shared["listings"].append({"href": href, "quickName": anchor.attrib.get("aria-label", "")})


async def discover_listings(session, sub_queries, desired, on_progress, health, shared=None):
    """Runs discovery across every sub-query, deduping by href, stopping as
    soon as `desired` unique listings are found (or every sub-query ran)."""
    if shared is None:
        shared = {
            "listings": [],
            "seen": set(),
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


# ---------------------------------------------------------------------------
# Phase 2 — detail extraction (parsed with Scrapling's Selector API)
# ---------------------------------------------------------------------------


def _text(selector):
    return (selector.get_all_text(strip=True) or "") if selector is not None else ""


def parse_detail(page, listing):
    """Reads one place's detail sidebar off the Scrapling Response."""
    name = _text(page.css_first("h1"))

    # Phone: Google renders a dedicated button whose data-item-id always
    # starts with "phone:tel:" — stable for years even as class names churn.
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

    # Website: data-item-id "authority" is Google's stable hook for the
    # official website link on a place page.
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
        text = (span.text or "").strip()
        if OPEN_STATUS_RE.match(text):
            open_status = text
            break

    # "X.X stars, N reviews"-style aria-label near the title — far more
    # stable across Google's UI churn than star icons or class names.
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

            async def action(page):
                await _dismiss_consent(page)

            page = await session.fetch(
                with_locale(listing["href"]),
                page_action=action,
                wait_selector="h1",
                timeout=NAV_TIMEOUT_MS,
                network_idle=False,
                wait=500,
            )
            health.record_success((time.monotonic() - nav_start) * 1000)

            if BLOCKED_RE.search(page.get_all_text() or ""):
                raise RuntimeError("Rate limited by Google Maps")

            detail = parse_detail(page, listing)
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
                await asyncio.sleep(random.uniform(0.7, 1.3))

    return {
        "success": False,
        "href": listing["href"],
        "quickName": listing["quickName"],
        "error": last_error,
    }


async def run_detail_pool(session, listings, on_progress, health):
    """Reads every listing's detail page through the session's page pool.
    The pool (max_pages=DETAIL_CONCURRENCY) is the real throttle; the
    semaphore mirrors the old JS pool's back-pressure so progress events
    stay ordered and retries don't stampede."""
    semaphore = asyncio.Semaphore(DETAIL_CONCURRENCY)
    counters = {"retries": 0, "completed": 0}
    total = len(listings)

    async def worker(listing):
        async with semaphore:
            if health.aborted:
                return None
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
            await asyncio.sleep(random.uniform(0.08, 0.2))
            return result

    return await asyncio.gather(*(worker(listing) for listing in listings))


# ---------------------------------------------------------------------------
# Result shaping (identical to the JS toLead())
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def scrape_leads(query, max_results=20, options=None, on_progress=lambda payload: None):
    options = options or {}
    desired = max(1, min(500, int(max_results or 20)))
    sub_queries = expand_query(query, options.get("mode", ""))

    # Fail fast with no connection instead of watching every navigation
    # time out one by one.
    on_progress({"phase": "searching", "message": "Checking your internet connection…"})
    if not await check_internet_connection():
        return {
            "success": False,
            "error": "No internet connection detected. Please check your connection and try again.",
            "errorType": "offline",
        }

    health = NetworkHealth(
        on_progress=on_progress,
        slow_threshold_ms=SLOW_NAV_THRESHOLD_MS,
        max_consecutive_failures=MAX_CONSECUTIVE_NETWORK_FAILURES,
    )

    try:
        # One stealth session for the whole run: persistent profile (consent
        # dismissed once stays dismissed), page pool = detail concurrency,
        # heavy resources dropped session-wide for speed.
        async with AsyncStealthySession(
            max_pages=DETAIL_CONCURRENCY,
            headless=True,
            disable_resources=True,
            google_search=True,
            hide_canvas=True,
            block_webrtc=True,
            locale="en-US",
            timeout=NAV_TIMEOUT_MS,
        ) as session:
            shared = await discover_listings(session, sub_queries, desired, on_progress, health)
            listings = shared["listings"]
            is_expanded = shared["is_expanded"]
            rate_limited = shared["rate_limited"]

            # The user's own query ("hardware stores in Mount Lavinia")
            # wasn't fanned out above — but if it came back thin, broaden it
            # with the same category fan-out bare place names get, anchored
            # to the same place.
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
                    listings = shared["listings"]
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
