"""Full Scrapling port of client/src/main/businessProfiler.js — deep
extraction on ONE business's own website: pricing/services, contact info,
social links, tech stack, and an optional 1-2 competitor comparison, folded
together with the $0 audit into one JSON object ready for the LLM pitch step.

Site loads now go through Scrapling's StealthyFetcher with
solve_cloudflare=True (handles Turnstile/Interstitial challenges natively,
replacing the hand-rolled anti-bot retry wall) and per-attempt User-Agent
rotation from the same pool the JS version used.
"""

import random
import re
import time

from scrapling.fetchers import StealthyFetcher

from audit import detect_abandoned_agency, response_html, run_zero_cost_audit, _footer_links
from constants import (
    ANTI_BOT_TEXT_PATTERNS,
    EMAIL_REGEX,
    MAX_PROFILE_RETRIES,
    PRICING_LINK_KEYWORDS,
    PROFILE_NAV_TIMEOUT_MS,
    SERVICES_LINK_KEYWORDS,
    SOCIAL_DOMAIN_PATTERNS,
    TECH_STACK_SIGNATURES,
    USER_AGENT_POOL,
)
from netutil import hostname_of, normalize_url

_ANTI_BOT_RES = [re.compile(p, re.I) for p in ANTI_BOT_TEXT_PATTERNS]
_EMAIL_RE = re.compile(EMAIL_REGEX)
_IMAGE_EMAIL_RE = re.compile(r"\.(png|jpg|jpeg|gif|svg|webp)$", re.I)
_SOCIAL_RES = {platform: re.compile(pattern, re.I) for platform, pattern in SOCIAL_DOMAIN_PATTERNS.items()}
_TECH_RES = [
    {"name": s["name"], "pattern": re.compile(s["pattern"], re.I)} for s in TECH_STACK_SIGNATURES
]


class _BlockedError(Exception):
    pass


def detect_tech_stack(html):
    """Checks raw HTML against known fingerprints; returns every match plus
    a best-guess "platform" (the first non-generic hit)."""
    matches = [s["name"] for s in _TECH_RES if s["pattern"].search(html)]
    platform = next((name for name in matches), None) or ("HTML5 Template (static)" if html else "Unknown")
    return {"platform": platform, "signals": matches}


def extract_contact_and_social(page, html, site_hostname):
    """Pulls mailto/tel links and plain-text emails, plus every outbound
    link matching a known social platform domain (deduped per platform)."""
    links = [
        el.attrib.get("href", "")
        for el in page.css("a[href]")
        if el.attrib.get("href")
    ]

    emails_from_mailto = [
        href.replace("mailto:", "").split("?")[0].strip()
        for href in links
        if href.startswith("mailto:")
    ]
    emails_from_text = _EMAIL_RE.findall(html)
    emails = [
        e
        for e in dict.fromkeys(emails_from_mailto + emails_from_text)
        if not _IMAGE_EMAIL_RE.search(e)
    ]

    phones = list(
        dict.fromkeys(
            href.replace("tel:", "").strip() for href in links if href.startswith("tel:")
        )
    )
    phones = [p for p in phones if p]

    social = {}
    for href in links:
        host = hostname_of(href)
        if not host or host == site_hostname:
            continue
        for platform, pattern in _SOCIAL_RES.items():
            if pattern.search(host) and platform not in social:
                social[platform] = href

    return {"emails": emails, "phones": phones, "social": social}


def find_pricing_and_service_links(page):
    """Checks whether the homepage links to something that looks like a
    pricing or services page — enough signal for a pitch ("no visible
    pricing page" is itself a talking point) without crawling the site."""
    nav_links = [
        {"href": el.attrib.get("href", ""), "text": (el.get_all_text(strip=True) or "").lower()}
        for el in page.css("a[href]")
    ]

    def match_any(keywords):
        return next(
            (
                link
                for link in nav_links
                if any(kw in f"{link['href'].lower()} {link['text']}" for kw in keywords)
            ),
            None,
        )

    pricing_link = match_any(PRICING_LINK_KEYWORDS)
    services_link = match_any(SERVICES_LINK_KEYWORDS)

    return {
        "hasPricingPage": pricing_link is not None,
        "pricingUrl": pricing_link["href"] if pricing_link else "",
        "hasServicesPage": services_link is not None,
        "servicesUrl": services_link["href"] if services_link else "",
    }


