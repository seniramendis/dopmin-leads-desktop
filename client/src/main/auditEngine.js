// src/main/auditEngine.js
//
// Turns "No Website Found" (or "Has Website") into an actual sales asset:
// a 1-page technical audit the user can paste straight into a cold
// WhatsApp/email pitch.
//
// As of the Scrapling migration, the audit itself (page load, speed
// timing, mobile-overflow check, SEO/pixel scan, abandoned-agency check)
// runs in Python — backend/scrapling_worker/audit.py, built on Scrapling's
// DynamicSession. This file keeps the JS-side entry point
// (runZeroCostAudit) with the exact same result shape, plus the pure
// helper functions that never needed a browser.
import dns from 'dns/promises'
import { runPythonWorker } from './pythonBridge'
import { AGENCY_FOOTER_PATTERNS } from './constants'

export function normalizeUrl(url) {
  const trimmed = (url || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** DNS resolution is the cheapest possible "is this domain even alive?"
 * check — no HTTP round trip needed. */
export async function domainIsAlive(hostname) {
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
 * domain still resolves. Kept in JS for any caller that already has page
 * text/links in hand; the Python audit runs its own copy internally. */
export async function detectAbandonedAgency(pageText, footerLinks, siteHostname) {
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
 * Runs the full $0 audit on a single URL via the Scrapling Python worker.
 * Same result shape as before: { hasWebsite, score, issues, checks }.
 * The worker result has no `success` field of its own, so index.js's
 * `return { success: true, ...result }` wrapper keeps working unchanged.
 */
export async function runZeroCostAudit(rawUrl) {
  return runPythonWorker('audit_cli.py', [String(rawUrl || '')])
}
