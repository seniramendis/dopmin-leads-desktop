// src/main/queryExpansion.js
//
// Turns a raw user search into the list of Google Maps queries the scraper
// should actually run. Isolated from scraper.js so the "is this just a
// place name?" heuristic can be reasoned about (and tested) on its own.
import { BUSINESS_TYPE_HINTS, DEFAULT_CATEGORY_EXPANSION } from './constants'

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
 * @returns {string[]}
 */
export function expandQuery(query) {
  const trimmed = query.trim()
  if (!looksLikeBarePlaceName(trimmed)) return [trimmed]
  return DEFAULT_CATEGORY_EXPANSION.map((category) => `${category} in ${trimmed}`)
}
