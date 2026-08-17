// src/main/businessProfiler.js
//
// Single-business deep extraction. Where scraper.js discovers *many*
// businesses from a Google Maps search, this module goes deep on *one*
// business's own website: pricing/services, contact info, social links,
// tech stack, and (optionally) a side-by-side comparison against 1-2
// competitor URLs. It also folds in the existing $0 audit (SSL, speed,
// mobile, analytics, abandoned-agency) from auditEngine.js so callers get
// one JSON object with everything a pitch/LLM step needs.
//
// scraper.js re-exports scrapeSingleBusiness() from here (see the bottom of
// scraper.js) so "the scraper" has a single-URL entry point, while keeping
// this file's Maps-unrelated logic out of scraper.js itself.
import { chromium } from 'playwright'
import {
  PROFILE_NAV_TIMEOUT_MS,
  MAX_PROFILE_RETRIES,
  USER_AGENT_POOL,
  ANTI_BOT_TEXT_PATTERNS,
  TECH_STACK_SIGNATURES,
  SOCIAL_DOMAIN_PATTERNS,
  EMAIL_REGEX,
  PRICING_LINK_KEYWORDS,
  SERVICES_LINK_KEYWORDS
} from './constants'
import { runZeroCostAudit, detectAbandonedAgency, normalizeUrl, hostnameOf } from './auditEngine'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitter(baseMs, spreadMs) {
  return baseMs + Math.random() * spreadMs
}

function pickUserAgent(attempt) {
  return USER_AGENT_POOL[attempt % USER_AGENT_POOL.length]
}

/** Anti-bot detection tuned for arbitrary third-party sites (Cloudflare/
 * PerimeterX/Akamai interstitials), not just Google. Non-fatal on error. */
async function isLikelyBlocked(page) {
  try {
    const text = await page.evaluate(() => document.body?.innerText || '')
    return ANTI_BOT_TEXT_PATTERNS.some((pattern) => pattern.test(text))
  } catch {
    return false
  }
}

/** 1.2a — Tech stack detection. Checks the raw HTML against known
 * fingerprints; returns every match plus a best-guess "platform" (the
 * first non-generic hit, since a WordPress site running React components
 * should still be reported as WordPress). */
function detectTechStack(html) {
  const matches = TECH_STACK_SIGNATURES.filter((sig) => sig.pattern.test(html)).map((sig) => sig.name)
  const platform = matches.find((name) => name !== 'HTML5 Template (static)') || matches[0] || 'Unknown'
  return { platform, signals: matches }
}

/** 1.2b — Contact info + social links. Pulls mailto/tel links and any
 * plain-text emails from the page, plus every outbound link matching a
 * known social platform domain (deduped per platform). */
async function extractContactAndSocial(page, html, siteHostname) {
  const links = await page
    .evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((a) => a.href))
    .catch(() => [])

  const emailsFromMailto = links
    .filter((href) => href.startsWith('mailto:'))
    .map((href) => href.replace('mailto:', '').split('?')[0].trim())

  const emailsFromText = Array.from(html.matchAll(EMAIL_REGEX)).map((m) => m[0])
  const emails = Array.from(new Set([...emailsFromMailto, ...emailsFromText])).filter(
    (e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e)
  )

  const phones = Array.from(
    new Set(
      links
        .filter((href) => href.startsWith('tel:'))
        .map((href) => href.replace('tel:', '').trim())
        .filter(Boolean)
    )
  )

  const social = {}
  for (const href of links) {
    const host = hostnameOf(href)
    if (!host || host === siteHostname) continue
    for (const [platform, pattern] of Object.entries(SOCIAL_DOMAIN_PATTERNS)) {
      if (pattern.test(host) && !social[platform]) {
        social[platform] = href
      }
    }
  }

  return { emails, phones, social }
}

/** 1.2c — Pricing / service page detection. Doesn't crawl the whole site —
 * just checks whether the homepage links to something that looks like a
 * pricing or services page, which is enough signal for a pitch ("no visible
 * pricing page" is itself a talking point). */
async function findPricingAndServiceLinks(page) {
  const navLinks = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        href: a.href,
        text: (a.textContent || '').trim().toLowerCase()
      }))
    )
    .catch(() => [])

  const matchAny = (keywords) =>
    navLinks.find(({ href, text }) => {
      const haystack = `${href.toLowerCase()} ${text}`
      return keywords.some((kw) => haystack.includes(kw))
    })

  const pricingLink = matchAny(PRICING_LINK_KEYWORDS)
  const servicesLink = matchAny(SERVICES_LINK_KEYWORDS)

  return {
    hasPricingPage: Boolean(pricingLink),
    pricingUrl: pricingLink?.href || '',
    hasServicesPage: Boolean(servicesLink),
    servicesUrl: servicesLink?.href || ''
  }
}

/** Loads one URL with anti-bot handling: rotates User-Agent per attempt,
 * retries with jittered backoff on a detected block/timeout, and returns a
 * friendly error instead of a raw exception once retries are exhausted. */
