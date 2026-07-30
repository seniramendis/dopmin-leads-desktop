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
//
// A bare place name (no business type) is fanned out into several category
// queries by queryExpansion.js before phase 1 runs, so "Mount Lavinia"
// finds real businesses instead of a near-empty result.
import { chromium } from 'playwright'
import {
  REPUTATION_THRESHOLDS,
  DETAIL_CONCURRENCY,
  DISCOVERY_CONCURRENCY,
  MAX_DETAIL_RETRIES,
  NAV_TIMEOUT_MS,
  SLOW_NAV_THRESHOLD_MS,
  MAX_CONSECUTIVE_NETWORK_FAILURES
} from './constants'
import { expandQuery } from './queryExpansion'
import { checkInternetConnection, NetworkHealth, ConnectionLostError } from './network'

/** Blocks images/fonts/media/stylesheets on every request this context
 * makes. None of the data we read (aria-labels, data-item-id attributes,
 * innerText) depends on CSS or images actually rendering, so this is pure
 * bandwidth/CPU waste for a scraper. Cuts page weight dramatically and
 * speeds up both discovery and detail extraction. */
async function blockHeavyResources(context) {
  await context.route('**/*', (route) => {
    const resourceType = route.request().resourceType()
    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
      route.abort()
    } else {
      route.continue()
    }
  })
}

/** Tiny concurrency-limited map — runs `worker` over `items` with at most
 * `limit` in flight at once, in-order results. Avoids pulling in a
 * dependency for something this small. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function run() {
    while (nextIndex < items.length) {
      const i = nextIndex
      nextIndex += 1
      results[i] = await worker(items[i], i)
    }
  }
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run)
  await Promise.all(runners)
  return results
}

class RateLimitedError extends Error {
  constructor() {
    super('Google temporarily rate-limited this search. Wait a bit and try again.')
    this.name = 'RateLimitedError'
  }
}

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
    // With images/fonts/media blocked, the feed re-renders much faster
    // than a full-weight page, so a shorter wait keeps the scroll loop
    // safe from bot-detection while cutting a lot of idle time.
    await sleep(jitter(500, 300))
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

async function extractDetail(context, listing, onRetryUsed, networkHealth) {
  let attempt = 0
  let lastError = ''

  while (attempt <= MAX_DETAIL_RETRIES) {
    if (networkHealth?.aborted) {
      return { success: false, href: listing.href, quickName: listing.quickName, error: 'Connection lost' }
    }

    const page = await context.newPage()
    try {
      const navStart = Date.now()
      await page.goto(withLocale(listing.href), {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS
      })
      networkHealth?.recordSuccess(Date.now() - navStart)

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
      networkHealth?.recordFailure(error.message)
      attempt += 1
      onRetryUsed?.()
      if (networkHealth?.aborted) break
      if (attempt <= MAX_DETAIL_RETRIES) {
        await sleep(jitter(700, 600))
      }
    }
  }

  return { success: false, href: listing.href, quickName: listing.quickName, error: lastError }
}

async function runDetailPool(context, listings, concurrency, onProgress, networkHealth) {
  const results = new Array(listings.length)
  let nextIndex = 0
  let completed = 0
  let retries = 0

  async function worker() {
    while (nextIndex < listings.length) {
      if (networkHealth?.aborted) return
      const i = nextIndex
      nextIndex += 1
      results[i] = await extractDetail(
        context,
        listings[i],
        () => {
          retries += 1
        },
        networkHealth
      )
      completed += 1
      onProgress?.({
        phase: 'extracting',
        done: completed,
        total: listings.length,
        retries
      })
      await sleep(jitter(80, 120))
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, listings.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

/**
 * Runs the discovery phase across every sub-query, deduping listings by
 * href as it goes, and stops as soon as `desired` unique listings are
 * found (or every sub-query has been tried).
 */
