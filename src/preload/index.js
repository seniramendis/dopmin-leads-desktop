import { contextBridge, ipcRenderer } from 'electron'

/**
 * The only surface the renderer gets. Every call here is a thin proxy to
 * a specific `ipcMain.handle` in src/main/index.js — no arbitrary channel
 * access, no Node globals leak into the page.
 */
const api = {
  /** @param {{ query: string, maxResults?: number }} searchData */
  startScraping: (searchData) => ipcRenderer.invoke('start-scraping', searchData),

  /** @returns {Promise<string>} */
  getApiKey: () => ipcRenderer.invoke('get-api-key'),

  /** @param {string} key */
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),

  /**
   * Subscribe to live progress while a search is running.
   * @param {(payload: object) => void} callback
   * @returns {() => void} unsubscribe function — call on component teardown
   */
  onScrapeProgress: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('scrape-progress', handler)
    return () => ipcRenderer.removeListener('scrape-progress', handler)
  }
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
