"""Port of client/src/main/constants.js — every tuning knob and reference
list the scraping pipeline needs, now living next to the Python workers so
they can be tweaked (or unit tested) without touching scraping logic."""

import os

# Rating thresholds used to classify a lead's reputation from its Google
# Maps star rating (powers the High-Value Leads vs Reputation Rescue split).
REPUTATION_THRESHOLDS = {
    "excellent": 4.5,
    "good": 4.0,
    "average": 3.0,
}


def _cpu_scaled(per_core, floor, ceiling, env_var):
    """Scale a concurrency knob to the machine's core count instead of a
    fixed constant. A flat "14 parallel browser tabs" number is fine on an
    8-core desktop and genuinely overloads a 2-core laptop — every tab then
    contends for the same CPU, navigations get slow for real, and that
    shows up as false "slow internet" warnings even though the connection
    itself is fine. `DOPMIN_DETAIL_CONCURRENCY` / `DOPMIN_DISCOVERY_CONCURRENCY`
    env vars still win outright if you want to force a specific number."""
    override = os.environ.get(env_var)
    if override:
        try:
            return max(1, int(override))
        except ValueError:
            pass
    cores = os.cpu_count() or 4
    return max(floor, min(ceiling, round(cores * per_core)))


# How many place detail pages we read at once.
#
# This governs a local Chromium instance's tab count when BRIGHT_DATA_WS_ENDPOINT
# is unset (the default, and dramatically faster — see maps_pipeline.py's
# scrape_leads()), so it's fine to scale it to CPU cores again. It's ALSO
# used as the concurrency cap when Bright Data IS configured, where the real
# ceiling is your Bright Data plan's concurrent-session limit rather than
# local CPU — if you're using Bright Data and see the "stopped responding to
# repeated page loads" stall error, set DOPMIN_DETAIL_CONCURRENCY (and
# DOPMIN_DISCOVERY_CONCURRENCY) to 1 or 2 in your .env to match your plan.
DETAIL_CONCURRENCY = _cpu_scaled(per_core=1.5, floor=3, ceiling=8, env_var="DOPMIN_DETAIL_CONCURRENCY")

# How many category sub-queries run at once during discovery. Kept at or
# below DETAIL_CONCURRENCY since both draw from the same browser page pool
# (or the same Bright Data zone, if configured).
# Override with DOPMIN_DISCOVERY_CONCURRENCY.
DISCOVERY_CONCURRENCY = _cpu_scaled(per_core=1.0, floor=2, ceiling=4, env_var="DOPMIN_DISCOVERY_CONCURRENCY")

# Retries per listing if a detail page fails to load or times out.
MAX_DETAIL_RETRIES = 2

NAV_TIMEOUT_MS = 30_000

# A navigation slower than this surfaces a one-time "slow connection" warning.
SLOW_NAV_THRESHOLD_MS = 12_000

# How many network-level navigation failures in a row before the whole
# search is aborted instead of grinding into a dead connection.
MAX_CONSECUTIVE_NETWORK_FAILURES = 5

# When the failure streak above is made of *stalls* (Google throttling),
# NetworkHealth now spends up to this many cooldowns pausing and backing off
# before it gives up and aborts for real — a single burst of throttling
# shouldn't kill the whole search. Real dropped-connection ("offline")
# failures still abort immediately; a cooldown wouldn't fix those.
# Cooldowns now scale (cooldown_seconds * attempt number, see
# NetworkHealth.try_cooldown), so 3 attempts is 25s + 50s + 75s of total
# backoff rather than 3 flat 25s pauses — a flat interval was retrying at
# the same cadence that got throttled in the first place.
MAX_STALL_COOLDOWNS = 3
STALL_COOLDOWN_SECONDS = 25