def _is_likely_blocked(page):
    try:
        text = page.get_all_text() or ""
    except Exception:
        return False
    return any(pattern.search(text) for pattern in _ANTI_BOT_RES)


def load_with_retries(url, on_progress):
    """Loads one URL with anti-bot handling: StealthyFetcher with Cloudflare
    solving enabled, User-Agent rotated per attempt, jittered backoff, and a
    friendly error once retries are exhausted."""
    last_error = ""
    for attempt in range(MAX_PROFILE_RETRIES + 1):
        try:
            on_progress(
                {
                    "phase": "profiling",
                    "message": (
                        f"Opening {url}…"
                        if attempt == 0
                        else f"Retrying ({attempt}/{MAX_PROFILE_RETRIES})…"
                    ),
                }
            )
            page = StealthyFetcher.fetch(
                url,
                headless=True,
                network_idle=False,
                disable_resources=True,
                solve_cloudflare=True,
                useragent=USER_AGENT_POOL[attempt % len(USER_AGENT_POOL)],
                timeout=PROFILE_NAV_TIMEOUT_MS,
                wait=400,
            )
            if _is_likely_blocked(page):
                raise _BlockedError("BLOCKED")
            return page
        except _BlockedError:
            last_error = "BLOCKED"
        except Exception as error:
            last_error = str(error)
        if attempt < MAX_PROFILE_RETRIES:
            time.sleep(random.uniform(0.8, 1.5))

    if last_error == "BLOCKED":
        raise RuntimeError(
            "This site is blocking automated visits. Try again later or check it manually."
        )
    raise RuntimeError(
        f"Could not load this site after {MAX_PROFILE_RETRIES + 1} attempts ({last_error or 'unknown error'})."
    )


def check_competitors(competitor_urls, on_progress):
    """Runs the $0 audit + tech-stack read on 1-2 competitor URLs.
    Failures on one competitor never kill the whole comparison."""
    urls = [u for u in (competitor_urls or []) if u][:2]
    results = []
    for raw_url in urls:
        url = normalize_url(raw_url)
        on_progress({"phase": "profiling", "message": f"Checking competitor {url}…"})
        try:
            audit = run_zero_cost_audit(url)
            tech_stack = {"platform": "Unknown", "signals": []}
            try:
                page = load_with_retries(url, on_progress)
                tech_stack = detect_tech_stack(response_html(page))
            except Exception:
                # Tech-stack read is a bonus — the audit is useful on its own.
                pass
            results.append({"url": url, "success": True, **audit, "techStack": tech_stack})
        except Exception as error:
            results.append({"url": url, "success": False, "error": str(error)})
    return results


def scrape_business_profile(raw_url, options=None, on_progress=lambda payload: None):
    """Runs the full single-business profile: audit + pricing/services +
    contact/social + tech stack + (optional) competitor comparison."""
    options = options or {}
    url = normalize_url(raw_url)
    if not url:
        return {"success": False, "error": "Please provide a business website URL."}
    hostname = hostname_of(url)
    competitor_urls = options.get("competitorUrls") or []

    try:
        on_progress({"phase": "profiling", "message": "Running technical audit…"})
        audit = run_zero_cost_audit(url)

        if not audit.get("hasWebsite"):
            return {
                "success": True,
                "url": url,
                "hostname": hostname,
                **audit,
                "techStack": None,
                "contact": None,
                "competitors": [],
            }

        try:
            page = load_with_retries(url, on_progress)
        except Exception as error:
            return {
                "success": True,
                "url": url,
                "hostname": hostname,
                **audit,
                "techStackError": str(error),
                "competitors": [],
            }

        html = response_html(page)
        page_text = page.get_all_text() or ""
        footer_links = _footer_links(page)

        tech_stack = detect_tech_stack(html)
        contact = extract_contact_and_social(page, html, hostname)
        pricing_and_services = find_pricing_and_service_links(page)
        abandoned_agency = detect_abandoned_agency(page_text, footer_links, hostname)

        competitors = check_competitors(competitor_urls, on_progress) if competitor_urls else []

        on_progress({"phase": "done"})

        return {
            "success": True,
            "url": url,
            "hostname": hostname,
            **audit,
            "techStack": tech_stack,
            "contact": contact,
            **pricing_and_services,
            "abandonedAgency": abandoned_agency,
            "competitors": competitors,
        }
    except Exception as error:
        return {"success": False, "error": str(error)}
