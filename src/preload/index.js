import { contextBridge, ipcRenderer } from 'electron'

/**
 * The only surface the renderer gets. Every call here is a thin proxy to
 * a specific `ipcMain.handle` in src/main/index.js — no arbitrary channel
 * access, no Node globals leak into the page.
 */
const api = {
  /** @param {{ query: string, maxResults?: number }} searchData */
  startScraping: (searchData) => ipcRenderer.invoke('start-scraping', searchData),

  /**
   * Subscribe to live progress while a search is running.
   * @param {(payload: object) => void} callback
   * @returns {() => void} unsubscribe function — call on component teardown
   */
  onScrapeProgress: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('scrape-progress', handler)
    return () => ipcRenderer.removeListener('scrape-progress', handler)
  },

  /** Runs the local $0 audit (SSL/speed/mobile/SEO/abandoned-agency) on a
   * lead's website. @param {string} url */
  auditWebsite: (url) => ipcRenderer.invoke('audit-website', url),

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

  dbStats: () => ipcRenderer.invoke('db-stats')
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
