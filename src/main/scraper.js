// src/main/scraper.js
//
// Search + indexing pipeline for worldwide Google Maps business data.
//
// Two-phase design:
//   Phase 1 (discovery) — scroll the results feed for the query and collect
//   every unique place URL. This is cheap and fast: it only reads anchor
//   hrefs, so it doesn't miss data because a card was too small/collapsed.
//
//   Phase 2 (extraction) — visit each place's own detail page (in a small
//   pool of parallel tabs) and read the sidebar directly. Every listing has
//   this same sidebar regardless of what its feed card happened to render,
//   which is what makes phone numbers and website presence trustworthy —
//   the old implementation guessed both from truncated card text and missed
//   a large fraction of businesses that had them.
import { chromium } from 'playwright'

// Rating thresholds used to classify a lead's reputation from its Google
// Maps star rating. This is what powers the "good reviews vs bad reviews"
// split shown in the UI (High-Value Leads vs Reputation Rescue).
const REPUTATION_THRESHOLDS = {
  excellent: 4.5, // 4.5★ and up
  good: 4.0, // 4.0★ – 4.49★
  average: 3.0 // 3.0★ – 3.99★  (below this = "poor")
}

// How many place detail pages we read at once. Higher = faster, but more
// likely to trip Google's rate limiting on very large runs. 6 is a good
// balance for a single headless browser instance.
const DETAIL_CONCURRENCY = 6

// Retries per listing if a detail page fails to load or times out.
const MAX_DETAIL_RETRIES = 2

const NAV_TIMEOUT_MS = 30000

function classifyReputation(rating) {
  if (rating === null || Number.isNaN(rating)) return 'unrated'
  if (rating >= REPUTATION_THRESHOLDS.excellent) return 'excellent'
  if (rating >= REPUTATION_THRESHOLDS.good) return 'good'
  if (rating >= REPUTATION_THRESHOLDS.average) return 'average'
  return 'poor'
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitter(baseMs, spreadMs) {
  return baseMs + Math.random() * spreadMs
}

/** Forces English + a stable region-neutral locale on any Maps URL so the
 * parsing logic below (aria-labels, "stars"/"reviews" text, etc.) behaves
 * the same no matter which country/city the search targets. */
function withLocale(href) {
  try {
    const url = new URL(href)
    url.searchParams.set('hl', 'en')
    return url.toString()
  } catch {
    return href
  }
}

/** Google occasionally shows an EU/UK cookie-consent interstitial before
 * the app loads. It only appears once per browser context, but we defend
 * against it wherever it might show up. */
async function dismissConsentIfPresent(page) {
  try {
    const candidates = [
      'button:has-text("Accept all")',
      'button:has-text("I agree")',
      'form[action*="consent"] button'
    ]
    for (const selector of candidates) {
      const btn = await page.$(selector)
      if (btn) {
        await btn.click({ timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(1200)
        return
      }
    }
  } catch {
    // Non-fatal — if there's no consent wall this is a no-op.
  }
}

async function isBlockedPage(page) {
  try {
    const text = await page.evaluate(() => document.body?.innerText || '')
    return /unusual traffic|automated queries|our systems have detected/i.test(text)
  } catch {
    return false
  }
}

/**
 * Scrolls the Google Maps results feed until either:
 *  - we have at least `desired` unique place URLs on screen,
 *  - Google's own "You've reached the end of the list" marker appears, or
 *  - the feed stops growing for several rounds in a row.
 * Uses both a real wheel event and a direct scrollTop nudge on every round,
 * since Maps' lazy-loading is more reliable when it sees genuine scroll
 * input rather than only a programmatic scrollTop jump.
 */
async function collectListingUrls(page, desired, onProgress) {
  await page
    .waitForSelector('div[role="feed"], div[role="main"]', { timeout: 15000 })
    .catch(() => {})

  let previousCount = 0
  let stagnantRounds = 0
  const maxRounds = Math.min(120, Math.ceil(desired / 3) + 20)

  for (let round = 0; round < maxRounds; round += 1) {
    try {
      const feedBox = await page.$('div[role="feed"]')
      if (feedBox) {
        const box = await feedBox.boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.mouse.wheel(0, 1600)
        }
      }
    } catch {
      // ignore — the programmatic scroll below still runs
    }

    const currentCount = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]')
      if (feed) feed.scrollTop = feed.scrollHeight
      else window.scrollTo(0, document.body.scrollHeight)
      return document.querySelectorAll('a[href*="/maps/place/"]').length
    })

    onProgress?.({ phase: 'discovering', found: currentCount, target: desired })

    if (currentCount >= desired) break

    const reachedEnd = await page.evaluate(() =>
      /you.?ve reached the end of the list/i.test(document.body?.innerText || '')
    )
    if (reachedEnd) break

    if (currentCount <= previousCount) {
      stagnantRounds += 1
      if (stagnantRounds >= 4) break
    } else {
      stagnantRounds = 0
    }

    previousCount = currentCount
    await sleep(jitter(1000, 500))
  }

  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
    const seen = new Set()
    const out = []
    for (const anchor of anchors) {
      const href = anchor.href
      if (!href || seen.has(href)) continue
      seen.add(href)
      out.push({ href, quickName: anchor.getAttribute('aria-label') || '' })
    }
    return out
  })
}

