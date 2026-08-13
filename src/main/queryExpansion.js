// src/main/queryExpansion.js
//
// Search queries are split by engine so Google Maps never receives Google Dork
// syntax. Maps searches use plain, human-readable location queries, while the
// project/RFP mode can use B2B dork-style footprints without polluting the
// Maps path.
import { BUSINESS_TYPE_HINTS, DEFAULT_CATEGORY_EXPANSION } from './constants'

const regionMap = {
  local: { name: 'Sri Lanka', tld: 'site:.lk', suffix: '("Colombo" OR "PVT LTD")' },
  australia: { name: 'Australia', tld: 'site:.com.au', suffix: '"Pty Ltd"' },
  new_zealand: { name: 'New Zealand', tld: 'site:.co.nz', suffix: '("Ltd" OR "Limited")' },
  dubai: {
    name: 'Dubai, UAE',
    tld: 'site:.ae',
    suffix: '("Dubai" AND ("LLC" OR "FZCO" OR "FZE"))'
  },
  usa: { name: 'USA', tld: 'site:.com', suffix: '("LLC" OR "Inc" OR "Corp")' },
  europe: {
    name: 'Europe',
    tld: 'site:.de OR site:.fr OR site:.nl OR site:.co.uk',
    suffix: '("GmbH" OR "SA" OR "SpA")'
  }
}

const industryLabels = {
  healthcare: 'Healthcare & Medical',
  ecommerce: 'E-commerce & Retail',
  finance: 'Finance & Fintech',
  agritech: 'Agriculture & AgriTech',
  real_estate: 'Real Estate'
}

export function buildMapsQuery(userQuery, industryKey = 'healthcare', regionKey = 'local') {
  const regionName = regionMap[regionKey]?.name || 'Sri Lanka'
  const industry = industryLabels[industryKey] || 'Businesses'
  const location = (userQuery || '').trim()

  if (location) {
    return `${industry} in ${location}, ${regionName}`
  }

  return `${industry} in ${regionName}`
}

export function buildProjectQuery(
  category = 'mobile_apps',
  regionKey = 'local',
  industryKey = 'healthcare'
) {
  const geo = regionMap[regionKey] || regionMap.local
  const industry = industryLabels[industryKey] || ''
  const exclusions =
    '-inurl:blog -inurl:news -inurl:article -site:medium.com -site:dev.to -site:wordpress.com'

  let categoryFootprint = ''
  switch (category) {
    case 'mobile_apps':
      categoryFootprint =
        '("app development RFP" OR "seeking mobile app developer" OR "need iOS app")'
      break
    case 'mid_size_it':
      categoryFootprint = '("custom software RFP" OR "seeking software agency" OR "IT overhaul")'
      break
    case 'ai_agents':
      categoryFootprint =
        '("AI automation RFP" OR "workflow automation project" OR "looking for AI agency")'
      break
    default:
      categoryFootprint =
        '("app development RFP" OR "seeking mobile app developer" OR "need iOS app")'
  }

  return `${categoryFootprint} "${industry}" ${geo.tld} ${exclusions}`.replace(/\s+/g, ' ').trim()
}

export function buildTargetedQuery(
  category = 'mobile_apps',
  regionKey = 'local',
  mode = 'local_maps',
  industryKey = 'healthcare',
  seedQuery = ''
) {
  const query = (seedQuery || '').trim()

  if (mode === 'it_projects') {
    return buildProjectQuery(category, regionKey, industryKey)
  }

  return buildMapsQuery(query || 'Mount Lavinia', industryKey, regionKey)
}

export function buildZeroCostQuery(category = 'mobile_apps', regionKey = 'local', seedQuery = '') {
  const geo = regionMap[regionKey] || regionMap.local
  let footprint = ''

  switch (category) {
    case 'mobile_apps':
      footprint =
        '("app development RFP" OR "mobile app outdated" OR inurl:careers "iOS developer")'
      break
    case 'mid_size_it':
      footprint = '("legacy system" OR "digital transformation" OR "seeking software agency")'
      break
    case 'ai_agents':
      footprint =
        '("customer support automation" OR "looking for AI solutions" OR "workflow automation")'
      break
    default:
      footprint =
        '("app development RFP" OR "mobile app outdated" OR inurl:careers "iOS developer")'
  }

  const baseQuery = seedQuery ? `${seedQuery} ${footprint}` : footprint
  return `${baseQuery} ${geo.tld} ${geo.suffix}`.replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} query
 * @returns {boolean} true if the query has no recognizable business-type
 *   keyword, i.e. it's most likely just a city/town/place name.
 */
export function looksLikeBarePlaceName(query) {
  const normalized = query.toLowerCase()
  return !BUSINESS_TYPE_HINTS.some((hint) => normalized.includes(hint))
}

/**
 * Turns a single user query into a list of queries to actually run against
 * Google Maps. If the user already specified a business type, we run
 * exactly that one query unchanged. If it looks like a bare city/town name,
 * we fan it out into "<category> in <place>" for a broad set of common
 * local business categories, so a search like "Mount Lavinia" alone still
 * turns up real businesses instead of a near-empty result.
 *
 * @param {string} query
 * @param {{ category?: string, region?: string, mode?: string, industry?: string }} options
 * @returns {string[]}
 */
export function expandQuery(query, options = {}) {
  const trimmed = (query || '').trim()
  const mode = options.mode || 'local_maps'
  const region = options.region || 'local'
  const industry = options.industry || 'healthcare'
  const category = options.category || 'mobile_apps'

  if (mode === 'it_projects') {
    return [buildProjectQuery(category, region, industry)]
  }

  if (trimmed) {
    return [buildMapsQuery(trimmed, industry, region)]
  }

  if (!looksLikeBarePlaceName(trimmed)) return [trimmed]
  return DEFAULT_CATEGORY_EXPANSION.map((categoryName) => `${categoryName} in ${trimmed}`)
}