# Hard ceiling on a single browser attempt (local OR Bright Data) within one
# search. Without this, a persistent stall/rate-limit combined with the
# cooldown backoff above (25s+50s+75s=150s) plus per-listing retries could
# run for many minutes with nothing visibly happening — which reads as an
# infinite loop even though it does eventually stop. Wrapping each attempt
# in asyncio.wait_for(..., timeout=MAX_SEARCH_SECONDS) guarantees a result
# (or a clean fallback/failure) within a bounded, predictable time instead.
# Override with DOPMIN_MAX_SEARCH_SECONDS.
MAX_SEARCH_SECONDS = int(os.environ.get("DOPMIN_MAX_SEARCH_SECONDS", "150"))

# Realistic *desktop* user agents to rotate across Maps browser contexts.
# Kept separate from the profiler's USER_AGENT_POOL below (which
# intentionally mixes in mobile/Firefox UAs) because every Maps context uses
# a fixed 1920x1080 viewport — pairing that with a mobile UA is itself a
# mismatched-fingerprint signal. The default Playwright headless Chromium UA
# (and its unmasked navigator.webdriver flag) is one of the easiest signals
# for Google to key throttling off of, hence rotating this instead.
MAPS_USER_AGENT_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

# Injected into every Maps browser context via add_init_script(). Masks the
# handful of properties automated Chromium exposes by default (bare
# navigator.webdriver, empty plugins/languages) that bot-detection scripts
# check first — without this, every context looks identical and obviously
# scripted regardless of which user agent string it sends.
STEALTH_INIT_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
window.chrome = window.chrome || { runtime: {} };
const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
if (originalQuery) {
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters)
    );
}

// Canvas fingerprint noise — headless Chromium renders <canvas> pixel-identically
// across every launch on the same machine, which is a stable fingerprint bot
// detectors hash directly. Scrapling's AsyncStealthySession applied this by
// default; the raw-Playwright port dropped it. Nudging a handful of pixels by
// +/-1 on each readback keeps the canvas visually identical while making the
// hash differ per context.
(() => {
    const noisify = (ctx, w, h) => {
        if (!w || !h) return;
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 97) {
            data[i] = data[i] ^ (Math.random() < 0.5 ? 1 : 0);
        }
        ctx.putImageData(imageData, 0, 0);
    };
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
        try {
            const ctx = this.getContext('2d');
            if (ctx) noisify(ctx, this.width, this.height);
        } catch (e) {}
        return origToDataURL.apply(this, args);
    };
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        const result = origGetImageData.apply(this, args);
        for (let i = 0; i < result.data.length; i += 97) {
            result.data[i] = result.data[i] ^ (Math.random() < 0.5 ? 1 : 0);
        }
        return result;
    };
})();

