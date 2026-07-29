// src/main/scraper.js
import { chromium } from 'playwright'

// Rating thresholds used to classify a lead's reputation from its Google
// Maps star rating. This is what powers the "good reviews vs bad reviews"
// split shown in the UI (High-Value Leads vs Reputation Rescue).
const REPUTATION_THRESHOLDS = {
  excellent: 4.5, // 4.5★ and up
  good: 4.0, // 4.0★ – 4.49★
  average: 3.0 // 3.0★ – 3.99★  (below this = "poor")
}

function classifyReputation(rating) {
  if (rating === null || Number.isNaN(rating)) return 'unrated'
  if (rating >= REPUTATION_THRESHOLDS.excellent) return 'excellent'
  if (rating >= REPUTATION_THRESHOLDS.good) return 'good'
  if (rating >= REPUTATION_THRESHOLDS.average) return 'average'
  return 'poor'
}

/**
 * Scrolls the Google Maps results feed until either:
 *  - we have at least `desired` unique-looking results on screen, or
 *  - the feed stops growing for a few rounds in a row (end of list reached)
 * This lets us honour a user-chosen result count without artificially
 * capping at a hardcoded number, and without over-scrolling past what
 * Google Maps actually has to offer.
 */
async function scrollResultsFeed(page, desired) {
  let previousCount = 0
  let stagnantRounds = 0
  const maxScrollRounds = Math.min(60, Math.ceil(desired / 5) + 12)

  for (let round = 0; round < maxScrollRounds; round += 1) {
    const currentCount = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]')
      if (feed) feed.scrollTop = feed.scrollHeight
      window.scrollTo(0, document.body.scrollHeight)
      return document.querySelectorAll('a[href*="/maps/place/"]').length
    })

    if (currentCount >= desired) break

    if (currentCount <= previousCount) {
      stagnantRounds += 1
      // Google Maps shows a "You've reached the end of the list" state.
      // Three flat rounds in a row means there's genuinely nothing left
      // to load, so we stop rather than looping until the round budget
      // runs out.
      if (stagnantRounds >= 3) break
    } else {
      stagnantRounds = 0
    }

    previousCount = currentCount
    await page.waitForTimeout(1200)
  }
}

/**
 * Extracts one candidate lead per unique listing anchor. Using
 * `a[href*="/maps/place/"]` (rather than every nested <div>) means each
 * business is only visited once per unique place URL, which is the main
 * source of the duplicate-row problem in the old implementation.
 */
async function extractRawLeads(page) {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
    const seenHrefs = new Set()
    const results = []

    for (const anchor of anchors) {
      const href = anchor.href
      if (!href || seenHrefs.has(href)) continue

      // Walk up to the card/article wrapper so we read the text for this
      // one listing only, not the whole feed.
      let container = anchor
      for (let i = 0; i < 6 && container.parentElement; i += 1) {
        container = container.parentElement
        if (container.getAttribute('role') === 'article') break
      }

      const text = (container.innerText || container.textContent || '').trim()
      if (!text) continue

      const name = (anchor.getAttribute('aria-label') || text.split('\n')[0] || '').trim()
      if (!name || name.length < 2) continue

      seenHrefs.add(href)

      // Prefer the accessible star-rating label (e.g. "4.8 stars 42 Reviews")
      // over scraping raw text, since it's far less likely to misfire.
      const ratingEl = container.querySelector(
        'span[role="img"][aria-label*="star"], span[aria-label*="stars"]'
      )
      const ratingLabel = ratingEl ? ratingEl.getAttribute('aria-label') || '' : ''

      const ratingMatch = ratingLabel.match(/([\d.]+)\s*star/i) || text.match(/(\d(?:\.\d)?)\s*(?:stars|\()/i)
      const reviewMatch = ratingLabel.match(/([\d,]+)\s*review/i) || text.match(/\((\d[\d,]*)\)/)

      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null
      const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ''), 10) : 0

      const normalized = text.toLowerCase()
      const hasWebsite = /\bwebsite\b/.test(normalized) || /https?:\/\//.test(normalized)

      const phoneMatch = text.match(/(\+?\d[\d\s().-]{8,}\d)/)
      const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, ' ').trim() : 'No phone listed'

      results.push({ href, name, phone, hasWebsite, rating, reviewCount })
    }

    return results
  })
}

/**
 * De-duplicates raw leads twice over: first by their unique Google Maps
 * place URL (the most reliable identifier), then defensively by
 * name+phone in case the same business ever appears under two different
 * place URLs (happens occasionally with re-indexed listings).
 */
function dedupeLeads(rawLeads) {
  const byHref = new Map()
  for (const lead of rawLeads) {
    if (!byHref.has(lead.href)) byHref.set(lead.href, lead)
  }

  const byIdentity = new Map()
  for (const lead of byHref.values()) {
    const key = `${lead.name.toLowerCase()}|${lead.phone}`
    if (!byIdentity.has(key)) byIdentity.set(key, lead)
  }

  return Array.from(byIdentity.values())
}

export async function scrapeLeads(query, maxResults = 20) {
  // Clamp to a sane range but otherwise respect exactly what the user asked
  // for. If Google Maps doesn't actually have that many results, we return
  // everything we genuinely found instead of padding or over-promising.
  const desired = Math.max(1, Math.min(500, Number(maxResults) || 20))

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(4000)

    await scrollResultsFeed(page, desired)

    const rawLeads = await extractRawLeads(page)
    const deduped = dedupeLeads(rawLeads)
    const totalFound = deduped.length

    const leads = deduped.slice(0, desired).map((lead, index) => {
      const hasRating = typeof lead.rating === 'number' && !Number.isNaN(lead.rating)
      const rating = hasRating ? lead.rating : null
      const reputation = classifyReputation(rating)

      // "Good reviews" candidates: no website + rating shows they're
      // already well-liked -> ready for cold outreach.
      const isHotLead = !lead.hasWebsite && hasRating && rating >= REPUTATION_THRESHOLDS.good

      // "Bad reviews" candidates: no website + rating shows real
      // reputation trouble -> reputation-rescue outreach angle.
      const isReputationRisk = !lead.hasWebsite && hasRating && rating < 3.5

      return {
        id: `${Date.now()}-${index}`,
        name: lead.name,
        phone: lead.phone,
        status: lead.hasWebsite ? 'Has Website' : 'No Website Found',
        hasWebsite: lead.hasWebsite,
        rating,
        reviewCount: lead.reviewCount,
        reputation, // 'excellent' | 'good' | 'average' | 'poor' | 'unrated'
        isHotLead,
        isReputationRisk,
        mapsUrl: lead.href
      }
    })

    return {
      success: true,
      leads,
      requested: desired,
      totalFound, // how many unique businesses were actually found
      truncated: totalFound > desired // true if more exist beyond what was returned
    }
  } catch (error) {
    return { success: false, error: error.message }
  } finally {
    await browser.close()
  }
}
