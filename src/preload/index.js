import { contextBridge, ipcRenderer } from 'electron'

const api = {
  startScraping: (searchData) => ipcRenderer.invoke('start-scraping', searchData),
  scrapeLeads: (searchQuery) =>
    ipcRenderer.invoke('start-scraping', { query: searchQuery, maxResults: 20 }),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key)
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
