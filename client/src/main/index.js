import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { buildPlatformProjectQuery } from './queryExpansion'
import { scrapeLeads, scrapeSingleBusiness } from './scraper'

// Friendly location hints appended to a Google Maps search when the user
// picks a specific region, so "hardware stores" + region=australia
// searches Maps for the right country instead of relying on the user to
// type it themselves. "worldwide" (the default) adds no hint at all, so
// a plain query searches Google Maps globally exactly as typed — the
// listed regions are just a shortcut for quickly narrowing to a place the
// user already searches often, not a restriction on where search can go.
const MAPS_REGION_HINTS = {
  worldwide: '',
  local: 'Sri Lanka',
  australia: 'Australia',
  new_zealand: 'New Zealand',
  dubai: 'Dubai, UAE',
  usa: 'United States',
  europe: 'Europe'
}

/** Builds the actual text sent to Google Maps for the "Local Business
 * Search" tab. The query itself already carries the place name (e.g.
 * "hardware stores in Mount Lavinia") — this only appends a region hint
 * when the user picked somewhere other than the default, so the same
 * query text reliably targets the right country. */
function buildMapsQuery(query, region) {
  const hint = MAPS_REGION_HINTS[region]
  const trimmed = query.trim()
  if (!hint || trimmed.toLowerCase().includes(hint.toLowerCase())) return trimmed
  return `${trimmed} ${hint}`
}

/** Builds the boolean search string for the "IT Projects & RFPs" tab. */
function buildProjectQuery(category, region, industry, source) {
  return buildPlatformProjectQuery(source, category, region, industry)
}
import { runZeroCostAudit } from './auditEngine'
import { analyzeBusinessProfile } from './analystEngine'
import { analyzeDomainWithProxy } from './network'
import { getApiKey } from './secureStore'
import { getScrapeSettings, setScrapeSettings } from './scrapeSettings'
import { triggerCloudScrape, pollCloudJob } from './cloudBridge'
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
  // Settings > Scraping mode — local browser (default, fast, no account
  // needed) vs Bright Data's remote Scraping Browser (opt-in, useful once
  // your own IP starts getting rate-limited from heavy search volume).
  ipcMain.handle('get-scrape-settings', () => getScrapeSettings())
  ipcMain.handle('set-scrape-settings', (_event, payload = {}) => setScrapeSettings(payload))

  ipcMain.handle('start-scraping', async (event, searchData = {}) => {
    const query = typeof searchData === 'string' ? searchData : searchData.query || ''
    const rawMaxResults = typeof searchData === 'string' ? 20 : (searchData.maxResults ?? 20)
    const maxResults = Math.max(1, Math.min(500, Number(rawMaxResults) || 20))
    const region = typeof searchData === 'string' ? 'worldwide' : searchData.region || 'worldwide'
    const mode = typeof searchData === 'string' ? 'local_maps' : searchData.mode || 'local_maps'

    // category/industry/source only mean anything for the IT Projects/RFP
    // route — defaulting them for a plain Google Maps search was leaking
    // "healthcare"/"mobile_apps" into every Maps lookup even though the
    // user never chose them. Only default (and use) them when they're
    // actually going to be read, i.e. mode === 'it_projects'.
    const category = mode === 'it_projects' ? searchData.category || 'mobile_apps' : undefined
    const industry = mode === 'it_projects' ? searchData.industry || 'healthcare' : undefined
    const source = mode === 'it_projects' ? searchData.source || 'rfp_boards' : undefined

    if (!query.trim()) {
      return { success: false, error: 'Please enter a search query.' }
    }

    const routeQuery =
      mode === 'it_projects'
        ? buildProjectQuery(category, region, industry, source)
        : buildMapsQuery(query, region)

    // Stream live progress (discovery scrolling + per-listing extraction,
    // plus connection-quality warnings) back to the renderer so long
    // searches give real-time feedback instead of a single spinner, and so
    // a bad connection surfaces immediately instead of hanging silently.
    const onProgress = (payload) => {
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('scrape-progress', payload)
        }
      } catch {
        // Window may have closed mid-scrape — safe to ignore.
      }
    }

    let result
    try {
      result = await scrapeLeads(routeQuery, maxResults, onProgress, {
        category,
        region,
        mode,
        industry,
        source
      })
    } catch (error) {
      console.error('Scrape failed:', error)
      return { success: false, error: error.message || 'Scraping failed unexpectedly.' }
    }

    // Persist into the local leads database (SQLite, zero cost/server) so
    // the scrape isn't thrown away when the app closes, and so repeat
    // scrapes of the same area surface what *changed* — a business losing
    // its website, or a rating dropping — instead of just a flat list.
    if (result.success && result.leads.length > 0) {
      try {
        const annotations = await upsertLeads(result.leads, query)
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
  ipcMain.handle('db-list-leads', async (_event, filters) => {
    try {
      return { success: true, leads: await listLeads(filters) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db-count-leads', async (_event, filters) => {
    try {
      return { success: true, count: await countLeads(filters) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db-lead-history', async (_event, leadId) => {
    try {
      return { success: true, history: await getLeadHistory(leadId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db-set-status', async (_event, { leadId, status }) => {
    try {
      await setLeadStatus(leadId, status)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db-stats', async () => {
    try {
      return { success: true, stats: await getDbStats() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Powers the Dashboard view — KPI cards + charts computed straight from
  // the local leads DB. See getDashboardStats() in db.js for the shape.
  ipcMain.handle('db-dashboard', async () => {
    try {
      return { success: true, stats: await getDashboardStats() }
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

  // Cloud pipeline: Svelte -> Vercel bridge -> GitHub Actions -> Turso.
  // See src/main/cloudBridge.js. Runs in main so the Turso token and bridge
  // secret never touch the renderer/devtools.
  ipcMain.handle('cloud-trigger-scrape', async (_event, targetUrl) => {
    return triggerCloudScrape(targetUrl)
  })

  ipcMain.handle('cloud-poll-job', async (_event, jobId) => {
    return pollCloudJob(jobId)
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
