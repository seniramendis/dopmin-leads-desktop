// src/renderer/src/lib/csv.js
//
// CSV serialization + browser download for the leads table. Kept separate
// from the UI component so the format (columns, escaping) can be reasoned
// about — and changed — independently of how the export button is wired up.

const CSV_HEADER = [
  'Business Name',
  'Phone Number',
  'Category',
  'Address',
  'Rating',
  'Reviews',
  'Website Status',
  'Website',
  'Reputation',
  'Maps URL'
]

function csvField(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

/**
 * @param {Array<object>} leads
 * @returns {string} CSV text, header row first
 */
export function buildLeadsCsv(leads) {
  const rows = leads.map((lead) =>
    [
      csvField(lead.name),
      csvField(lead.phone),
      csvField(lead.category || ''),
      csvField(lead.address || ''),
      lead.rating ?? '',
      lead.reviewCount ?? 0,
      csvField(lead.status),
      csvField(lead.website || ''),
      csvField(lead.reputation),
      csvField(lead.mapsUrl || '')
    ].join(',')
  )

  return [CSV_HEADER.join(','), ...rows].join('\n')
}

/**
 * Triggers a browser download of the given CSV text.
 * @param {string} csvContent
 * @param {string} filename
 */
export function downloadCsv(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
