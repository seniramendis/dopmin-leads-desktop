// src/main/constants.js
//
// Central place for the scraper's tuning knobs and reference data. Keeping
// these out of scraper.js makes the pipeline logic easier to read and lets
// the numbers/lists be tweaked (or unit tested) without touching the
// scraping code itself.

// Rating thresholds used to classify a lead's reputation from its Google
// Maps star rating. This is what powers the "good reviews vs bad reviews"
// split shown in the UI (High-Value Leads vs Reputation Rescue).
export const REPUTATION_THRESHOLDS = {
  excellent: 4.5, // 4.5★ and up
  good: 4.0, // 4.0★ – 4.49★
  average: 3.0 // 3.0★ – 3.99★  (below this = "poor")
}

// How many place detail pages we read at once. Higher = faster, but more
// likely to trip Google's rate limiting on very large runs. Raised from 6
// now that resource blocking (images/fonts/media/stylesheets) keeps each
// tab's CPU/RAM footprint low enough to support more parallel tabs safely.
export const DETAIL_CONCURRENCY = 10

// How many category sub-queries (from query expansion) we run at once
// during discovery. Kept modest since these are full search-page loads
// against the same Google session, not lightweight detail pages.
export const DISCOVERY_CONCURRENCY = 3

// Retries per listing if a detail page fails to load or times out.
export const MAX_DETAIL_RETRIES = 2

export const NAV_TIMEOUT_MS = 30000

// A single navigation taking longer than this is still allowed to succeed,
// but it's a strong sign of a slow/unstable connection, so we surface a
// one-time warning to the user instead of just quietly running long.
export const SLOW_NAV_THRESHOLD_MS = 12000

// How many navigations in a row have to fail with a *network-level* error
// (dropped wifi, DNS failure, connection reset, etc — see network.js)
// before we give up on the whole search rather than keep retrying into a
// dead connection.
export const MAX_CONSECUTIVE_NETWORK_FAILURES = 4

// ---------------------------------------------------------------------------
// Zero-Cost Audit Engine (auditEngine.js)
// ---------------------------------------------------------------------------

// How long we'll wait on a raw HTTP(S) request or a Playwright page load
// before giving up and marking that check as failed/skipped.
export const AUDIT_HTTP_TIMEOUT_MS = 6000
export const AUDIT_NAV_TIMEOUT_MS = 15000

// A site slower than this is flagged as a "Slow Load Time" issue — this is
// the same rough threshold Google's own Core Web Vitals guidance treats as
// a poor user experience.
export const AUDIT_SLOW_LOAD_MS = 3000

// Viewport used for the mobile-responsiveness check. 375px is the iPhone
// SE/12/13 mini logical width — still the most common "small phone"
// breakpoint sites break on.
export const MOBILE_VIEWPORT = { width: 375, height: 812 }

// Point deductions per issue found. Kept in one place so the scoring model
// can be tuned without touching the audit logic itself.
export const AUDIT_SCORE_WEIGHTS = {
  noSsl: 25,
  slowLoad: 20,
  noMobile: 20,
  noAnalytics: 10,
  noMetaDescription: 5,
  noTitle: 5,
  abandonedAgency: 15
}

