"""Port of the Maps half of client/src/main/queryExpansion.js.

(The IT-project/RFP boolean query builder, buildPlatformProjectQuery, stays
in JS — it only builds a query string, it doesn't scrape anything.)
"""

import re

from constants import BUSINESS_TYPE_HINTS, DEFAULT_CATEGORY_EXPANSION


def looks_like_bare_place_name(query):
    q = query.lower()
    return not any(hint in q for hint in BUSINESS_TYPE_HINTS)


def expand_query(query, mode=""):
    """Turns a single user query into the list of queries actually run
    against Google Maps.

    - it_projects mode queries are already fully-formed boolean search
      strings, so they run exactly as-is — never fanned out.
    - If the user already named a business type ("restaurants in Kandy"),
      that one query runs unchanged.
    - A bare place name ("Mount Lavinia") is fanned out into
      "<category> in <place>" across a broad set of local business
      categories, since Maps returns weak/empty results for a bare place.
    """
    trimmed = (query or "").strip()
    if not trimmed:
        return [trimmed]
    if mode == "it_projects":
        return [trimmed]
    if not looks_like_bare_place_name(trimmed):
        return [trimmed]
    return [f"{category} in {trimmed}" for category in DEFAULT_CATEGORY_EXPANSION]


def _extract_location(query):
    match = re.match(r"^(.*?)\s+(?:in|near)\s+(.+)$", query or "", re.I)
    return match.group(2).strip() if match else None


def broaden_query(query, already_tried=None):
    """Fallback for when the user's own category+place query comes back thin:
    reruns the broad category fan-out anchored to the same place."""
    location = _extract_location(query)
    if not location:
        return []
    tried = {q.lower() for q in (already_tried or [])}
    return [
        q
        for q in (f"{category} in {location}" for category in DEFAULT_CATEGORY_EXPANSION)
        if q.lower() not in tried
    ]
