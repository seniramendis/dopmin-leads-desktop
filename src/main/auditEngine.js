// src/main/auditEngine.js
//
// Turns "No Website Found" (or "Has Website") into an actual sales asset:
// a 1-page technical audit the user can paste straight into a cold
// WhatsApp/email pitch. Everything here runs locally with Node's built-in
// `https`/`http`/`dns` modules plus a single headless Playwright page —
// no paid API (ZoomInfo/Apollo/PageSpeed Insights quota/etc) required.
//
// Two things come out of this module:
//   1. runZeroCostAudit(url)   → SSL, speed, mobile-responsive, SEO/pixel
//                                 score out of 100, plus a punchy issues list.
//   2. detectAbandonedAgency() → scans the footer for "Designed by X" /
//                                 "Powered by X" credits and checks whether
//                                 that agency's own domain is still alive.
import https from 'https'
import http from 'http'
import dns from 'dns/promises'
import { chromium } from 'playwright'
import {
  AUDIT_HTTP_TIMEOUT_MS,
  AUDIT_NAV_TIMEOUT_MS,
  AUDIT_SLOW_LOAD_MS,
  MOBILE_VIEWPORT,
  AUDIT_SCORE_WEIGHTS,
  AGENCY_FOOTER_PATTERNS,
  ANALYTICS_SIGNATURES
} from './constants'

