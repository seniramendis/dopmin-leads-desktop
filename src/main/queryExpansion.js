// src/main/queryExpansion.js
//
// Generates B2B search queries for IT projects and RFPs.
// Strictly blocks blogs, news, and unverified sources.

const regions = {
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
