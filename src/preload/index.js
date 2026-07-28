import { contextBridge, ipcRenderer } from 'electron'

// We expose the custom scraping command to the Svelte frontend
const api = {
  scrapeLeads: (searchQuery) => ipcRenderer.invoke('start-scraping', searchQuery)
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
