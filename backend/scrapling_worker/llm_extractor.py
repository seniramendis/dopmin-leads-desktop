"""LLM-based extraction for profiler.py — Phase 2.

Replaces the fuzzy/text-pattern regex parsers (contact info, social links,
pricing/services link detection, "designed by X" agency credits) with a
single Gemini call that reads the page's visible text + link list and
returns structured JSON.

Deliberately NOT replaced: TECH_STACK_SIGNATURES fingerprinting in
profiler.py's detect_tech_stack() stays regex-based. Those are exact string
signatures baked into a site's HTML/JS bundle (e.g. "wp-content",
"__NEXT_DATA__") — an LLM reading rendered page text has no way to see them,
so regex is strictly the right tool there and Phase 2 leaves it untouched.

Callers should wrap extract_with_llm() in a try/except for
LLMExtractionError (or any Exception) and fall back to the old regex
parsers — see profiler.py's extract_structured_data().
"""

import json

from curl_cffi import requests as curl_requests

from constants import (
    GEMINI_API_BASE,
    GEMINI_MODEL,
    LLM_EXTRACTION_TIMEOUT_MS,
    MAX_LLM_PAYLOAD_CHARS,
)

_EXPECTED_KEYS = {
    "emails": list,
    "phones": list,
    "social": dict,
    "hasPricingPage": bool,
    "pricingUrl": str,
    "hasServicesPage": bool,
    "servicesUrl": str,
    "abandonedAgency": dict,
}


class LLMExtractionError(Exception):
    """Raised on any failure to reach Gemini or parse its response.
    Callers should catch this and fall back to the regex parsers."""


def _truncate(text, limit):
    if not text:
        return ""
    return text if len(text) <= limit else text[:limit] + "\u2026[truncated]"


def _build_prompt(page_text, links, site_hostname):
    link_lines = "\n".join(
        f"- {(link.get('text') or '')[:60]!r} -> {link.get('href', '')}" for link in links[:200]
    )

    return f"""You are extracting structured business-website data. Read the page text and links below from {site_hostname} and return ONLY a JSON object (no markdown fences, no commentary, no explanation) with exactly this shape:

{{
  "emails": string[],
  "phones": string[],
  "social": {{"Facebook": string, "Instagram": string, "X / Twitter": string, "LinkedIn": string, "TikTok": string, "YouTube": string, "Pinterest": string, "WhatsApp": string}},
  "hasPricingPage": boolean,
  "pricingUrl": string,
  "hasServicesPage": boolean,
  "servicesUrl": string,
  "abandonedAgency": {{"found": boolean, "agencyName": string, "agencyDomain": string}}
}}

Rules:
- Only include a social link if it genuinely belongs to THIS business, not a generic share/follow widget pointing at an unrelated page.
- "abandonedAgency": look for a "Designed by / Built by / Powered by / Website by / a [Agency] production" style credit, usually in the footer. If found, set found=true and fill agencyName; fill agencyDomain only if a distinct external link/domain for that agency is visible. If none found, found=false and leave the strings empty.
- Only report emails/phones/links that are actually present in the text or link list below — never invent or guess one.
- If a field has no answer: use an empty string, empty array, empty object entry, or false. Never fabricate data.
- Output raw JSON only — the response will be parsed directly by json.loads().

PAGE TEXT:
{_truncate(page_text, MAX_LLM_PAYLOAD_CHARS)}

LINKS:
{_truncate(link_lines, MAX_LLM_PAYLOAD_CHARS)}
"""


def _strip_code_fence(text):
    text = text.strip()
    if not text.startswith("```"):
        return text
    text = text.strip("`")
    if text.lower().startswith("json"):
        text = text[4:]
    return text.strip()


def _coerce_shape(parsed):
    """Fills in any keys Gemini omitted with safe empty defaults rather than
    trusting the model to always emit the full shape. Doesn't fabricate
    values — just prevents a KeyError from propagating to the caller for an
    otherwise-valid response."""
    out = {}
    for key, expected_type in _EXPECTED_KEYS.items():
        value = parsed.get(key)
        out[key] = value if isinstance(value, expected_type) else expected_type()

    social = {}
    for platform, href in out["social"].items():
        if isinstance(href, str) and href:
            social[platform] = href
    out["social"] = social

    agency = out["abandonedAgency"]
    out["abandonedAgency"] = {
        "found": bool(agency.get("found")) if isinstance(agency, dict) else False,
        "agencyName": str(agency.get("agencyName") or "") if isinstance(agency, dict) else "",
        "agencyDomain": str(agency.get("agencyDomain") or "") if isinstance(agency, dict) else "",
    }

    out["emails"] = [e for e in out["emails"] if isinstance(e, str) and e]
    out["phones"] = [p for p in out["phones"] if isinstance(p, str) and p]

    return out


def extract_with_llm(page_text, links, site_hostname, api_key):
    """links: list of {"href": str, "text": str}.

    Returns a dict matching the shape documented in _build_prompt (with
    _coerce_shape applied). Raises LLMExtractionError on any failure — the
    caller is expected to fall back to the regex parsers when this raises.
    """
    if not api_key:
        raise LLMExtractionError("No Gemini API key configured.")

    prompt = _build_prompt(page_text, links, site_hostname)
    endpoint = f"{GEMINI_API_BASE}/{GEMINI_MODEL}:generateContent"

    try:
        response = curl_requests.post(
            endpoint,
            timeout=LLM_EXTRACTION_TIMEOUT_MS / 1000,
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 800},
            },
        )
    except Exception as error:
        raise LLMExtractionError(f"Could not reach the Gemini API: {error}") from error

    if response.status_code != 200:
        raise LLMExtractionError(f"Gemini API error (HTTP {response.status_code}).")

    try:
        data = response.json()
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(part.get("text", "") for part in parts)
    except (KeyError, IndexError, ValueError, TypeError) as error:
        raise LLMExtractionError(f"Unexpected Gemini response shape: {error}") from error

    text = _strip_code_fence(text)
    if not text:
        raise LLMExtractionError("Gemini returned an empty response.")

    try:
        parsed = json.loads(text)
    except ValueError as error:
        raise LLMExtractionError(f"Gemini did not return valid JSON: {error}") from error

    if not isinstance(parsed, dict):
        raise LLMExtractionError("Gemini response was not a JSON object.")

    return _coerce_shape(parsed)
