// src/main/queryExpansion.js
//
// Generates B2B search queries for IT projects and RFPs, and expands bare
// place-name Google Maps searches into real business-category queries.
// Strictly blocks blogs, news, and unverified sources.
import { BUSINESS_TYPE_HINTS, DEFAULT_CATEGORY_EXPANSION } from './constants'

function looksLikeBarePlaceName(query) {
  const q = query.toLowerCase()
  return !BUSINESS_TYPE_HINTS.some((hint) => q.includes(hint))
}

/**
 * Turns a single user query into the list of queries actually run against
 * Google Maps.
 *  - IT-project/RFP queries (options.mode === 'it_projects') are already a
 *    fully-formed boolean search string built by buildPlatformProjectQuery,
 *    so they're run exactly as-is — never fanned out.
 *  - If the user already specified a business type (e.g. "restaurants in
 *    Kandy"), that one query is run unchanged.
 *  - A bare place/town name ("Mount Lavinia") is fanned out into
 *    "<category> in <place>" across a broad set of common local business
 *    categories, since Google Maps returns weak/empty results for a bare
 *    place with no category.
 */
export function expandQuery(query, options = {}) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return [trimmed]
  if (options.mode === 'it_projects') return [trimmed]
  if (!looksLikeBarePlaceName(trimmed)) return [trimmed]
  return DEFAULT_CATEGORY_EXPANSION.map((category) => `${category} in ${trimmed}`)
}

/** Pulls the place name out of a "<category> in/near <place>" query, e.g.
 * "hardware stores in Mount Lavinia" -> "Mount Lavinia". Returns null when
 * the query doesn't follow that shape (nothing to broaden around). */
function extractLocation(query) {
  const match = String(query || '').match(/^(.*?)\s+(?:in|near)\s+(.+)$/i)
  return match ? match[2].trim() : null
}

/**
 * Fallback for when the user's own category+place query ("hardware stores
 * in Mount Lavinia") comes back thin. Reruns the same broad category
 * fan-out used for bare place names, anchored to the same place, so a
 * search that's too narrow on its own still gets filled out with related
 * categories instead of just returning a short list.
 */
export function broadenQuery(query, alreadyTried = []) {
  const location = extractLocation(query)
  if (!location) return []
  const tried = new Set(alreadyTried.map((q) => q.toLowerCase()))
  return DEFAULT_CATEGORY_EXPANSION.map((category) => `${category} in ${location}`).filter(
    (q) => !tried.has(q.toLowerCase())
  )
}

const regions = {
  worldwide: { domain: '' },
  local: { domain: 'site:.lk OR "Sri Lanka"' },
  australia: { domain: 'site:.com.au OR site:.au' },
  new_zealand: { domain: 'site:.co.nz OR site:.nz' },
  dubai: { domain: 'site:.ae OR "Dubai"' },
  usa: { domain: 'site:.com OR "United States"' },
  europe: { domain: 'site:.uk OR site:.de OR site:.nl' }
}

export function buildPlatformProjectQuery(sourceType, category, regionKey, industryKey) {
  const geo = regions[regionKey] || regions.local

  // Strictly blocks blogs, news articles, and tutorials from the search results
  const antiBlogFilter = '-inurl:blog -inurl:news -site:medium.com -site:dev.to'

  let targetPlatforms = ''
  let categoryKeyword = ''

  // 1. Identify the Project Scope
  switch (category) {
    case 'mobile_apps':
      categoryKeyword = '("mobile app" OR "iOS app" OR "Android app")'
      break
    case 'mid_size_it':
      categoryKeyword = '("software development" OR "custom software" OR "IT system")'
      break
    case 'ai_agents':
      categoryKeyword = '("AI agent" OR "AI automation" OR "workflow automation")'
      break
    default:
      categoryKeyword = '("software development" OR "custom software")'
  }

  // 2. Target the Source Type
  if (sourceType === 'rfp_boards') {
    targetPlatforms = '("RFP" OR "Request for Proposal" OR "Tender" OR "project brief")'
  } else if (sourceType === 'b2b_directories') {
    targetPlatforms = '(site:clutch.co OR site:goodfirms.co OR site:sortlist.com)'
  } else if (sourceType === 'freelance_contracts') {
    targetPlatforms = '("seeking agency" OR "looking for software team" OR "vendor needed")'
  } else {
    targetPlatforms = '("RFP" OR "Request for Proposal" OR "Tender")'
  }

  // Combine into a master search string
  return `${targetPlatforms} ${categoryKeyword} "${industryKey}" ${geo.domain} ${antiBlogFilter}`
    .replace(/\s+/g, ' ')
    .trim()
}