function normalizeUrl(url) {
  const trimmed = (url || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Raw HTTP(S) GET — used only for the plain-HTTP fallback check and for
 * checking whether a *different* domain (an old agency's site) is dead. We
 * deliberately don't use this for the main audit's HTML, since Playwright
 * gives us both the rendered DOM (for the mobile check) and the response
 * timing in one page load. */
function rawGet(targetUrl, timeoutMs = AUDIT_HTTP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false
    const client = targetUrl.startsWith('https') ? https : http
    const req = client.get(
      targetUrl,
      { timeout: timeoutMs, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DopminAudit/1.0)' } },
      (res) => {
        settled = true
        resolve({ status: res.statusCode || 0 })
        res.resume()
      }
    )
    req.on('error', () => {
      if (!settled) resolve({ status: 0 })
    })
    req.on('timeout', () => {
      req.destroy()
      if (!settled) resolve({ status: 0 })
    })
  })
}

/** DNS resolution is the cheapest possible "is this domain even alive?"
 * check — no HTTP round trip needed, so it's used both for the target site
 * and for any agency-credit domain we find in the footer. */
async function domainIsAlive(hostname) {
  if (!hostname) return false
  try {
    await dns.resolve(hostname)
    return true
  } catch {
    return false
  }
}

/** Looks for "Designed by X" / "Powered by X" style credits anywhere in the
 * page text or footer links, then checks whether the credited agency's own
 * domain still resolves. A dead agency domain is the single strongest
 * "sitting duck" signal for a maintenance-takeover pitch. */
async function detectAbandonedAgency(pageText, footerLinks, siteHostname) {
  let agencyName = ''
  for (const pattern of AGENCY_FOOTER_PATTERNS) {
    const match = pageText.match(pattern)
    if (match && match[1]) {
      agencyName = match[1].trim().replace(/\s{2,}/g, ' ')
      break
    }
  }

  if (!agencyName && footerLinks.length === 0) {
    return { found: false }
  }

  // Prefer a footer link that isn't the site's own domain — that's almost
  // always the agency's site (e.g. "Powered by Acme Web Co" linking out to
  // acmewebco.com).
  const externalLink = footerLinks.find((href) => {
    const h = hostnameOf(href)
    return h && h !== siteHostname
  })

  if (!agencyName && !externalLink) return { found: false }

  const agencyDomain = externalLink ? hostnameOf(externalLink) : ''
  const agencyDomainDead = agencyDomain ? !(await domainIsAlive(agencyDomain)) : false

  return {
    found: true,
    agencyName: agencyName || agencyDomain || 'a previous agency',
    agencyDomain,
    agencyDomainDead
  }
}

/**
 * Runs the full $0 audit on a single URL. Returns a score (0-100), a list of
 * plain-English issues ready to paste into a pitch, and the raw signals
 * behind them so the UI can render individual check badges.
 */
export async function runZeroCostAudit(rawUrl) {
  const url = normalizeUrl(rawUrl)
  if (!url) {
    return { hasWebsite: false, score: 0, issues: ['No website present'], checks: {} }
  }

  const hostname = hostnameOf(url)

  // 1. DNS — is this even a live domain?
  const alive = await domainIsAlive(hostname)
  if (!alive) {
    return {
      hasWebsite: false,
      score: 0,
      issues: ['Domain does not resolve (dead/expired domain)'],
      checks: { dnsAlive: false }
    }
  }

  const issues = []
  let score = 100
  const isHttps = url.startsWith('https://')
  const checks = { dnsAlive: true, https: isHttps }

  if (!isHttps) {
    score -= AUDIT_SCORE_WEIGHTS.noSsl
    issues.push('Missing SSL Certificate (Insecure Connection)')
  }

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    })
    const page = await context.newPage()

    const startTime = Date.now()
    let response
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: AUDIT_NAV_TIMEOUT_MS })
    } catch {
      // HTTPS navigation failed outright (bad cert, refused connection,
      // timeout) — try the plain-HTTP status as a last resort so we can
      // still tell the difference between "slow" and "totally down".
      const fallback = await rawGet(url.replace('https://', 'http://'))
      await browser.close()
      if (!fallback.status || fallback.status >= 500) {
        return {
          hasWebsite: true,
          score: 10,
          issues: ['Website did not respond (server error or unreachable)'],
          checks: { ...checks, reachable: false }
        }
      }
      return {
        hasWebsite: true,
        score: 20,
        issues: ['Website loaded very slowly or with certificate errors'],
        checks: { ...checks, reachable: true, certificateIssue: true }
      }
    }
    const loadTimeMs = Date.now() - startTime
    const httpStatus = response ? response.status() : 0

    if (httpStatus >= 400) {
      await browser.close()
      return {
        hasWebsite: true,
        score: 10,
        issues: [`Server Error (HTTP ${httpStatus})`],
        checks: { ...checks, httpStatus }
      }
    }

    checks.loadTimeMs = loadTimeMs
    if (loadTimeMs > AUDIT_SLOW_LOAD_MS) {
      score -= AUDIT_SCORE_WEIGHTS.slowLoad
      issues.push(`Slow Load Time (${(loadTimeMs / 1000).toFixed(1)}s)`)
    }

    // 2. Mobile-responsive check — does the page overflow horizontally at
    // a 375px phone width? A near-universal problem on old template sites.
    const mobileOverflow = await page
      .evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 5)
      .catch(() => false)
    checks.mobileResponsive = !mobileOverflow
    if (mobileOverflow) {
      score -= AUDIT_SCORE_WEIGHTS.noMobile
      issues.push('Not Mobile-Responsive (horizontal scroll on phones)')
    }

    // 3. SEO / pixel / analytics check + footer text for the agency
    // detector — all read from the one page we already loaded, so this is
    // effectively free.
    const html = await page.content()
    const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '')
    const footerLinks = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('footer a[href], [class*="footer" i] a[href]')).map(
          (a) => a.href
        )
      )
      .catch(() => [])
    const title = await page.title().catch(() => '')
    const metaDescription = await page
      .evaluate(() => document.querySelector('meta[name="description"]')?.content || '')
      .catch(() => '')

    await browser.close()

    const foundAnalytics = ANALYTICS_SIGNATURES.filter((sig) => sig.pattern.test(html))
    checks.analytics = foundAnalytics.map((s) => s.name)
    if (foundAnalytics.length === 0) {
      score -= AUDIT_SCORE_WEIGHTS.noAnalytics
      issues.push('No Google Analytics, Meta Pixel, or GTM detected (flying blind on traffic)')
    }

    checks.hasTitle = Boolean(title)
    if (!title) {
      score -= AUDIT_SCORE_WEIGHTS.noTitle
      issues.push('Missing page <title> tag (hurts Google ranking)')
    }

    checks.hasMetaDescription = Boolean(metaDescription)
    if (!metaDescription) {
      score -= AUDIT_SCORE_WEIGHTS.noMetaDescription
      issues.push('Missing meta description (hurts Google click-through)')
    }

    const abandoned = await detectAbandonedAgency(pageText, footerLinks, hostname)
    checks.abandonedAgency = abandoned
    if (abandoned.found && abandoned.agencyDomainDead) {
      score -= AUDIT_SCORE_WEIGHTS.abandonedAgency
      issues.push(
        `Abandoned Agency: built by "${abandoned.agencyName}", whose own domain is no longer active`
      )
    }

    return {
      hasWebsite: true,
      score: Math.max(0, Math.min(100, Math.round(score))),
      issues: issues.length > 0 ? issues : ['No major issues found — solid site'],
      checks
    }
  } catch (err) {
    await browser.close().catch(() => {})
    return {
      hasWebsite: true,
      score: 0,
      issues: [`Audit failed: ${err.message}`],
      checks: {}
    }
  }
}
