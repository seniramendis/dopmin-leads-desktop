import { contextBridge, ipcRenderer } from 'electron'

const api = {
  startScraping: (searchData) => ipcRenderer.invoke('start-scraping', searchData),
  scrapeLeads: (searchQuery, maxResults = 20) =>
    ipcRenderer.invoke('start-scraping', { query: searchQuery, maxResults }),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  // Subscribe to live progress while a search is running. Returns an
  // unsubscribe function so the caller can clean up on unmount.
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
