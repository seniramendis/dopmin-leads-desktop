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
// Single-Business Profiler (businessProfiler.js)
// ---------------------------------------------------------------------------

// Timeout for loading a single business's own site when building a full
// profile (pricing/services/contact/tech-stack). Slightly longer than the
// audit's nav timeout since we also wait for links/footer to settle.
export const PROFILE_NAV_TIMEOUT_MS = 20000

// How many times we'll retry a profile page load after a bot-block/anti-bot
// signal before giving up with a friendly error, rotating User-Agent and
// waiting a jittered backoff between attempts.
export const MAX_PROFILE_RETRIES = 2

// Small pool of realistic desktop/mobile User-Agents. Rotated per attempt
// (not per request) so a single retried business doesn't look identical to
// the last blocked request, without pretending to be a botnet.
export const USER_AGENT_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
]

// Generic "we got blocked" text patterns, checked against page body text on
// any single-business fetch (mirrors scraper.js's isBlockedPage, but tuned
// for arbitrary sites — Cloudflare/PerimeterX/Akamai interstitials — rather
// than Google specifically).
export const ANTI_BOT_TEXT_PATTERNS = [
  /unusual traffic|automated queries|our systems have detected/i,
  /checking (your|if the connection is) secure/i,
  /verify you are human|attention required.*cloudflare/i,
  /access denied|request blocked|you have been blocked/i,
  /please enable javascript and cookies/i
]