async function discoverListings(context, subQueries, desired, onProgress, networkHealth) {
  const listings = []
  const seenHrefs = new Set()
  const isExpanded = subQueries.length > 1
  let rateLimited = false
  let launched = 0

  async function runSubQuery(subQuery, i) {
    // Once we already have enough (from sub-queries that finished sooner),
    // we've hit a rate limit, or the connection has been declared dead,
    // skip starting any more new tabs. Tabs already in flight are still
    // allowed to finish.
    if (listings.length >= desired || rateLimited || networkHealth?.aborted) return

    launched += 1
    const listPage = await context.newPage()
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(subQuery)}?hl=en`

    onProgress?.({
      phase: 'searching',
      message: isExpanded
        ? `Broadening the search — trying "${subQuery}" (${i + 1}/${subQueries.length})…`
        : `Opening Google Maps for "${subQuery}"…`
    })

    try {
      const navStart = Date.now()
      await listPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      networkHealth?.recordSuccess(Date.now() - navStart)

      if (await isBlockedPage(listPage)) {
        await listPage.close()
        // If we already have some results from earlier sub-queries, keep
        // them rather than failing the whole search over one rate limit.
        if (listings.length > 0 || launched > 1) {
          rateLimited = true
          return
        }
        throw new RateLimitedError()
      }

      await dismissConsentIfPresent(listPage)
      await listPage.waitForTimeout(1500)

      const remaining = Math.max(1, desired - listings.length)
      const found = await collectListingUrls(listPage, remaining, onProgress)
      for (const item of found) {
        if (seenHrefs.has(item.href)) continue
        seenHrefs.add(item.href)
        listings.push(item)
      }
    } catch (error) {
      if (error instanceof RateLimitedError) throw error
      networkHealth?.recordFailure(error.message)
      // One sub-query failing (nav error/timeout) shouldn't kill the
      // whole search — the others still run, unless the connection has
      // now been declared dead, in which case no more get launched above.
    } finally {
      await listPage.close().catch(() => {})
    }
  }

  // Run sub-queries with a small concurrency window instead of strictly
  // one-at-a-time. Category expansion (e.g. "restaurants in X",
  // "hotels in X", ...) are independent searches, so this is the biggest
  // lever for multi-category discovery speed.
  const concurrency = isExpanded ? DISCOVERY_CONCURRENCY : 1
  await mapWithConcurrency(subQueries, concurrency, runSubQuery)

  return { listings, isExpanded }
}

function toLead(raw, index) {
  const hasRating = typeof raw.rating === 'number' && !Number.isNaN(raw.rating)
  const rating = hasRating ? raw.rating : null
  const reputation = classifyReputation(rating)

  const isHotLead = !raw.hasWebsite && hasRating && rating >= REPUTATION_THRESHOLDS.good
  const isReputationRisk = !raw.hasWebsite && hasRating && rating < 3.5

  return {
    id: `${Date.now()}-${index}`,
    name: raw.name,
    phone: raw.phone || 'No phone listed',
    address: raw.address || '',
    category: raw.category || '',
    openStatus: raw.openStatus || '',
    status: raw.hasWebsite ? 'Has Website' : 'No Website Found',
    hasWebsite: raw.hasWebsite,
    website: raw.website || '',
    rating,
    reviewCount: raw.reviewCount,
    reputation,
    isHotLead,
    isReputationRisk,
    mapsUrl: raw.href
  }
}

export async function scrapeLeads(query, maxResults = 20, onProgress) {
  // Clamp to a sane range but otherwise respect exactly what the user asked
  // for. If Google Maps doesn't actually have that many results, we return
  // everything we genuinely found instead of padding or over-promising.
  const desired = Math.max(1, Math.min(500, Number(maxResults) || 20))
  const subQueries = expandQuery(query)

  // Fail fast if there's no connection at all, instead of spending 30-60s
  // watching every navigation time out one by one.
  onProgress?.({ phase: 'searching', message: 'Checking your internet connection…' })
  const online = await checkInternetConnection()
  if (!online) {
    return {
      success: false,
      error: 'No internet connection detected. Please check your connection and try again.',
      errorType: 'offline'
    }
  }

  // Tracks connection quality for the whole run — flips `aborted` once too
  // many navigations in a row fail with a network-level error, at which
  // point every loop below stops launching new work.
  const networkHealth = new NetworkHealth({
    onProgress,
    slowThresholdMs: SLOW_NAV_THRESHOLD_MS,
    maxConsecutiveFailures: MAX_CONSECUTIVE_NETWORK_FAILURES
  })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  })

  await blockHeavyResources(context)

  try {
    const { listings, isExpanded } = await discoverListings(
      context,
      subQueries,
      desired,
      onProgress,
      networkHealth
    )

    if (networkHealth.aborted) throw new ConnectionLostError()

    if (listings.length === 0) {
      return {
        success: true,
        leads: [],
        requested: desired,
        totalFound: 0,
        truncated: false,
        failedCount: 0,
        expanded: isExpanded,
        queriesUsed: subQueries
      }
    }

    const targetListings = listings.slice(0, desired)
    onProgress?.({ phase: 'extracting', done: 0, total: targetListings.length, retries: 0 })

    const detailResults = await runDetailPool(
      context,
      targetListings,
      DETAIL_CONCURRENCY,
      onProgress,
      networkHealth
    )

    if (networkHealth.aborted) throw new ConnectionLostError()

    // Workers stop early (leaving `undefined` holes) once the connection
    // is declared dead — filter those out before counting successes.
    const attempted = detailResults.filter(Boolean)
    const succeeded = attempted.filter((r) => r.success)
    const failedCount = attempted.length - succeeded.length
    const leads = succeeded.map(toLead)

    onProgress?.({ phase: 'done', total: leads.length })

    return {
      success: true,
      leads,
      requested: desired,
      totalFound: listings.length, // how many unique businesses were actually found
      truncated: listings.length > desired, // true if more exist beyond what was returned
      failedCount, // listings that couldn't be read even after retries
      expanded: isExpanded, // true if we broadened a bare place name into categories
      queriesUsed: subQueries
    }
  } catch (error) {
    const errorType = error instanceof ConnectionLostError ? 'offline' : undefined
    return { success: false, error: error.message, errorType }
  } finally {
    await browser.close()
  }
}
