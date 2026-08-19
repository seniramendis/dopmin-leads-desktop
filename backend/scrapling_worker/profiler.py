"""Pure Playwright port of business profiling and competitor analysis.
Scrapling has been completely removed to match the new architecture.
"""

import os
import random
import re
import time
from playwright.sync_api import sync_playwright

from audit import detect_abandoned_agency, run_zero_cost_audit, _footer_links
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
from llm_extractor import LLMExtractionError, extract_with_llm
from netutil import domain_is_alive, hostname_of, normalize_url

# Set by scraper.js -> pythonBridge.js when spawning profile_cli.py, mirrors
# the same embedded key secureStore.js hands to pitchGenerator.js /
# analystEngine.js on the JS side. Read once at import time; if it's absent
# (Ollama-only install, or the embedded key was never set) extract_structured_data()
# below falls straight through to the regex parsers.
GEMINI_API_KEY = os.environ.get("DOPMIN_GEMINI_API_KEY", "")

def block_heavy_resources(route):
    """Blocks images/media/fonts/websockets/stylesheets for pure text extraction.
    Safe here because profiler.py never checks visual layout — only DOM text,
    href links, and raw-HTML regex signatures."""
    if route.request.resource_type() in ("image", "media", "font", "stylesheet", "websocket"):
        route.abort()
    else:
        route.continue_()


_ANTI_BOT_RES = [re.compile(p, re.I) for p in ANTI_BOT_TEXT_PATTERNS]
_EMAIL_RE = re.compile(EMAIL_REGEX)
_IMAGE_EMAIL_RE = re.compile(r"\.(png|jpg|jpeg|gif|svg|webp)$", re.I)
_SOCIAL_RES = {platform: re.compile(pattern, re.I) for platform, pattern in SOCIAL_DOMAIN_PATTERNS.items()}
_TECH_RES = [{"name": s["name"], "pattern": re.compile(s["pattern"], re.I)} for s in TECH_STACK_SIGNATURES]


class _BlockedError(Exception):
    pass


def detect_tech_stack(html):
    matches = [s["name"] for s in _TECH_RES if s["pattern"].search(html)]
    platform = next((name for name in matches), None) or ("HTML5 Template (static)" if html else "Unknown")
    return {"platform": platform, "signals": matches}


def extract_contact_and_social(page, html, site_hostname):
    links = []
    for el in page.locator("a[href]").all():
        href = el.get_attribute("href")
        if href: links.append(href)

    emails_from_mailto = [href.replace("mailto:", "").split("?")[0].strip() for href in links if href.startswith("mailto:")]
    emails_from_text = _EMAIL_RE.findall(html)
    emails = [e for e in dict.fromkeys(emails_from_mailto + emails_from_text) if not _IMAGE_EMAIL_RE.search(e)]

    phones = list(dict.fromkeys(href.replace("tel:", "").strip() for href in links if href.startswith("tel:")))
    phones = [p for p in phones if p]

    social = {}
    for href in links:
        host = hostname_of(href)
        if not host or host == site_hostname: continue
        for platform, pattern in _SOCIAL_RES.items():
            if pattern.search(host) and platform not in social:
                social[platform] = href

    return {"emails": emails, "phones": phones, "social": social}


def find_pricing_and_service_links(page):
    nav_links = []
    for el in page.locator("a[href]").all():
        href = el.get_attribute("href")
        text = el.inner_text().strip().lower() if el.inner_text() else ""
        if href: nav_links.append({"href": href, "text": text})

    def match_any(keywords):
        return next((link for link in nav_links if any(kw in f"{link['href'].lower()} {link['text']}" for kw in keywords)), None)

    pricing_link = match_any(PRICING_LINK_KEYWORDS)
    services_link = match_any(SERVICES_LINK_KEYWORDS)

    return {
        "hasPricingPage": pricing_link is not None,
        "pricingUrl": pricing_link["href"] if pricing_link else "",
        "hasServicesPage": services_link is not None,
        "servicesUrl": services_link["href"] if services_link else "",
    }


def _gather_nav_links(page):
    """Every <a href> on the page as {href, text} — gathered once and shared
    between the LLM prompt and the regex fallback so both paths see the
    same link set instead of re-querying the DOM twice."""
    links = []
    for el in page.locator("a[href]").all():
        href = el.get_attribute("href")
        if not href:
            continue
        text = el.inner_text().strip() if el.inner_text() else ""
        links.append({"href": href, "text": text})
    return links


