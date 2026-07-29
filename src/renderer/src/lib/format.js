// src/renderer/src/lib/format.js
//
// Small, pure display-formatting helpers with no component state of their
// own — kept out of App.svelte so components can share them directly.

/**
 * Renders a 0-5 rating as filled/empty star characters.
 * @param {number | null | undefined} rating
 * @returns {string}
 */
export function stars(rating) {
  if (rating === null || rating === undefined) return '—'
  const full = Math.round(rating)
  return '★'.repeat(full) + '☆'.repeat(5 - full)
}

/**
 * One-line summary of a lead, used for the clipboard "copy" action.
 * @param {{ name: string, phone: string, rating: number | null, reviewCount: number }} lead
 * @returns {string}
 */
export function summarizeLead(lead) {
  return `${lead.name} | ${lead.phone} | ${lead.rating ?? 'N/A'}★ (${lead.reviewCount})`
}
