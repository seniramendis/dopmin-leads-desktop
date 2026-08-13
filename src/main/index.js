import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { buildPlatformProjectQuery } from './queryExpansion'
import * as scraper from './scraper'
import { runZeroCostAudit } from './auditEngine'
import { analyzeBusinessProfile } from './analystEngine'
import { analyzeDomainWithProxy } from './network'
import { getApiKey } from './secureStore'
import {
  upsertLeads,
  listLeads,
  countLeads,
  getLeadHistory,
  setLeadStatus,
  getDbStats,
  getDashboardStats
} from './db'

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
    const category =
      typeof searchData === 'string' ? 'mobile_apps' : searchData.category || 'mobile_apps'
    const region = typeof searchData === 'string' ? 'local' : searchData.region || 'local'
    const mode = typeof searchData === 'string' ? 'local_maps' : searchData.mode || 'local_maps'
    const industry =
      typeof searchData === 'string' ? 'healthcare' : searchData.industry || 'healthcare'
    const source = typeof searchData === 'string' ? 'rfp_boards' : searchData.source || 'rfp_boards'

    if (!query.trim()) {
      return { success: false, error: 'Please enter a search query.' }
    }

    const routeQuery =
      mode === 'it_projects'
        ? buildProjectQuery(category, region, industry, source)
        : buildMapsQuery(query, industry, region)

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

    const result = await scrapeLeads(routeQuery, maxResults, onProgress, {
      category,
      region,
      mode,
      industry,
      source
    })

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

  ipcMain.handle('start-scrape', async (event, args = {}) => {
    const search = typeof args === 'string' ? args : args.query || ''
    const category = typeof args === 'string' ? 'mobile_apps' : args.category || 'mobile_apps'
    const region = typeof args === 'string' ? 'local' : args.region || 'local'
    const mode = typeof args === 'string' ? 'local_maps' : args.mode || 'local_maps'
    const industry = typeof args === 'string' ? 'healthcare' : args.industry || 'healthcare'
    const source = typeof args === 'string' ? 'rfp_boards' : args.source || 'rfp_boards'
    const maxResults =
      typeof args === 'string' ? 20 : Math.max(1, Math.min(500, Number(args.maxResults) || 20))

    if (!search.trim()) return []

    const routeQuery =
      mode === 'it_projects'
        ? buildProjectQuery(category, region, industry, source)
        : buildMapsQuery(search, industry, region)

    const onProgress = (payload) => {
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('scrape-progress', payload)
        }
      } catch {
        // Window may have closed mid-scrape — safe to ignore.
      }
    }

    const result = await scrapeLeads(routeQuery, maxResults, onProgress, {
      category,
      region,
      mode,
      industry,
      source
    })
    if (!result.success) {
      return []
    }
    return result.leads || []
  })

  // =================================================================
  // ROUTE 1: ORIGINAL GOOGLE MAPS ENGINE (Untouched)
  // =================================================================
  ipcMain.handle('start-maps-scrape', async (event, params) => {
    console.log('[Backend] Triggering Original Maps Scraper with:', params)

    try {
      // Pass parameters to the original scraper function
      const results = await scraper.scrapeLeads(params.query, params.maxResults, undefined, {
        mode: 'local_maps',
        region: params.region
      })
      return results.leads || []
    } catch (error) {
      console.error('Maps Scrape Failed:', error)
      return []
    }
  })

  // =================================================================
  // ROUTE 2: NEW IT PROJECTS & RFPs ENGINE
  // =================================================================
  ipcMain.handle('start-project-scrape', async (event, params) => {
    console.log('[Backend] Triggering IT Projects Scraper with:', params)
    const { category, region, source, industry } = params

    try {
      // 1. Build the targeted B2B footprint (ignoring blogs/news)
      const searchQuery = buildPlatformProjectQuery(source, category, region, industry)
      console.log('[Backend] Generated Project Footprint:', searchQuery)

      // 2. Pass this highly targeted query to the scraper
      const projectResults = await scraper.scrapeLeads(searchQuery, 50, undefined, {
        mode: 'it_projects',
        category,
        region,
        source,
        industry
      })

      return projectResults.leads || []
    } catch (error) {
      console.error('Project Scrape Failed:', error)
      return []
    }
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

  // Powers the Dashboard view — KPI cards + charts computed straight from
  // the local leads DB. See getDashboardStats() in db.js for the shape.
  ipcMain.handle('db-dashboard', () => {
    try {
      return { success: true, stats: getDashboardStats() }
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

  // Single-Business Profiler — deep extraction on one business's own
  // website (pricing/services pages, contact info + social links, tech
  // stack, plus an optional 1-2 competitor comparison), all folded together
  // with the existing $0 audit into one JSON object. See
  // src/main/businessProfiler.js.
  ipcMain.handle('profile-business', async (event, payload = {}) => {
    const url = typeof payload === 'string' ? payload : payload.url || ''
    const competitorUrls = typeof payload === 'string' ? [] : payload.competitorUrls || []

    if (!url.trim()) {
      return { success: false, error: 'Please enter a business website URL.' }
    }

    const onProgress = (progressPayload) => {
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('profile-progress', progressPayload)
        }
      } catch {
        // Window may have closed mid-profile — safe to ignore.
      }
    }

    return scrapeSingleBusiness(url, { competitorUrls }, onProgress)
  })

  // Opens a URL in the system browser.
  ipcMain.handle('open-external-link', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })

  // LLM Analyst Engine — turns one business's scraped/audited data into a
  // digital-maturity score, KPIs, SWOT, prioritized vulnerabilities (each
  // mapped to a real Dopmin service), and an outreach angle. Reads both
  // provider keys itself so the renderer doesn't have to pass secrets
  // around. See src/main/analystEngine.js.
  ipcMain.handle('analyze-business', async (event, payload = {}) => {
    const { scrapedData, forceRefresh } = payload
    const keys = {
      geminiApiKey: getApiKey('gemini'),
      openRouterApiKey: getApiKey('openrouter')
    }

    const onProgress = (progressPayload) => {
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('analyze-progress', progressPayload)
        }
      } catch {
        // Window may have closed mid-analysis — safe to ignore.
      }
    }

    return analyzeBusinessProfile(scrapedData, keys, onProgress, Boolean(forceRefresh))
  })

  ipcMain.handle('run-deep-profile', async (_event, domainUrl) => {
    if (!domainUrl || typeof domainUrl !== 'string' || !domainUrl.trim()) {
      return { error: 'Please provide a valid domain URL.' }
    }

    try {
      return await analyzeDomainWithProxy(domainUrl.trim())
    } catch (error) {
      return { error: error?.message || String(error) }
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
