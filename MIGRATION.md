# Scrapling Migration — Dopmin Leads Desktop

The desktop app now runs **all** scraping through [Scrapling](https://github.com/D4Vinci/Scrapling). Previously only the cloud worker (`backend/scrape_task.py`) used Scrapling while the desktop pipeline used raw Playwright for Node.js. That JS scraping code is gone; Scrapling is Python-only, so the scraping moved into Python workers that Electron spawns per job — the same pattern `scrape_task.py` already used.

## What changed

### New: `backend/scrapling_worker/` (all scraping lives here now)

| File | Replaces | Scrapling usage |
|---|---|---|
| `maps_pipeline.py` | old `client/src/main/scraper.js` (Playwright part) | `AsyncStealthySession` — anti-detect browser, `max_pages=10` page pool, `disable_resources=True`, Google referer, canvas-noise + WebRTC-leak protection |
| `profiler.py` | `client/src/main/businessProfiler.js` (**deleted**) | `StealthyFetcher` with `solve_cloudflare=True` (native Turnstile/Interstitial solving) + User-Agent rotation |
| `audit.py` | old `client/src/main/auditEngine.js` (Playwright part) | `DynamicSession` with mobile viewport; raw-HTTP fallback via `curl_cffi` |
| `query_expansion.py`, `constants.py`, `netutil.py` | JS `queryExpansion.js` (Maps half), scraping constants, `network.js` health tracker | pure Python ports, no browser |
| `maps_cli.py`, `profile_cli.py`, `audit_cli.py` | — | per-job entry points spawned by Electron |
| `protocol.py` | — | newline-delimited JSON on stdout: `{"type":"progress"}` lines + one final `{"type":"result"}` |

### Changed (Electron side — thin bridges, same exports/result shapes)

- `client/src/main/scraper.js` — `scrapeLeads()` and `scrapeSingleBusiness()` now spawn `maps_cli.py` / `profile_cli.py`. `runScraper()` (cloud/Turso worker) unchanged.
- `client/src/main/auditEngine.js` — `runZeroCostAudit()` spawns `audit_cli.py`; pure helpers (`normalizeUrl`, `hostnameOf`, `domainIsAlive`, `detectAbandonedAgency`) stay in JS.
- **New** `client/src/main/pythonBridge.js` — shared spawn + JSON-lines parser.

`index.js`, the preload API, the renderer, and `db.js` needed **no changes** — result shapes and progress phases are byte-identical.

### Kept in JS (not scraping)

- `client/src/main/network.js` — still provides `analyzeDomainWithProxy()` (HTTP call to the Cloudflare proxy, not scraping).
- `client/src/main/queryExpansion.js` — `buildPlatformProjectQuery()` only builds query strings.

## What you gain vs the old JS pipeline

1. **Anti-detection for free** — the Maps pipeline now runs in Scrapling's stealth browser instead of a vanilla Chromium with a hardcoded User-Agent.
2. **Cloudflare solving** — the profiler passes `solve_cloudflare=True`; the old code just retried and gave up.
3. **Managed page pool** — `max_pages` replaces the hand-written concurrency code.
4. **Session-wide resource blocking** — `disable_resources=True` replaces manual `route()` interception.
5. **One scraping stack** — cloud (`scrape_task.py`) and desktop now share the same library and parsing approach.

## Setup

```bash
pip install -r backend/requirements.txt
scrapling install   # one-time: downloads the browsers Scrapling drives
```

Environment overrides:

- `DOPMIN_PYTHON` — path to the Python interpreter (default: `python3` / `python` on Windows). Point this at a venv if you use one.
- `DOPMIN_WORKER_DIR` — path to `backend/scrapling_worker` (default: repo layout `client/src/main/../../../backend/scrapling_worker`).

## Note for packaged builds

The spawned workers need Python + the `backend/scrapling_worker` folder present on the user's machine. For distribution, either bundle a Python runtime (e.g. PyInstaller-freeze the three CLIs and point `DOPMIN_PYTHON` at them — they take identical argv) or ship the backend folder and set `DOPMIN_WORKER_DIR` accordingly.