/** Finds the "X.X stars, N reviews"-style aria-label near the listing
 * title. This is far more stable across Google's UI/class-name changes
 * than scraping visible star icons or CSS classes. */
function ratingParseScript() {
  const spans = Array.from(document.querySelectorAll('span[aria-label]'))
  const ratingSpan = spans.find((s) => /^[\d.]+\s*star/i.test(s.getAttribute('aria-label') || ''))
  const label = ratingSpan ? ratingSpan.getAttribute('aria-label') || '' : ''
  const ratingMatch = label.match(/([\d.]+)\s*star/i)
  const reviewMatch = label.match(/([\d,]+)\s*review/i)
  return {
    rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
    reviewCount: reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ''), 10) : 0
  }
}

/** Reads one place's detail sidebar. Runs inside page.evaluate. */
function detailParseScript() {
  const name = document.querySelector('h1')?.textContent?.trim() || ''

  // Phone: Google renders a dedicated button whose data-item-id always
  // starts with "phone:tel:" — this attribute has been stable for years
  // even as surrounding class names churn.
  const phoneBtn =
    document.querySelector('button[data-item-id^="phone:tel:"]') ||
    document.querySelector('a[href^="tel:"]')
  let phone = ''
  if (phoneBtn) {
    const ariaLabel = phoneBtn.getAttribute('aria-label') || ''
    const href = phoneBtn.getAttribute('href') || ''
    phone =
      ariaLabel.replace(/^phone:\s*/i, '').trim() ||
      phoneBtn.textContent?.trim() ||
      href.replace('tel:', '').trim()
  }

  // Website: data-item-id "authority" is Google's stable hook for the
  // official website link/button on a place page.
  const websiteEl = document.querySelector('a[data-item-id="authority"]')
  const hasWebsite = !!websiteEl
  const website = websiteEl ? websiteEl.getAttribute('href') || '' : ''

  // Address
  const addressBtn = document.querySelector('button[data-item-id="address"]')
  const address = addressBtn
    ? (addressBtn.getAttribute('aria-label') || '').replace(/^address:\s*/i, '').trim()
    : ''

  // Category (business type) — best-effort, several fallback selectors
  // since Google doesn't give this one a stable data attribute.
  const categoryButton = document.querySelector('button[jsaction*="category"]')
  const category = categoryButton?.textContent?.trim() || ''

  // Open/closed status — best-effort.
  const hoursText = Array.from(document.querySelectorAll('span'))
    .map((s) => s.textContent || '')
    .find((t) => /^(open|closed|opens|closes)\b/i.test(t.trim()))
  const openStatus = hoursText ? hoursText.trim() : ''

  return { name, phone, hasWebsite, website, address, category, openStatus }
}

