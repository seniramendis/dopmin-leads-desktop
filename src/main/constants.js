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
