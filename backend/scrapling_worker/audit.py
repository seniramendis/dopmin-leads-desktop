"""Full Scrapling port of client/src/main/auditEngine.js — the $0 technical
audit (SSL, speed, mobile-responsive, SEO/pixel, abandoned-agency) that
turns "No Website Found" into a sales asset.

The page load now goes through Scrapling's DynamicSession (plain Chromium
under Scrapling's engine) with disable_resources for speed; raw-HTML checks
read the returned Response instead of page.content(). DNS checks and the
plain-HTTP fallback use the socket module and curl_cffi respectively.
"""

import re
import time

from curl_cffi import requests as curl_requests
from scrapling.fetchers import DynamicSession

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


def response_html(page):
    """Raw HTML of a Scrapling Response as text, however it's stored."""
    html = getattr(page, "html_content", b"")
    if isinstance(html, bytes):
        return html.decode("utf-8", "ignore")
    return str(html or "")


def raw_get(target_url, timeout_ms=AUDIT_HTTP_TIMEOUT_MS):
    """Status-only GET — used for the plain-HTTP fallback and for checking
    whether a *different* domain (an old agency's site) is dead."""
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
    """Looks for "Designed by X" / "Powered by X" style credits in the page
    text or footer links, then checks whether the credited agency's own
    domain still resolves. A dead agency domain is the strongest
    "sitting duck" signal for a maintenance-takeover pitch."""
    agency_name = ""
    for pattern in AGENCY_FOOTER_PATTERNS:
        match = re.search(pattern, page_text or "", re.I)
        if match and match.group(1):
            agency_name = re.sub(r"\s{2,}", " ", match.group(1).strip())
            break

    if not agency_name and not footer_links:
        return {"found": False}

    external_link = next(
        (
            href
            for href in footer_links
            if hostname_of(href) and hostname_of(href) != site_hostname
        ),
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


def _getall(result):
    """Scrapling css()/xpath() results expose getall(); plain lists don't."""
    if result is None:
        return []
    if hasattr(result, "getall"):
        return [str(v) for v in result.getall()]
    return [str(v) for v in result]


def _footer_links(page):
    links = _getall(page.css("footer a[href]::attr(href)"))
    # [class*="footer" i] (case-insensitive flag) isn't universally
    # supported, so approximate it with the two common casings.
    links += _getall(page.css('[class*="footer"] a[href]::attr(href)'))
    links += _getall(page.css('[class*="Footer"] a[href]::attr(href)'))
    return links


def run_zero_cost_audit(raw_url):
    """Runs the full $0 audit on a single URL. Returns a score (0-100), a
    list of plain-English issues ready to paste into a pitch, and the raw
    signals behind them so the UI can render individual check badges."""
    url = normalize_url(raw_url)
    if not url:
        return {"hasWebsite": False, "score": 0, "issues": ["No website present"], "checks": {}}

    hostname = hostname_of(url)

    # 1. DNS — is this even a live domain?
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
        # Mobile viewport + phone UA, matching the JS audit's iPhone check.
        with DynamicSession(
            max_pages=1,
            headless=True,
            disable_resources=True,
            timeout=AUDIT_NAV_TIMEOUT_MS,
            additional_args={"viewport": MOBILE_VIEWPORT, "user_agent": MOBILE_USER_AGENT},
        ) as session:
            state = {"overflow": False}

            def mobile_check(page):
                try:
                    state["overflow"] = bool(
                        page.evaluate(
                            "() => document.documentElement.scrollWidth > window.innerWidth + 5"
                        )
                    )
                except Exception:
                    pass

            start_time = time.monotonic()
            try:
                page = session.fetch(
                    url,
                    page_action=mobile_check,
                    timeout=AUDIT_NAV_TIMEOUT_MS,
                    network_idle=False,
                    wait=400,
                )
            except Exception:
                # HTTPS navigation failed outright (bad cert, refused
                # connection, timeout) — try the plain-HTTP status as a last
                # resort so we can still tell "slow" from "totally down".
                fallback = raw_get(url.replace("https://", "http://"))
                if not fallback["status"] or fallback["status"] >= 500:
                    return {
                        "hasWebsite": True,
                        "score": 10,
                        "issues": ["Website did not respond (server error or unreachable)"],
                        "checks": {**checks, "reachable": False},
                    }
                return {
                    "hasWebsite": True,
                    "score": 20,
                    "issues": ["Website loaded very slowly or with certificate errors"],
                    "checks": {**checks, "reachable": True, "certificateIssue": True},
                }

            load_time_ms = (time.monotonic() - start_time) * 1000
            http_status = page.status or 0

            if http_status >= 400:
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

            # 2. Mobile-responsive check — does the page overflow
            # horizontally at a 375px phone width?
            checks["mobileResponsive"] = not state["overflow"]
            if state["overflow"]:
                score -= AUDIT_SCORE_WEIGHTS["noMobile"]
                issues.append("Not Mobile-Responsive (horizontal scroll on phones)")

            # 3. SEO / pixel / analytics check + footer text for the agency
            # detector — all read from the one page we already loaded.
            html = response_html(page)
            page_text = page.get_all_text() or ""
            footer_links = _footer_links(page)

            title_el = page.css_first("title::text")
            title = str(title_el.get()).strip() if title_el is not None and hasattr(title_el, "get") else ""
            meta_el = page.css_first('meta[name="description"]::attr(content)')
            meta_description = (
                str(meta_el.get()).strip() if meta_el is not None and hasattr(meta_el, "get") else ""
            )

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
            issues.append(
                f'Abandoned Agency: built by "{abandoned["agencyName"]}", whose own domain is no longer active'
            )

        return {
            "hasWebsite": True,
            "score": max(0, min(100, round(score))),
            "issues": issues if issues else ["No major issues found — solid site"],
            "checks": checks,
        }
    except Exception as error:
        return {
            "hasWebsite": True,
            "score": 0,
            "issues": [f"Audit failed: {error}"],
            "checks": {},
        }
