import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { scrapeLeads } from './scraper'
import { runZeroCostAudit } from './auditEngine'
import { upsertLeads, listLeads, countLeads, getLeadHistory, setLeadStatus, getDbStats } from './db'

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
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
  ipcMain.handle('start-scraping', async (event, searchData = {}) => {
    const query = typeof searchData === 'string' ? searchData : searchData.query || ''
    const rawMaxResults = typeof searchData === 'string' ? 20 : (searchData.maxResults ?? 20)
    const maxResults = Math.max(1, Math.min(500, Number(rawMaxResults) || 20))

    if (!query.trim()) {
      return { success: false, error: 'Please enter a search query.' }
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

    const result = await scrapeLeads(query, maxResults, onProgress)

    // Persist into the local leads database (SQLite, zero cost/server) so
    // the scrape isn't thrown away when the app closes, and so repeat
    // scrapes of the same area surface what *changed* — a business losing
    // its website, or a rating dropping — instead of just a flat list.
    if (result.success && result.leads.length > 0) {
      try {
        const annotations = upsertLeads(result.leads, query)
        result.leads = result.leads.map((lead) => {
          const meta = annotations.get(lead.id)
          return meta
            ? {
                ...lead,
                dbId: meta.dbId,
                isNew: meta.isNew,
                changes: meta.changes,
                dbStatus: meta.status
              }
            : lead
        })
      } catch (err) {
        // Persisting is a bonus, not a requirement — a DB write failure
        // (disk full, locked file, etc.) shouldn't break the scrape the
        // user is actively waiting on.
        console.error('Failed to persist leads to local database:', err.message)
      }
    }

    return result
  })

  // Local Leads Database — the persistent, cross-search dataset. All local
  // SQLite reads/writes, no network calls, no server, $0 at any scale.
  ipcMain.handle('db-list-leads', (_event, filters) => {
    try {
      return { success: true, leads: listLeads(filters) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db-count-leads', (_event, filters) => {
    try {
      return { success: true, count: countLeads(filters) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db-lead-history', (_event, leadId) => {
    try {
      return { success: true, history: getLeadHistory(leadId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db-set-status', (_event, { leadId, status }) => {
    try {
      setLeadStatus(leadId, status)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db-stats', () => {
    try {
      return { success: true, stats: getDbStats() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Client Audit Scorecard — runs the local, $0 technical audit on one
  // lead's website (SSL, speed, mobile-responsive, SEO/pixel, abandoned
  // agency detection). See src/main/auditEngine.js.
  ipcMain.handle('audit-website', async (_event, url) => {
    try {
      const result = await runZeroCostAudit(url)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // WhatsApp Direct Outreach Bridge — opens the system default handler
  // (desktop app or web.whatsapp.com) with the lead's number and a
  // pre-filled message via WhatsApp's own "click to chat" link. No
  // whatsapp-web.js/Baileys session, no QR pairing, no API cost — just a
  // deep link, which is the $0 option that also can't get an account
  // flagged for automation.
  ipcMain.handle('open-whatsapp', (_event, { phone, message }) => {
    const digits = (phone || '').replace(/[^\d]/g, '')
    if (!digits) return { success: false, error: 'No valid phone number for this lead.' }
    const url = `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`
    shell.openExternal(url)
    return { success: true }
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