async function extractDetail(context, listing, onRetryUsed) {
  let attempt = 0
  let lastError = ''

  while (attempt <= MAX_DETAIL_RETRIES) {
    const page = await context.newPage()
    try {
      await page.goto(withLocale(listing.href), {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS
      })

      if (await isBlockedPage(page)) {
        throw new Error('Rate limited by Google Maps')
      }

      await dismissConsentIfPresent(page)
      await page.waitForSelector('h1', { timeout: 15000 })
      await page.waitForTimeout(500)

      const detail = await page.evaluate(detailParseScript)
      const ratingInfo = await page.evaluate(ratingParseScript)

      await page.close()

      return {
        success: true,
        href: listing.href,
        name: detail.name || listing.quickName || 'Unnamed business',
        phone: detail.phone || '',
        hasWebsite: detail.hasWebsite,
        website: detail.website,
        address: detail.address,
        category: detail.category,
        openStatus: detail.openStatus,
        rating: ratingInfo.rating,
        reviewCount: ratingInfo.reviewCount
      }
    } catch (error) {
      lastError = error.message
      await page.close().catch(() => {})
      attempt += 1
      onRetryUsed?.()
      if (attempt <= MAX_DETAIL_RETRIES) {
        await sleep(jitter(700, 600))
      }
    }
  }

  return { success: false, href: listing.href, quickName: listing.quickName, error: lastError }
}

async function runDetailPool(context, listings, concurrency, onProgress) {
  const results = new Array(listings.length)
  let nextIndex = 0
  let completed = 0
  let retries = 0

  async function worker() {
    while (nextIndex < listings.length) {
      const i = nextIndex
      nextIndex += 1
      results[i] = await extractDetail(context, listings[i], () => {
        retries += 1
      })
      completed += 1
      onProgress?.({
        phase: 'extracting',
        done: completed,
        total: listings.length,
        retries
      })
      await sleep(jitter(150, 250))
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, listings.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

export async function scrapeLeads(query, maxResults = 20, onProgress) {
  // Clamp to a sane range but otherwise respect exactly what the user asked
  // for. If Google Maps doesn't actually have that many results, we return
  // everything we genuinely found instead of padding or over-promising.
  const desired = Math.max(1, Math.min(500, Number(maxResults) || 20))

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  })

  try {
    const listPage = await context.newPage()
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`

    onProgress?.({ phase: 'searching', message: `Opening Google Maps for "${query}"…` })
    await listPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })

    if (await isBlockedPage(listPage)) {
      await listPage.close()
      return {
        success: false,
        error: 'Google temporarily rate-limited this search. Wait a bit and try again.'
      }
    }

    await dismissConsentIfPresent(listPage)
    await listPage.waitForTimeout(2500)

    const listings = await collectListingUrls(listPage, desired, onProgress)
    await listPage.close()

    if (listings.length === 0) {
      return {
        success: true,
        leads: [],
        requested: desired,
        totalFound: 0,
        truncated: false,
        failedCount: 0
      }
    }

    const targetListings = listings.slice(0, desired)
    onProgress?.({ phase: 'extracting', done: 0, total: targetListings.length, retries: 0 })

    const detailResults = await runDetailPool(
      context,
      targetListings,
      DETAIL_CONCURRENCY,
      onProgress
    )

    const succeeded = detailResults.filter((r) => r.success)
    const failedCount = detailResults.length - succeeded.length

    const leads = succeeded.map((lead, index) => {
      const hasRating = typeof lead.rating === 'number' && !Number.isNaN(lead.rating)
      const rating = hasRating ? lead.rating : null
      const reputation = classifyReputation(rating)

      const isHotLead = !lead.hasWebsite && hasRating && rating >= REPUTATION_THRESHOLDS.good
      const isReputationRisk = !lead.hasWebsite && hasRating && rating < 3.5

      return {
        id: `${Date.now()}-${index}`,
        name: lead.name,
        phone: lead.phone || 'No phone listed',
        address: lead.address || '',
        category: lead.category || '',
        openStatus: lead.openStatus || '',
        status: lead.hasWebsite ? 'Has Website' : 'No Website Found',
        hasWebsite: lead.hasWebsite,
        website: lead.website || '',
        rating,
        reviewCount: lead.reviewCount,
        reputation,
        isHotLead,
        isReputationRisk,
        mapsUrl: lead.href
      }
    })

    onProgress?.({ phase: 'done', total: leads.length })

    return {
      success: true,
      leads,
      requested: desired,
      totalFound: listings.length, // how many unique businesses were actually found
      truncated: listings.length > desired, // true if more exist beyond what was returned
      failedCount // listings that couldn't be read even after retries
    }
  } catch (error) {
    return { success: false, error: error.message }
  } finally {
    await browser.close()
  }
}