// Regexes used to spot "Designed by X" / "Powered by X" style footer
// credits left behind by the agency that originally built the site. Each
// must have exactly one capture group for the agency's display name.
export const AGENCY_FOOTER_PATTERNS = [
  /designed\s+(?:and\s+developed\s+)?by\s+([a-z0-9][a-z0-9 .&'-]{1,40})/i,
  /developed\s+by\s+([a-z0-9][a-z0-9 .&'-]{1,40})/i,
  /powered\s+by\s+([a-z0-9][a-z0-9 .&'-]{1,40})/i,
  /built\s+by\s+([a-z0-9][a-z0-9 .&'-]{1,40})/i,
  /website\s+by\s+([a-z0-9][a-z0-9 .&'-]{1,40})/i,
  /a\s+([a-z0-9][a-z0-9 .&'-]{1,40})\s+production/i
]

// Analytics/tracking snippets we check the raw HTML for. If none of these
// are present, the site has no way to measure its own traffic — a clean,
// easy-to-explain upsell ("you're flying blind on your own website").
export const ANALYTICS_SIGNATURES = [
  {
    name: 'Google Analytics',
    pattern: /gtag\(['"]config['"]|google-analytics\.com|googletagmanager\.com/i
  },
  { name: 'Meta Pixel', pattern: /connect\.facebook\.net.*fbevents|fbq\(['"]init['"]/i },
  { name: 'Google Tag Manager', pattern: /googletagmanager\.com\/gtm\.js/i },
  { name: 'Hotjar', pattern: /static\.hotjar\.com/i },
  { name: 'TikTok Pixel', pattern: /analytics\.tiktok\.com/i }
]

// ---------------------------------------------------------------------------
// Persistent Leads Database (db.js) — local SQLite, zero server, zero cost
// ---------------------------------------------------------------------------

// The CRM-style pipeline every persisted lead moves through. Kept as an
// ordered list (not just a set) so the UI can render it as a left-to-right
// pipeline rather than an unordered dropdown.
export const LEAD_STATUSES = ['new', 'contacted', 'replied', 'won', 'dead']

// Fields we diff on every re-scrape to build the change-history log (the
// "Website disappeared" / "Rating dropped" signals). Keep this list small
// and high-signal — logging every trivial field (e.g. category casing)
// would bury the change feed in noise.
export const TRACKED_CHANGE_FIELDS = ['hasWebsite', 'rating', 'reviewCount', 'website']

// Words that signal the user already told us what KIND of business they
// want (e.g. "restaurants in Kandy", "hardware stores near Galle"). If a
// query contains none of these, it's almost certainly just a place name
// ("Mount Lavinia", "Kalutara town") — and Google Maps returns weak/empty
// results for a bare place with no category, so scraper.js expands it.
export const BUSINESS_TYPE_HINTS = [
  'store',
  'stores',
  'shop',
  'shops',
  'restaurant',
  'restaurants',
  'hotel',
  'hotels',
  'salon',
  'salons',
  'spa',
  'garage',
  'mechanic',
  'clinic',
  'clinics',
  'hospital',
  'pharmacy',
  'pharmacies',
  'bakery',
  'bakeries',
  'gym',
  'gyms',
  'dealer',
  'dealers',
  'agency',
  'agencies',
  'firm',
  'firms',
  'service',
  'services',
  'repair',
  'market',
  'supermarket',
  'supermarkets',
  'cafe',
  'cafes',
  'bar',
  'bars',
  'school',
  'schools',
  'boutique',
  'workshop',
  'electrician',
  'electricians',
  'plumber',
  'plumbers',
  'lawyer',
  'lawyers',
  'accountant',
  'accountants',
  'contractor',
  'contractors',
  'furniture',
  'electronics',
  'grocery',
  'groceries',
  'bank',
  'banks',
  'jewel',
  'jeweller',
  'jewelers',
  'tailor',
  'tailors',
  'printer',
  'printers',
  'photographer',
  'photographers',
  'apartments',
  'real estate',
  'realtor',
  'realtors',
  'clothing',
  'wear',
  'mobile',
  'phone',
  'computer',
  'computers',
  'hardware',
  'construction'
]

// Default set of categories a bare place name gets fanned out into. Kept
// broad and locally-relevant (Sri Lankan small-business landscape) rather
// than exhaustive — the scrape loop stops as soon as enough leads are
// found, so later categories only run if earlier ones didn't fill the quota.
export const DEFAULT_CATEGORY_EXPANSION = [
  'restaurants',
  'hotels',
  'shops',
  'supermarkets',
  'pharmacies',
  'hardware stores',
  'salons',
  'auto repair shops',
  'electronics stores',
  'clothing stores',
  'bakeries',
  'clinics',
  'gyms',
  'furniture stores',
  'law firms',
  'real estate agents',
  'construction companies',
  'schools',
  'grocery stores',
  'mobile phone shops'
]
