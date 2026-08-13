import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  // 1. The Original Maps Route
  startMapsScrape: (params) => ipcRenderer.invoke('start-maps-scrape', params),

  // 2. The New B2B IT Projects Route
  startProjectScrape: (params) => ipcRenderer.invoke('start-project-scrape', params)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}

// Export for internal use in preload script
export { api }

  /** Runs the local $0 audit (SSL/speed/mobile/SEO/abandoned-agency) on a
   * lead's website. @param {string} url */
  auditWebsite: (url) => ipcRenderer.invoke('audit-website', url),

  /** Deep-profiles a single business's own website: pricing/services pages,
   * contact info + social links, tech stack, plus an optional 1-2
   * competitor comparison — all folded together with the $0 audit.
   * @param {{ url: string, competitorUrls?: string[] }} payload */
  profileBusiness: (payload) => ipcRenderer.invoke('profile-business', payload),

  runDeepProfile: (domainUrl) => ipcRenderer.invoke('run-deep-profile', domainUrl),

  /** Subscribe to live progress while a single-business profile is running.
   * @param {(payload: object) => void} callback
   * @returns {() => void} unsubscribe function — call on component teardown */
  onProfileProgress: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('profile-progress', handler)
    return () => ipcRenderer.removeListener('profile-progress', handler)
  },

  /** Opens a WhatsApp click-to-chat link pre-filled with a message.
   * @param {{ phone: string, message?: string }} payload */
  openWhatsapp: (payload) => ipcRenderer.invoke('open-whatsapp', payload),

  /** Lists leads from the persistent local database (paginated).
   * @param {{ status?: string, hasWebsite?: boolean, minRating?: number, search?: string, limit?: number, offset?: number }} filters */
  dbListLeads: (filters) => ipcRenderer.invoke('db-list-leads', filters),

  /** Counts leads matching a filter set, without fetching rows.
   * @param {{ status?: string, hasWebsite?: boolean, minRating?: number, search?: string }} filters */
  dbCountLeads: (filters) => ipcRenderer.invoke('db-count-leads', filters),

  /** @param {string} leadId */
  dbLeadHistory: (leadId) => ipcRenderer.invoke('db-lead-history', leadId),

  /** @param {{ leadId: string, status: string }} payload */
  dbSetStatus: (payload) => ipcRenderer.invoke('db-set-status', payload),

  /** Opens a URL in the system's default browser. @param {string} url */
  openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

  /** Runs the LLM Analyst Engine on one business's scraped data — digital
   * maturity score, KPIs, SWOT, vulnerabilities (each mapped to a Dopmin
   * service), and an outreach angle. Cached locally per URL.
   * @param {{ scrapedData: object, forceRefresh?: boolean }} payload */
  analyzeBusiness: (payload) => ipcRenderer.invoke('analyze-business', payload),

  /** Subscribe to live progress while an analysis is running.
   * @param {(payload: object) => void} callback
   * @returns {() => void} unsubscribe function — call on component teardown */
  onAnalyzeProgress: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('analyze-progress', handler)
    return () => ipcRenderer.removeListener('analyze-progress', handler)
  },

  dbStats: () => ipcRenderer.invoke('db-stats'),

  /** KPIs + chart data for the Dashboard view. */
  dbDashboard: () => ipcRenderer.invoke('db-dashboard')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}
