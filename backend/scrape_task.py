"""
backend/scrape_task.py

Standalone script run by GitHub Actions (.github/workflows/scrape.yml).
Invoked as:  python scrape_task.py "<target_url>" ["<job_id>"]

Flow:
  1. Fetch the target page with Scrapling's StealthyFetcher (Playwright/Camoufox
     under the hood) to get past basic bot detection.
  2. Parse Google-Maps-style local listing cards into lead dicts.
  3. Upsert each lead into the Turso (libSQL) `leads` table.
  4. Mark the job row as done/error so the desktop app's poller knows to stop.

Credentials (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN) come from the environment
only — see backend/.env.example for what's expected. In CI they're injected
by GitHub Actions from encrypted repo secrets; they are never hardcoded here.
"""

import hashlib
import os
import re
import sys
import time
import uuid

import libsql_client
from scrapling.fetchers import StealthyFetcher

# ---------------------------------------------------------------------------
# Schema (mirrors client/src/main/db.js's local `leads` table so rows synced
# down to the desktop app slot in without a translation layer).
# ---------------------------------------------------------------------------
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    name TEXT NOT NULL,
    category TEXT,
    phone TEXT,
    address TEXT,
    maps_url TEXT,
    rating REAL,
    review_count INTEGER,
    has_website INTEGER,
    website TEXT,
    source_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS scrape_jobs (
    id TEXT PRIMARY KEY,
    target_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    lead_count INTEGER DEFAULT 0,
    error TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT
);
"""


def get_client():
    turso_url = os.getenv("TURSO_DATABASE_URL")
    turso_token = os.getenv("TURSO_AUTH_TOKEN")
    if not turso_url or not turso_token:
        raise RuntimeError(
            "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set. "
            "In CI these come from GitHub Actions secrets; locally, copy "
            "backend/.env.example to backend/.env and fill in real values."
        )
    return libsql_client.create_client_sync(url=turso_url, auth_token=turso_token)


def fingerprint(name, address):
    """Stable id so re-scraping the same listing updates the row instead of
    duplicating it — same normalization approach as the desktop app's local
    db.js so ids line up if you ever merge the two datasets."""
    norm = lambda s: re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()
    key = f"{norm(name)}|{norm(address)}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


def parse_leads(page, source_url):
    """Extract lead cards from a fetched Scrapling page.

    Google Maps' DOM is unstable and varies by locale/experiment, so this
    targets the stable-ish `div[role="article"]` result cards and falls back
    gracefully when a field is missing. Adjust the selectors here first if a
    target site's markup differs.
    """
    leads = []
    cards = page.css('div[role="article"]')

    for card in cards:
        name_el = card.css_first("div.fontHeadlineSmall::text, a::attr(aria-label)")
        name = None
        if name_el:
            name = name_el.get() if hasattr(name_el, "get") else str(name_el)
        if not name:
            aria = card.attrib.get("aria-label")
            name = aria
        if not name:
            continue
        name = name.strip()

        text_blob = card.get_all_text(strip=True) if hasattr(card, "get_all_text") else ""

        rating = None
        review_count = None
        rating_match = re.search(r"(\d\.\d)\s*\(([\d,]+)\)", text_blob)
        if rating_match:
            rating = float(rating_match.group(1))
            review_count = int(rating_match.group(2).replace(",", ""))

        phone_match = re.search(r"(\+?\d[\d\-\s()]{7,}\d)", text_blob)
        phone = phone_match.group(1).strip() if phone_match else None

        maps_link = card.css_first("a::attr(href)")
        maps_url = maps_link.get() if maps_link and hasattr(maps_link, "get") else None

        website_link = card.css_first('a[data-value="Website"]::attr(href)')
        website = website_link.get() if website_link and hasattr(website_link, "get") else None

        category = None
        cat_match = re.search(r"·\s*([A-Za-z][A-Za-z &]+)", text_blob)
        if cat_match:
            category = cat_match.group(1).strip()

        leads.append(
            {
                "id": fingerprint(name, maps_url or ""),
                "name": name,
                "category": category,
                "phone": phone,
                "address": None,
                "maps_url": maps_url,
                "rating": rating,
                "review_count": review_count,
                "has_website": 1 if website else 0,
                "website": website,
                "source_url": source_url,
            }
        )

    return leads


def run_scraper(target_url, job_id=None):
    job_id = job_id or str(uuid.uuid4())
    client = get_client()

    try:
        for stmt in SCHEMA_SQL.strip().split(";\n\n"):
            stmt = stmt.strip().rstrip(";")
            if stmt:
                client.execute(stmt)

        client.execute(
            "INSERT INTO scrape_jobs (id, target_url, status) VALUES (?, ?, 'running')",
            [job_id, target_url],
        )

        print(f"[{job_id}] Igniting StealthyFetcher for {target_url}...")
        page = StealthyFetcher.fetch(
            target_url,
            headless=True,
            network_idle=True,
        )

        leads = parse_leads(page, target_url)
        print(f"[{job_id}] Parsed {len(leads)} lead(s).")

        for lead in leads:
            client.execute(
                """
                INSERT INTO leads
                    (id, job_id, name, category, phone, address, maps_url,
                     rating, review_count, has_website, website, source_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    job_id=excluded.job_id,
                    name=excluded.name,
                    category=excluded.category,
                    phone=excluded.phone,
                    address=excluded.address,
                    maps_url=excluded.maps_url,
                    rating=excluded.rating,
                    review_count=excluded.review_count,
                    has_website=excluded.has_website,
                    website=excluded.website,
                    source_url=excluded.source_url
                """,
                [
                    lead["id"],
                    job_id,
                    lead["name"],
                    lead["category"],
                    lead["phone"],
                    lead["address"],
                    lead["maps_url"],
                    lead["rating"],
                    lead["review_count"],
                    lead["has_website"],
                    lead["website"],
                    lead["source_url"],
                ],
            )

        client.execute(
            "UPDATE scrape_jobs SET status='done', lead_count=?, finished_at=datetime('now') WHERE id=?",
            [len(leads), job_id],
        )
        print(f"[{job_id}] Leads successfully pushed to Turso.")

    except Exception as exc:  # noqa: BLE001 - want the job row updated no matter what fails
        print(f"[{job_id}] Scrape failed: {exc}", file=sys.stderr)
        try:
            client.execute(
                "UPDATE scrape_jobs SET status='error', error=?, finished_at=datetime('now') WHERE id=?",
                [str(exc)[:500], job_id],
            )
        except Exception:
            pass
        raise
    finally:
        client.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Error: No target URL provided.")
        sys.exit(1)

    target = sys.argv[1]
    job = sys.argv[2] if len(sys.argv) > 2 else None
    start = time.time()
    run_scraper(target, job)
    print(f"Done in {time.time() - start:.1f}s")