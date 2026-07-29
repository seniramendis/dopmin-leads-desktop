import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { scrapeLeads } from './scraper'
import { getApiKey, setApiKey } from './secureStore'

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers() {
  ipcMain.handle('get-api-key', () => getApiKey())

  ipcMain.handle('set-api-key', (_event, key) => {
    setApiKey(key)
    return true
  })

  ipcMain.handle('start-scraping', async (event, searchData = {}) => {
    const query = typeof searchData === 'string' ? searchData : searchData.query || ''
    const rawMaxResults = typeof searchData === 'string' ? 20 : (searchData.maxResults ?? 20)
    const maxResults = Math.max(1, Math.min(500, Number(rawMaxResults) || 20))

    if (!query.trim()) {
      return { success: false, error: 'Please enter a search query.' }
    }

    if (!getApiKey()) {
      console.warn('No API key configured yet — set one in Settings.')
    }

    // Stream live progress (discovery scrolling + per-listing extraction)
    // back to the renderer so long searches (100s of results) give
    // real-time feedback instead of a single spinner.
    const onProgress = (payload) => {
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('scrape-progress', payload)
        }
      } catch {
        // Window may have closed mid-scrape — safe to ignore.
      }
    }

    return scrapeLeads(query, maxResults, onProgress)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
