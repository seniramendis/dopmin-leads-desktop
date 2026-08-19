"""Pure Playwright port of the $0 technical audit.
Scrapling has been completely removed.
"""

import re
import time
from curl_cffi import requests as curl_requests
from playwright.sync_api import sync_playwright

from constants import (
    AUDIT_HTTP_TIMEOUT_MS,
    AUDIT_NAV_TIMEOUT_MS,
    AUDIT_SLOW_LOAD_MS,
    AUDIT_SCORE_WEIGHTS,
    AGENCY_FOOTER_PATTERNS,
    ANALYTICS_SIGNATURES,
    MOBILE_VIEWPORT,
    MOBILE_USER_AGENT,
)
from netutil import domain_is_alive, hostname_of, normalize_url


def block_heavy_resources(route):
    """Blocks media/fonts/websockets — but NOT stylesheets. The mobile-responsiveness
    check below (scrollWidth vs innerWidth) needs real CSS layout to be meaningful;
    blocking stylesheets here would make every site falsely read as 'responsive'."""
    if route.request.resource_type() in ("image", "media", "font", "websocket"):
        route.abort()
    else:
        route.continue_()


def raw_get(target_url, timeout_ms=AUDIT_HTTP_TIMEOUT_MS):
    """Status-only GET — used for the plain-HTTP fallback."""
    try:
        response = curl_requests.get(
            target_url,
            timeout=timeout_ms / 1000,
            impersonate="chrome",
            headers={"User-Agent": "Mozilla/5.0 (compatible; DopminAudit/1.0)"},
            allow_redirects=True,
        )
        return {"status": response.status_code}
    except Exception:
        return {"status": 0}


def detect_abandoned_agency(page_text, footer_links, site_hostname):
    """Looks for 'Designed by X' credits and checks if the agency domain is dead."""
    agency_name = ""
    for pattern in AGENCY_FOOTER_PATTERNS:
        match = re.search(pattern, page_text or "", re.I)
        if match and match.group(1):
            agency_name = re.sub(r"\s{2,}", " ", match.group(1).strip())
            break

    if not agency_name and not footer_links:
        return {"found": False}

    external_link = next(
        (href for href in footer_links if hostname_of(href) and hostname_of(href) != site_hostname),
        None,
    )

    if not agency_name and not external_link:
        return {"found": False}

    agency_domain = hostname_of(external_link) if external_link else ""
    agency_domain_dead = not domain_is_alive(agency_domain) if agency_domain else False

    return {
        "found": True,
        "agencyName": agency_name or agency_domain or "a previous agency",
        "agencyDomain": agency_domain,
        "agencyDomainDead": agency_domain_dead,
    }


def _footer_links(page):
    """Native Playwright locator for footer links."""
    links = []
    for selector in ['footer a[href]', '[class*="footer" i] a[href]', '[class*="Footer"] a[href]']:
        try:
            for el in page.locator(selector).all():
                href = el.get_attribute("href")
                if href: links.append(href)
        except Exception:
            pass
    return list(dict.fromkeys(links))


def run_zero_cost_audit(raw_url):
    """Runs the full $0 audit on a single URL."""
    url = normalize_url(raw_url)
    if not url:
        return {"hasWebsite": False, "score": 0, "issues": ["No website present"], "checks": {}}

    hostname = hostname_of(url)

    if not domain_is_alive(hostname):
        return {
            "hasWebsite": False,
            "score": 0,
            "issues": ["Domain does not resolve (dead/expired domain)"],
            "checks": {"dnsAlive": False},
        }

    issues = []
    score = 100
    is_https = url.startswith("https://")
    checks = {"dnsAlive": True, "https": is_https}

    if not is_https:
        score -= AUDIT_SCORE_WEIGHTS["noSsl"]
        issues.append("Missing SSL Certificate (Insecure Connection)")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
            context = browser.new_context(viewport=MOBILE_VIEWPORT, user_agent=MOBILE_USER_AGENT)
            context.route("**/*", block_heavy_resources)
            page = context.new_page()

            start_time = time.monotonic()
            try:
                response = page.goto(url, timeout=AUDIT_NAV_TIMEOUT_MS, wait_until="domcontentloaded")
                page.wait_for_timeout(400)
            except Exception:
                fallback = raw_get(url.replace("https://", "http://"))
                if not fallback["status"] or fallback["status"] >= 500:
                    browser.close()
                    return {
                        "hasWebsite": True,
                        "score": 10,
                        "issues": ["Website did not respond (server error or unreachable)"],
                        "checks": {**checks, "reachable": False},
                    }
                browser.close()
                return {
                    "hasWebsite": True,
                    "score": 20,
                    "issues": ["Website loaded very slowly or with certificate errors"],
                    "checks": {**checks, "reachable": True, "certificateIssue": True},
                }

            load_time_ms = (time.monotonic() - start_time) * 1000
            http_status = response.status if response else 0

            if http_status >= 400:
                browser.close()
                return {
                    "hasWebsite": True,
                    "score": 10,
                    "issues": [f"Server Error (HTTP {http_status})"],
                    "checks": {**checks, "httpStatus": http_status},
                }

            checks["loadTimeMs"] = load_time_ms
            if load_time_ms > AUDIT_SLOW_LOAD_MS:
                score -= AUDIT_SCORE_WEIGHTS["slowLoad"]
                issues.append(f"Slow Load Time ({load_time_ms / 1000:.1f}s)")

            overflow = False
            try:
                overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 5")
            except Exception:
                pass

            checks["mobileResponsive"] = not overflow
            if overflow:
                score -= AUDIT_SCORE_WEIGHTS["noMobile"]
                issues.append("Not Mobile-Responsive (horizontal scroll on phones)")

            html = page.content()
            page_text = page.evaluate("() => document.body?.innerText || ''")
            footer_links = _footer_links(page)

            title = page.title()
            meta_el = page.locator('meta[name="description"]').first
            meta_description = meta_el.get_attribute("content") if meta_el.count() > 0 else ""

            browser.close()

        found_analytics = [s for s in ANALYTICS_SIGNATURES if re.search(s["pattern"], html, re.I)]
        checks["analytics"] = [s["name"] for s in found_analytics]
        if not found_analytics:
            score -= AUDIT_SCORE_WEIGHTS["noAnalytics"]
            issues.append("No Google Analytics, Meta Pixel, or GTM detected (flying blind on traffic)")

        checks["hasTitle"] = bool(title)
        if not title:
            score -= AUDIT_SCORE_WEIGHTS["noTitle"]
            issues.append("Missing page <title> tag (hurts Google ranking)")

        checks["hasMetaDescription"] = bool(meta_description)
        if not meta_description:
            score -= AUDIT_SCORE_WEIGHTS["noMetaDescription"]
            issues.append("Missing meta description (hurts Google click-through)")

        abandoned = detect_abandoned_agency(page_text, footer_links, hostname)
        checks["abandonedAgency"] = abandoned
        if abandoned.get("found") and abandoned.get("agencyDomainDead"):
            score -= AUDIT_SCORE_WEIGHTS["abandonedAgency"]
            issues.append(f'Abandoned Agency: built by "{abandoned["agencyName"]}", whose own domain is no longer active')

        return {
            "hasWebsite": True,
            "score": max(0, min(100, round(score))),
            "issues": issues if issues else ["No major issues found — solid site"],
            "checks": checks,
        }
    except Exception as error:
        return {"hasWebsite": True, "score": 0, "issues": [f"Audit failed: {error}"], "checks": {}}