def extract_structured_data(page, html, page_text, footer_links, site_hostname, on_progress=lambda payload: None):
    """Contact/social/pricing-services/abandoned-agency in one pass.

    Phase 2: tries the LLM extractor (llm_extractor.py, Gemini) first. On
    ANY failure — no API key configured, network error, rate limit,
    malformed JSON — falls straight back to the original regex parsers, so
    a Gemini outage or missing key never breaks a profile, it just makes
    this one less AI-assisted. `extractionMethod` in the result tells the
    caller which path actually ran.
    """
    nav_links = _gather_nav_links(page)

    if GEMINI_API_KEY:
        try:
            llm_result = extract_with_llm(page_text, nav_links, site_hostname, GEMINI_API_KEY)

            agency = llm_result["abandonedAgency"]
            if agency["found"]:
                agency_domain = agency["agencyDomain"]
                abandoned_agency = {
                    "found": True,
                    "agencyName": agency["agencyName"] or agency_domain or "a previous agency",
                    "agencyDomain": agency_domain,
                    # Domain aliveness is a real DNS check the LLM has no way
                    # to perform from page text alone — always verified here
                    # in code, never trusted straight from the model.
                    "agencyDomainDead": (not domain_is_alive(agency_domain)) if agency_domain else False,
                }
            else:
                abandoned_agency = {"found": False}

            return {
                "contact": {
                    "emails": llm_result["emails"],
                    "phones": llm_result["phones"],
                    "social": llm_result["social"],
                },
                "pricingAndServices": {
                    "hasPricingPage": llm_result["hasPricingPage"],
                    "pricingUrl": llm_result["pricingUrl"],
                    "hasServicesPage": llm_result["hasServicesPage"],
                    "servicesUrl": llm_result["servicesUrl"],
                },
                "abandonedAgency": abandoned_agency,
                "extractionMethod": "llm",
            }
        except LLMExtractionError as error:
            on_progress({
                "phase": "profiling",
                "message": f"AI extraction unavailable ({error}) — falling back to pattern matching…",
            })
        except Exception as error:
            on_progress({
                "phase": "profiling",
                "message": f"AI extraction failed ({error}) — falling back to pattern matching…",
            })

    contact = extract_contact_and_social(page, html, site_hostname)
    pricing_and_services = find_pricing_and_service_links(page)
    abandoned_agency = detect_abandoned_agency(page_text, footer_links, site_hostname)

    return {
        "contact": contact,
        "pricingAndServices": pricing_and_services,
        "abandonedAgency": abandoned_agency,
        "extractionMethod": "regex",
    }


def _is_likely_blocked(page):
    try:
        text = page.evaluate("() => document.body?.innerText || ''")
    except Exception:
        return False
    return any(pattern.search(text) for pattern in _ANTI_BOT_RES)


def load_with_retries(browser, url, on_progress):
    last_error = ""
    for attempt in range(MAX_PROFILE_RETRIES + 1):
        try:
            on_progress({"phase": "profiling", "message": f"Opening {url}…" if attempt == 0 else f"Retrying ({attempt}/{MAX_PROFILE_RETRIES})…"})
            
            context = browser.new_context(
                user_agent=USER_AGENT_POOL[attempt % len(USER_AGENT_POOL)],
                viewport={"width": 1920, "height": 1080}
            )
            context.route("**/*", block_heavy_resources)
            page = context.new_page()
            page.goto(url, timeout=PROFILE_NAV_TIMEOUT_MS, wait_until="domcontentloaded")
            page.wait_for_timeout(400)
            
            if _is_likely_blocked(page):
                context.close()
                raise _BlockedError("BLOCKED")
            
            return context, page
        except _BlockedError:
            last_error = "BLOCKED"
        except Exception as error:
            last_error = str(error)
            try: context.close() 
            except: pass
            
        if attempt < MAX_PROFILE_RETRIES:
            time.sleep(random.uniform(0.8, 1.5))

    if last_error == "BLOCKED":
        raise RuntimeError("This site is blocking automated visits. Try again later.")
    raise RuntimeError(f"Could not load this site after {MAX_PROFILE_RETRIES + 1} attempts ({last_error or 'unknown error'}).")


def scrape_business_profile(raw_url, options=None, on_progress=lambda payload: None):
    options = options or {}
    url = normalize_url(raw_url)
    if not url: return {"success": False, "error": "Please provide a business website URL."}
    
    hostname = hostname_of(url)
    competitor_urls = options.get("competitorUrls") or []

    try:
        on_progress({"phase": "profiling", "message": "Running technical audit…"})
        audit = run_zero_cost_audit(url)

        if not audit.get("hasWebsite"):
            return {"success": True, "url": url, "hostname": hostname, **audit, "techStack": None, "contact": None, "competitors": []}

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
            try:
                context, page = load_with_retries(browser, url, on_progress)
            except Exception as error:
                browser.close()
                return {"success": True, "url": url, "hostname": hostname, **audit, "techStackError": str(error), "competitors": []}

            html = page.content()
            page_text = page.evaluate("() => document.body?.innerText || ''")
            footer_links = _footer_links(page)

            tech_stack = detect_tech_stack(html)
            extracted = extract_structured_data(page, html, page_text, footer_links, hostname, on_progress)
            contact = extracted["contact"]
            pricing_and_services = extracted["pricingAndServices"]
            abandoned_agency = extracted["abandonedAgency"]
            extraction_method = extracted["extractionMethod"]
            
            context.close()
            browser.close()

        # Check competitors sequentially to avoid opening multiple heavy processes at once
        competitors = []
        if competitor_urls:
            urls = [u for u in competitor_urls if u][:2]
            for comp_url in urls:
                c_url = normalize_url(comp_url)
                on_progress({"phase": "profiling", "message": f"Checking competitor {c_url}…"})
                try:
                    c_audit = run_zero_cost_audit(c_url)
                    c_tech = {"platform": "Unknown", "signals": []}
                    with sync_playwright() as cp:
                        c_browser = cp.chromium.launch(headless=True)
                        try:
                            c_context, c_page = load_with_retries(c_browser, c_url, lambda x: None)
                            c_tech = detect_tech_stack(c_page.content())
                            c_context.close()
                        except:
                            pass
                        c_browser.close()
                    competitors.append({"url": c_url, "success": True, **c_audit, "techStack": c_tech})
                except Exception as e:
                    competitors.append({"url": c_url, "success": False, "error": str(e)})

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
            "extractionMethod": extraction_method,
            "competitors": competitors,
        }
    except Exception as error:
        return {"success": False, "error": str(error)}