// WebRTC leak protection — an unpatched RTCPeerConnection exposes the
// machine's real local/LAN IP via ICE candidates even through a proxy, which
// is both a fingerprinting signal and a privacy leak for whoever runs this.
// Also dropped in the Playwright port; restoring it here.
(() => {
    const OrigRTCPeerConnection = window.RTCPeerConnection;
    if (!OrigRTCPeerConnection) return;
    window.RTCPeerConnection = function (...args) {
        const pc = new OrigRTCPeerConnection(...args);
        const origCreateOffer = pc.createDataChannel.bind(pc);
        pc.createDataChannel = (...cdArgs) => origCreateOffer(...cdArgs);
        return pc;
    };
    window.RTCPeerConnection.prototype = OrigRTCPeerConnection.prototype;
})();
"""

# ---------------------------------------------------------------------------
# Zero-Cost Audit Engine (audit.py)
# ---------------------------------------------------------------------------

AUDIT_HTTP_TIMEOUT_MS = 6_000
AUDIT_NAV_TIMEOUT_MS = 15_000
AUDIT_SLOW_LOAD_MS = 3_000

MOBILE_VIEWPORT = {"width": 375, "height": 812}

MOBILE_USER_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)

AUDIT_SCORE_WEIGHTS = {
    "noSsl": 25,
    "slowLoad": 20,
    "noMobile": 20,
    "noAnalytics": 10,
    "noMetaDescription": 5,
    "noTitle": 5,
    "abandonedAgency": 15,
}

AGENCY_FOOTER_PATTERNS = [
    r"designed\s+(?:and\s+developed\s+)?by\s+([a-z0-9][a-z0-9 .&'-]{1,40})",
    r"developed\s+by\s+([a-z0-9][a-z0-9 .&'-]{1,40})",
    r"powered\s+by\s+([a-z0-9][a-z0-9 .&'-]{1,40})",
    r"built\s+by\s+([a-z0-9][a-z0-9 .&'-]{1,40})",
    r"website\s+by\s+([a-z0-9][a-z0-9 .&'-]{1,40})",
    r"a\s+([a-z0-9][a-z0-9 .&'-]{1,40})\s+production",
]

ANALYTICS_SIGNATURES = [
    {"name": "Google Analytics", "pattern": r"gtag\(['\"]config['\"]|google-analytics\.com|googletagmanager\.com"},
    {"name": "Meta Pixel", "pattern": r"connect\.facebook\.net.*fbevents|fbq\(['\"]init['\"]"},
    {"name": "Google Tag Manager", "pattern": r"googletagmanager\.com/gtm\.js"},
    {"name": "Hotjar", "pattern": r"static\.hotjar\.com"},
    {"name": "TikTok Pixel", "pattern": r"analytics\.tiktok\.com"},
]

# ---------------------------------------------------------------------------
# Single-Business Profiler (profiler.py)
# ---------------------------------------------------------------------------

PROFILE_NAV_TIMEOUT_MS = 20_000
MAX_PROFILE_RETRIES = 2

USER_AGENT_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
]

ANTI_BOT_TEXT_PATTERNS = [
    r"unusual traffic|automated queries|our systems have detected",
    r"checking (your|if the connection is) secure",
    r"verify you are human|attention required.*cloudflare",
    r"access denied|request blocked|you have been blocked",
    r"please enable javascript and cookies",
]

TECH_STACK_SIGNATURES = [
    {"name": "WordPress", "pattern": r"wp-content|wp-includes|generator\"[^>]*wordpress"},
    {"name": "WooCommerce", "pattern": r"woocommerce"},
    {"name": "Shopify", "pattern": r"cdn\.shopify\.com|shopify-section|Shopify\.theme"},
    {"name": "Wix", "pattern": r"static\.wixstatic\.com|wix-code|_wixCssStates"},
    {"name": "Squarespace", "pattern": r"static1\.squarespace\.com|squarespace-cdn"},
    {"name": "Webflow", "pattern": r"website-files\.com|data-wf-site"},
    {"name": "GoDaddy Website Builder", "pattern": r"godaddysites\.com|gdbootstrap"},
    {"name": "Weebly", "pattern": r"weebly\.com|weeblycloud"},
    {"name": "Joomla", "pattern": r"generator\"[^>]*joomla|/media/jui/"},
    {"name": "Drupal", "pattern": r"generator\"[^>]*drupal|sites/default/files"},
    {"name": "Magento", "pattern": r"Mage\.Cookies|static/frontend|magento"},
    {"name": "BigCommerce", "pattern": r"cdn\d*\.bigcommerce\.com"},
    {"name": "Next.js", "pattern": r"__NEXT_DATA__|_next/static"},
    {"name": "Gatsby", "pattern": r"___gatsby|gatsby-image"},
    {"name": "React", "pattern": r"data-reactroot|react-dom|id=\"root\">"},
    {"name": "Vue", "pattern": r"data-v-app|__VUE__|id=\"app\">"},
    {"name": "Angular", "pattern": r"ng-version=|\bng-app\b"},
]

SOCIAL_DOMAIN_PATTERNS = {
    "Facebook": r"(^|\.)facebook\.com$",
    "Instagram": r"(^|\.)instagram\.com$",
    "X / Twitter": r"(^|\.)(x|twitter)\.com$",
    "LinkedIn": r"(^|\.)linkedin\.com$",
    "TikTok": r"(^|\.)tiktok\.com$",
    "YouTube": r"(^|\.)youtube\.com$",
    "Pinterest": r"(^|\.)pinterest\.com$",
    "WhatsApp": r"(^|\.)wa\.me$|(^|\.)whatsapp\.com$",
}

EMAIL_REGEX = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"

PRICING_LINK_KEYWORDS = ["pricing", "plans", "packages", "rates", "cost"]
SERVICES_LINK_KEYWORDS = ["services", "what-we-do", "solutions", "offerings", "products"]

# ---------------------------------------------------------------------------
# LLM Extraction (llm_extractor.py) — Phase 2
# ---------------------------------------------------------------------------
# Mirrors client/src/main/constants.js's GEMINI_API_BASE / GEMINI_MODEL so
# the Python worker and the JS pitch/analyst callers hit the same endpoint.
# Update both places together if Google ships a newer default free-tier
# model.
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODEL = "gemini-2.0-flash"

LLM_EXTRACTION_TIMEOUT_MS = 20_000

# Rough character budget per section (page text, then links) sent in the
# prompt — keeps the request well inside Gemini Flash's context window and
# the free-tier per-request cost predictable even on very long pages.
MAX_LLM_PAYLOAD_CHARS = 12_000

# ---------------------------------------------------------------------------
# Query expansion (query_expansion.py)
# ---------------------------------------------------------------------------

BUSINESS_TYPE_HINT_GROUPS = {
    "foodAndDrink": [
        "restaurant", "restaurants", "cafe", "cafes", "coffee shop", "coffee shops", "bakery", "bakeries",
        "bar", "bars", "pub", "pubs", "nightclub", "nightclubs", "fast food", "food truck", "food trucks",
        "catering", "caterer", "caterers", "bakehouse", "confectionery", "ice cream", "juice bar", "brewery",
        "winery", "liquor store", "bistro", "diner", "buffet", "pizzeria", "deli", "delicatessen",
    ],
    "lodgingAndTravel": [
        "hotel", "hotels", "motel", "motels", "guesthouse", "guest house", "hostel", "hostels", "resort",
        "resorts", "villa", "villas", "bed and breakfast", "bnb", "travel agency", "travel agent", "tour operator",
        "car rental", "car hire", "taxi service", "airport transfer",
    ],
    "retailAndShopping": [
        "store", "stores", "shop", "shops", "boutique", "boutiques", "supermarket", "supermarkets", "market",
        "grocery", "groceries", "convenience store", "mall", "department store", "clothing", "clothing store",
        "wear", "fashion", "shoe store", "footwear", "jewel", "jeweller", "jewelers", "jewellery", "watch shop",
        "furniture", "furniture store", "home decor", "electronics", "electronics store", "mobile", "mobile shop",
        "phone", "phone shop", "computer", "computers", "computer store", "hardware", "hardware store",
        "hardware shop", "stationery", "bookstore", "bookshop", "toy store", "gift shop", "florist", "flower shop",
        "pet store", "pet shop", "sporting goods", "sports store", "bicycle shop", "bike shop", "thrift store",
        "antique store", "craft store", "party supplies",
    ],
    "healthAndBeauty": [
        "salon", "salons", "hair salon", "barber", "barbers", "barbershop", "spa", "spas", "nail salon",
        "beauty parlour", "beauty parlor", "clinic", "clinics", "hospital", "medical center", "dental clinic",
        "dentist", "dentists", "pharmacy", "pharmacies", "chemist", "optician", "opticians", "physiotherapy",
        "physiotherapist", "gym", "gyms", "fitness center", "yoga studio", "wellness center", "ayurveda",
        "veterinary", "vet clinic", "massage",
    ],
    "automotive": [
        "garage", "mechanic", "mechanics", "auto repair", "car repair", "car service", "car dealer",
        "car dealership", "motorcycle dealer", "tire shop", "tyre shop", "car wash", "auto parts", "spare parts",
    ],
    "professionalServices": [
        "agency", "agencies", "firm", "firms", "service", "services", "repair", "lawyer", "lawyers", "attorney",
        "law firm", "law firms", "accountant", "accountants", "accounting firm", "tax service", "consultant",
        "consultants", "consulting firm", "insurance agency", "insurance broker", "marketing agency",
        "advertising agency", "design studio", "photographer", "photographers", "photography studio",
        "printer", "printers", "printing", "print shop", "tailor", "tailors", "seamstress", "dry cleaner",
        "laundry", "notary",
    ],
    "homeAndConstruction": [
        "contractor", "contractors", "construction", "construction company", "builder", "builders",
        "electrician", "electricians", "plumber", "plumbers", "painter", "painters", "roofing company",
        "landscaping", "landscaper", "cleaning service", "pest control", "locksmith", "interior designer",
        "architect", "architects", "carpenter", "carpenters", "welding shop",
    ],
    "financeAndRealEstate": [
        "bank", "banks", "atm", "credit union", "real estate", "realtor", "realtors", "real estate agent",
        "property management", "apartments", "estate agent",
    ],
    "education": [
        "school", "schools", "preschool", "kindergarten", "tuition class", "tutoring center", "college",
        "university", "driving school", "language school", "music school", "daycare", "nursery",
    ],
}

BUSINESS_TYPE_HINTS = list({hint for group in BUSINESS_TYPE_HINT_GROUPS.values() for hint in group})

DEFAULT_CATEGORY_EXPANSION = [
    # Food & drink
    "restaurants", "cafes", "bakeries", "bars", "fast food restaurants", "coffee shops", "ice cream shops",
    "catering companies", "liquor stores",
    # Lodging & travel
    "hotels", "guesthouses", "travel agencies", "car rental agencies",
    # Retail & shopping
    "shops", "supermarkets", "grocery stores", "clothing stores", "shoe stores", "jewelry stores",
    "furniture stores", "electronics stores", "mobile phone shops", "computer stores", "hardware stores",
    "bookstores", "gift shops", "florists", "pet stores", "sporting goods stores",
    # Health & beauty
    "salons", "barbershops", "spas", "clinics", "dental clinics", "pharmacies", "gyms", "veterinary clinics",
    # Automotive
    "auto repair shops", "car dealerships", "tire shops", "car washes",
    # Professional services
    "law firms", "accounting firms", "insurance agencies", "marketing agencies", "photography studios",
    "printing shops", "tailors", "dry cleaners",
    # Home & construction
    "construction companies", "electricians", "plumbers", "painters", "landscaping companies",
    "cleaning services", "pest control services", "locksmiths", "interior designers",
    # Finance & real estate
    "banks", "real estate agents", "property management companies",
    # Education
    "schools", "preschools", "tutoring centers", "driving schools",
]

# Discovery runs DEFAULT_CATEGORY_EXPANSION roughly in order and stops fanning
# out further sub-queries once `desired` unique listings are found (see
# discover_listings in maps_pipeline.py). That means order matters for speed:
# categories that reliably return dense result feeds should run first so the
# target count is hit — and remaining sub-queries skipped — sooner. This is
# a fixed, hand-tuned priority order based on typical Google Maps listing
# density per category, not a per-search ranking (there's no signal yet to
# personalize it further).
_HIGH_YIELD_CATEGORIES_FIRST = [
    "restaurants", "shops", "cafes", "supermarkets", "salons", "clinics",
    "pharmacies", "hotels", "clothing stores", "hardware stores", "banks",
    "auto repair shops", "gyms", "real estate agents", "grocery stores",
    "bars", "schools", "electronics stores", "barbershops", "dental clinics",
]
DEFAULT_CATEGORY_EXPANSION = _HIGH_YIELD_CATEGORIES_FIRST + [
    category for category in DEFAULT_CATEGORY_EXPANSION
    if category not in _HIGH_YIELD_CATEGORIES_FIRST
]