async function loadWithRetries(browser, url, onProgress) {
  let lastError = ''
  for (let attempt = 0; attempt <= MAX_PROFILE_RETRIES; attempt += 1) {
    const context = await browser.newContext({
      userAgent: pickUserAgent(attempt),
      viewport: { width: 1366, height: 900 },
      locale: 'en-US'
    })
    const page = await context.newPage()
    try {
      onProgress?.({
        phase: 'profiling',
        message: attempt === 0 ? `Opening ${url}…` : `Retrying (${attempt}/${MAX_PROFILE_RETRIES})…`
      })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PROFILE_NAV_TIMEOUT_MS })

      if (await isLikelyBlocked(page)) {
        throw new Error('BLOCKED')
      }

      await page.waitForTimeout(400)
      return { page, context }
    } catch (error) {
      lastError = error.message
      await context.close().catch(() => {})
      if (attempt < MAX_PROFILE_RETRIES) {
        await sleep(jitter(800, 700))
      }
    }
  }

  const friendly =
    lastError === 'BLOCKED'
      ? 'This site is blocking automated visits. Try again later or check it manually.'
      : `Could not load this site after ${MAX_PROFILE_RETRIES + 1} attempts (${lastError || 'unknown error'}).`
  throw new Error(friendly)
}

/** 1.3 — Competitor check. Runs the lightweight $0 audit + tech-stack read
 * on 1-2 competitor URLs so the main pitch can say "you're on X, they're on
 * Y" or "their site loads in Ns, yours takes Ms". Failures on a single
 * competitor don't kill the whole comparison. */
async function checkCompetitors(browser, competitorUrls, onProgress) {
  const urls = (competitorUrls || []).filter(Boolean).slice(0, 2)
  const results = []
  for (const rawUrl of urls) {
    const url = normalizeUrl(rawUrl)
    onProgress?.({ phase: 'profiling', message: `Checking competitor ${url}…` })
    try {
      const audit = await runZeroCostAudit(url)
      let techStack = { platform: 'Unknown', signals: [] }
      try {
        const { page, context } = await loadWithRetries(browser, url, onProgress)
        const html = await page.content()
        techStack = detectTechStack(html)
        await context.close()
      } catch {
        // Tech-stack read on the competitor is a bonus — the audit result
        // above is still useful on its own.
      }
      results.push({ url, success: true, ...audit, techStack })
    } catch (error) {
      results.push({ url, success: false, error: error.message })
    }
  }
  return results
}

/**
 * Runs the full single-business profile: audit + pricing/services +
 * contact/social + tech stack + (optional) competitor comparison, all
 * structured into one JSON object ready to hand to an LLM pitch step.
 *
 * @param {string} rawUrl
 * @param {{ competitorUrls?: string[] }} [options]
 * @param {(payload: object) => void} [onProgress]
 */
export async function scrapeBusinessProfile(rawUrl, options = {}, onProgress) {
  const url = normalizeUrl(rawUrl)
  if (!url) {
    return { success: false, error: 'Please provide a business website URL.' }
  }
  const hostname = hostnameOf(url)
  const competitorUrls = options.competitorUrls || []

  const browser = await chromium.launch({ headless: true })
  try {
    // 1.2: SSL / speed / mobile / analytics / abandoned-agency — reuse the
    // existing $0 audit rather than duplicating that logic here.
    onProgress?.({ phase: 'profiling', message: 'Running technical audit…' })
    const audit = await runZeroCostAudit(url)

    if (!audit.hasWebsite) {
      // Domain doesn't even resolve — nothing further to extract.
      return { success: true, url, hostname, ...audit, techStack: null, contact: null, competitors: [] }
    }

    // Load the page ourselves (audit.js already did once, but doesn't hand
    // back the page/HTML) with anti-bot retry handling for the rest of the
    // extraction — tech stack, pricing/services, contact + social.
    let page
    let context
    try {
      ;({ page, context } = await loadWithRetries(browser, url, onProgress))
    } catch (error) {
      return { success: true, url, hostname, ...audit, techStackError: error.message, competitors: [] }
    }

    const html = await page.content()
    const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '')
    const footerLinks = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('footer a[href], [class*="footer" i] a[href]')).map(
          (a) => a.href
        )
      )
      .catch(() => [])

    const techStack = detectTechStack(html)
    const contact = await extractContactAndSocial(page, html, hostname)
    const pricingAndServices = await findPricingAndServiceLinks(page)
    // Re-derive the agency-abandonment flag here too in case the caller
    // wants it alongside the rest of the profile without a second audit
    // call — cheap since it's already-loaded text/links.
    const abandonedAgency = await detectAbandonedAgency(pageText, footerLinks, hostname)

    await context.close()

    // 1.3: competitor check — independent of the main site's own load, so
    // failures here never affect the primary profile above.
    const competitors =
      competitorUrls.length > 0 ? await checkCompetitors(browser, competitorUrls, onProgress) : []

    onProgress?.({ phase: 'done' })

    return {
      success: true,
      url,
      hostname,
      ...audit,
      techStack,
      contact,
      ...pricingAndServices,
      abandonedAgency,
      competitors
    }
  } catch (error) {
    return { success: false, error: error.message }
  } finally {
    await browser.close()
  }
}