// Tech-stack fingerprints. Each pattern is tested against the raw response
// HTML (fast, no extra page evaluation) unless `domSelector` is given, in
// which case we also check for that selector in the rendered DOM. Ordered
// roughly by how common they are among small-business sites, since the
// first hit wins for "platform" but every match is still recorded.
export const TECH_STACK_SIGNATURES = [
  { name: 'WordPress', pattern: /wp-content|wp-includes|generator"[^>]*wordpress/i },
  { name: 'WooCommerce', pattern: /woocommerce/i },
  { name: 'Shopify', pattern: /cdn\.shopify\.com|shopify-section|Shopify\.theme/i },
  { name: 'Wix', pattern: /static\.wixstatic\.com|wix-code|_wixCssStates/i },
  { name: 'Squarespace', pattern: /static1\.squarespace\.com|squarespace-cdn/i },
  { name: 'Webflow', pattern: /website-files\.com|data-wf-site/i },
  { name: 'GoDaddy Website Builder', pattern: /godaddysites\.com|gdbootstrap/i },
  { name: 'Weebly', pattern: /weebly\.com|weeblycloud/i },
  { name: 'Joomla', pattern: /generator"[^>]*joomla|\/media\/jui\// },
  { name: 'Drupal', pattern: /generator"[^>]*drupal|sites\/default\/files/i },
  { name: 'Magento', pattern: /Mage\.Cookies|static\/frontend|magento/i },
  { name: 'BigCommerce', pattern: /cdn\d*\.bigcommerce\.com/i },
  { name: 'Next.js', pattern: /__NEXT_DATA__|_next\/static/i },
  { name: 'Gatsby', pattern: /___gatsby|gatsby-image/i },
  { name: 'React', pattern: /data-reactroot|react-dom|id="root">/i },
  { name: 'Vue', pattern: /data-v-app|__VUE__|id="app">/i },
  { name: 'Angular', pattern: /ng-version=|\bng-app\b/i },
  { name: 'HTML5 Template (static)', pattern: /^(?!.*(wordpress|shopify|wix|squarespace)).*$/ }
]

// Social platforms checked for on a business's own site (footer/header
// links). Keys are the label shown in the UI; values match against the
// href's hostname.
export const SOCIAL_DOMAIN_PATTERNS = {
  Facebook: /(^|\.)facebook\.com$/i,
  Instagram: /(^|\.)instagram\.com$/i,
  'X / Twitter': /(^|\.)(x|twitter)\.com$/i,
  LinkedIn: /(^|\.)linkedin\.com$/i,
  TikTok: /(^|\.)tiktok\.com$/i,
  YouTube: /(^|\.)youtube\.com$/i,
  Pinterest: /(^|\.)pinterest\.com$/i,
  WhatsApp: /(^|\.)wa\.me$|(^|\.)whatsapp\.com$/i
}

// Matches a plain email address in page text/mailto hrefs. Deliberately
// simple (not RFC 5322-complete) since it only needs to catch real-world
// "contact us at x@y.com" text, not validate arbitrary input.
export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// Link text/href keywords used to find a pricing page or services page from
// the homepage's nav/footer without having to crawl the whole site.
export const PRICING_LINK_KEYWORDS = ['pricing', 'plans', 'packages', 'rates', 'cost']
export const SERVICES_LINK_KEYWORDS = ['services', 'what-we-do', 'solutions', 'offerings', 'products']

// ---------------------------------------------------------------------------
// Gemini API (pitchGenerator.js, analystEngine.js)
// ---------------------------------------------------------------------------

// NOTE: pitchGenerator.js already imported these two names before this file
// defined them — that was a pre-existing bug (undefined endpoint at
// runtime). Defining them here fixes both pitchGenerator.js and the new
// analystEngine.js in one place.
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
// Flash tier: fast + generous free-tier quota, which matters since both the
// pitch generator and the analyst engine run this per-lead. Update here if
// Google ships a newer default free-tier model.
export const GEMINI_MODEL = 'gemini-2.0-flash'

// ---------------------------------------------------------------------------
// LLM Analyst Engine (analystEngine.js)
// ---------------------------------------------------------------------------

// Fallback provider when Gemini rate-limits or errors out. OpenRouter's
// free tier proxies several open models under one API; DeepSeek R1 is a
// strong free reasoning model as of this writing. Kept as a single
// swappable constant since OpenRouter's free-model lineup changes over time.
export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1'
export const OPENROUTER_MODEL = 'deepseek/deepseek-r1:free'

// How many additional attempts we give the LLM to return valid, schema-
// matching JSON before giving up. Each retry re-sends the prompt with the
// specific parse/validation error appended, which in practice fixes most
// stray-markdown or missing-field responses on the first retry.
export const ANALYST_MAX_JSON_RETRIES = 2

// How long a cached analysis is served before we treat it as stale and
// re-call the LLM — 7 days balances "don't burn free-tier quota re-analyzing
// the same business every click" against "a business's site can genuinely
// change in a week."
export const ANALYST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// The fixed menu the analyst LLM is given and is only allowed to reference
// in `vulnerabilities[].dopminService` — this is what makes "every weakness
// must map to a Dopmin service" enforceable rather than just a prompt-only
// suggestion the model can ignore; analystEngine.js validates every
// returned dopminService against this list and retries otherwise.
export const DOPMIN_SERVICES = [
  'Website Design & Rebuild',
  'Mobile-Responsive Redesign',
  'SEO & Local Search Optimization',
  'Google Business Profile Setup & Management',
  'Website Speed & Hosting Optimization',
  'Website Security & SSL Setup',
  'Analytics & Tracking Setup (GA4 / Meta Pixel / GTM)',
  'Reputation & Review Management',
  'Social Media Management',
  'Ongoing Website Maintenance Retainer'
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
// Grouped by trade/vertical purely for readability — BUSINESS_TYPE_HINTS
// below is flattened from this at load time, and looksLikeBarePlaceName()
// just needs "does the query contain any of these words" so the grouping
// itself has no runtime effect. Kept intentionally huge: the whole point of
// this list is that a bare query like "hardware" or "Galle" should reliably
// match *some* category hint instead of silently falling through to the
// generic 20-category expansion below.
const BUSINESS_TYPE_HINT_GROUPS = {
  foodAndDrink: [
    'restaurant', 'restaurants', 'cafe', 'cafes', 'coffee shop', 'coffee shops', 'bakery', 'bakeries',
    'bar', 'bars', 'pub', 'pubs', 'nightclub', 'nightclubs', 'fast food', 'food truck', 'food trucks',
    'catering', 'caterer', 'caterers', 'bakehouse', 'confectionery', 'ice cream', 'juice bar', 'brewery',
    'winery', 'liquor store', 'bistro', 'diner', 'buffet', 'pizzeria', 'deli', 'delicatessen'
  ],
  lodgingAndTravel: [
    'hotel', 'hotels', 'motel', 'motels', 'guesthouse', 'guest house', 'hostel', 'hostels', 'resort',
    'resorts', 'villa', 'villas', 'bed and breakfast', 'bnb', 'travel agency', 'travel agent', 'tour operator',
    'car rental', 'car hire', 'taxi service', 'airport transfer'
  ],
  retailAndShopping: [
    'store', 'stores', 'shop', 'shops', 'boutique', 'boutiques', 'supermarket', 'supermarkets', 'market',
    'grocery', 'groceries', 'convenience store', 'mall', 'department store', 'clothing', 'clothing store',
    'wear', 'fashion', 'shoe store', 'footwear', 'jewel', 'jeweller', 'jewelers', 'jewellery', 'watch shop',
    'furniture', 'furniture store', 'home decor', 'electronics', 'electronics store', 'mobile', 'mobile shop',
    'phone', 'phone shop', 'computer', 'computers', 'computer store', 'hardware', 'hardware store',
    'hardware shop', 'stationery', 'bookstore', 'bookshop', 'toy store', 'gift shop', 'florist', 'flower shop',
    'pet store', 'pet shop', 'sporting goods', 'sports store', 'bicycle shop', 'bike shop', 'thrift store',
    'antique store', 'craft store', 'party supplies'
  ],
  healthAndBeauty: [
    'salon', 'salons', 'hair salon', 'barber', 'barbers', 'barbershop', 'spa', 'spas', 'nail salon',
    'beauty parlour', 'beauty parlor', 'clinic', 'clinics', 'hospital', 'medical center', 'dental clinic',
    'dentist', 'dentists', 'pharmacy', 'pharmacies', 'chemist', 'optician', 'opticians', 'physiotherapy',
    'physiotherapist', 'gym', 'gyms', 'fitness center', 'yoga studio', 'wellness center', 'ayurveda',
    'veterinary', 'vet clinic', 'massage'
  ],
  automotive: [
    'garage', 'mechanic', 'mechanics', 'auto repair', 'car repair', 'car service', 'car dealer',
    'car dealership', 'motorcycle dealer', 'tire shop', 'tyre shop', 'car wash', 'auto parts', 'spare parts'
  ],
  professionalServices: [
    'agency', 'agencies', 'firm', 'firms', 'service', 'services', 'repair', 'lawyer', 'lawyers', 'attorney',
    'law firm', 'law firms', 'accountant', 'accountants', 'accounting firm', 'tax service', 'consultant',
    'consultants', 'consulting firm', 'insurance agency', 'insurance broker', 'marketing agency',
    'advertising agency', 'design studio', 'photographer', 'photographers', 'photography studio',
    'printer', 'printers', 'printing', 'print shop', 'tailor', 'tailors', 'seamstress', 'dry cleaner',
    'laundry', 'notary'
  ],
  homeAndConstruction: [
    'contractor', 'contractors', 'construction', 'construction company', 'builder', 'builders',
    'electrician', 'electricians', 'plumber', 'plumbers', 'painter', 'painters', 'roofing company',
    'landscaping', 'landscaper', 'cleaning service', 'pest control', 'locksmith', 'interior designer',
    'architect', 'architects', 'carpenter', 'carpenters', 'welding shop'
  ],
  financeAndRealEstate: [
    'bank', 'banks', 'atm', 'credit union', 'real estate', 'realtor', 'realtors', 'real estate agent',
    'property management', 'apartments', 'estate agent'
  ],
  education: [
    'school', 'schools', 'preschool', 'kindergarten', 'tuition class', 'tutoring center', 'college',
    'university', 'driving school', 'language school', 'music school', 'daycare', 'nursery'
  ]
}

export const BUSINESS_TYPE_HINTS = Array.from(new Set(Object.values(BUSINESS_TYPE_HINT_GROUPS).flat()))

// Default set of categories a bare place name gets fanned out into. Kept
// broad and organized by vertical so the scrape loop covers most of a
// local business landscape rather than the previous ~20-item shortlist.
// It still stops as soon as enough leads are found, so later categories
// only run if earlier ones didn't fill the quota — a huge list here is
// cheap because DISCOVERY_CONCURRENCY caps how many run in parallel and
// unneeded ones are simply never launched.
export const DEFAULT_CATEGORY_EXPANSION = [
  // Food & drink
  'restaurants', 'cafes', 'bakeries', 'bars', 'fast food restaurants', 'coffee shops', 'ice cream shops',
  'catering companies', 'liquor stores',
  // Lodging & travel
  'hotels', 'guesthouses', 'travel agencies', 'car rental agencies',
  // Retail & shopping
  'shops', 'supermarkets', 'grocery stores', 'clothing stores', 'shoe stores', 'jewelry stores',
  'furniture stores', 'electronics stores', 'mobile phone shops', 'computer stores', 'hardware stores',
  'bookstores', 'gift shops', 'florists', 'pet stores', 'sporting goods stores',
  // Health & beauty
  'salons', 'barbershops', 'spas', 'clinics', 'dental clinics', 'pharmacies', 'gyms', 'veterinary clinics',
  // Automotive
  'auto repair shops', 'car dealerships', 'tire shops', 'car washes',
  // Professional services
  'law firms', 'accounting firms', 'insurance agencies', 'marketing agencies', 'photography studios',
  'printing shops', 'tailors', 'dry cleaners',
  // Home & construction
  'construction companies', 'electricians', 'plumbers', 'painters', 'landscaping companies',
  'cleaning services', 'pest control services', 'locksmiths', 'interior designers',
  // Finance & real estate
  'banks', 'real estate agents', 'property management companies',
  // Education
  'schools', 'preschools', 'tutoring centers', 'driving schools'
]
