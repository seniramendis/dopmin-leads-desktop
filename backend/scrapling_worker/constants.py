"""Port of client/src/main/constants.js — every tuning knob and reference
list the scraping pipeline needs, now living next to the Python workers so
they can be tweaked (or unit tested) without touching scraping logic."""

# Rating thresholds used to classify a lead's reputation from its Google
# Maps star rating (powers the High-Value Leads vs Reputation Rescue split).
REPUTATION_THRESHOLDS = {
    "excellent": 4.5,
    "good": 4.0,
    "average": 3.0,
}

# How many place detail pages we read at once. Scrapling's AsyncStealthySession
# page pool is created with this size; disable_resources=True keeps each tab's
# CPU/RAM footprint low enough to support this many parallel pages safely.
DETAIL_CONCURRENCY = 10

# How many category sub-queries run at once during discovery.
DISCOVERY_CONCURRENCY = 3

# Retries per listing if a detail page fails to load or times out.
MAX_DETAIL_RETRIES = 2

NAV_TIMEOUT_MS = 30_000

# A navigation slower than this surfaces a one-time "slow connection" warning.
SLOW_NAV_THRESHOLD_MS = 12_000

# How many network-level navigation failures in a row before the whole
# search is aborted instead of grinding into a dead connection.
MAX_CONSECUTIVE_NETWORK_FAILURES = 4

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
