// src/main/db.js
//
// Turns Dopmin from "a scraper that throws results away when you close the
// app" into a growing, queryable local dataset — the actual moat, since a
// static list from ZoomInfo/Apollo never re-checks whether a business lost
// its website or its rating tanked, and Dopmin's own history now does.
//
// 100% local SQLite (better-sqlite3 — synchronous, embedded, no server
// process, no network, no cost) stored in Electron's per-user app-data
// folder. Nothing here ever leaves the machine.
import { app, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

let Database = null
let useFallback = false
const FORCE_FALLBACK =
  process.env.DOPMIN_FORCE_FALLBACK === '1' || process.env.DOPMIN_FORCE_FALLBACK === 'true'
const debugLogPath = path.join(app.getPath('userData'), 'dopmin-debug.log')

function debugLog(...parts) {
  try {
    const msg = `[${new Date().toISOString()}] ${parts.join(' ')}\n`
    fs.appendFileSync(debugLogPath, msg, 'utf8')
  } catch (e) {
    // ignore logging failures
  }
}
try {
  // Use createRequire so missing native modules produce a handled error
  Database = createRequire(import.meta.url)('better-sqlite3')
} catch (err) {
  useFallback = true
  const guidance = [
    "The native module 'better-sqlite3' is not installed or wasn't built for this Electron runtime.",
    '',
    'This app will use a lightweight JSON fallback database so you can continue development without native build tools.',
    '',
    'To restore full SQLite functionality, install Visual C++ build tools and run the rebuild steps in README.',
    '',
    'Temporary fallback data file will live in the app user data folder.'
  ].join('\n')

  try {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Missing native dependency',
      message: guidance
    })
  } catch (dialogErr) {
    // ignore dialog errors
  }
  debugLog('better-sqlite3 missing:', String(err))
}
if (FORCE_FALLBACK) {
  useFallback = true
  debugLog('DOPMIN_FORCE_FALLBACK enabled — using JSON fallback DB')
}
import { LEAD_STATUSES, TRACKED_CHANGE_FIELDS } from './constants'

let db = null

/** Normalizes name+address into a stable id so the *same* business found
 * via two different category searches (e.g. "restaurants in X" and the
 * bare-place-name fan-out) collapses into one row instead of a duplicate —
 * simple entity resolution, free as a side effect of how we key the table. */
function fingerprint(lead) {
  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const key = `${norm(lead.name)}|${norm(lead.address)}`
  return crypto.createHash('sha1').update(key).digest('hex')
}

export function initDb() {
  if (db) return db

  if (!useFallback && Database) {
    const dbPath = path.join(app.getPath('userData'), 'dopmin-leads.sqlite3')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')

    db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        phone TEXT,
        address TEXT,
        maps_url TEXT,
        rating REAL,
        review_count INTEGER,
        has_website INTEGER,
        website TEXT,
        reputation TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        query_used TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        times_seen INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS lead_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      );

      CREATE INDEX IF NOT EXISTS idx_history_lead ON lead_history(lead_id);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE VIRTUAL TABLE IF NOT EXISTS leads_fts USING fts5(
        id UNINDEXED, name, category, address, content=''
      );

      CREATE TABLE IF NOT EXISTS analysis_cache (
        cache_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)

    return db
  }

  // JSON fallback
  const jsonPath = path.join(app.getPath('userData'), 'dopmin-leads.json')
  let data = { leads: {}, lead_history: [], next_history_id: 1, analysis_cache: {} }
  try {
    if (fs.existsSync(jsonPath)) {
      data = JSON.parse(fs.readFileSync(jsonPath, 'utf8') || '{}')
    } else {
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true })
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8')
    }
  } catch (err) {
    console.error('Failed to load fallback DB', err)
  }

  db = {
    isFallback: true,
    jsonPath,
    data,
    save() {
      try {
        fs.writeFileSync(this.jsonPath, JSON.stringify(this.data, null, 2), 'utf8')
      } catch (err) {
        console.error('Failed to save fallback DB', err)
      }
    }
  }

  return db
}

function refreshFtsRow(id, lead) {
  db.prepare(`DELETE FROM leads_fts WHERE id = ?`).run(id)
  db.prepare(`INSERT INTO leads_fts (id, name, category, address) VALUES (?, ?, ?, ?)`).run(
    id,
    lead.name || '',
    lead.category || '',
    lead.address || ''
  )
}

/**
 * Inserts new leads / updates existing ones from a fresh scrape, logging
 * any tracked-field changes (rating drop, website disappearing, etc.) to
 * lead_history. Returns per-lead metadata (isNew, changed fields) so the
 * caller can annotate the in-memory results the renderer already shows,
 * without requiring a second round trip to the DB view.
 */
export function upsertLeads(leads, queryUsed) {
  initDb()
  const now = new Date().toISOString()

  if (db.isFallback) {
    const annotations = new Map()
    for (const lead of leads) {
      const id = fingerprint(lead)
      const existing = db.data.leads[id]
      const params = {
        id,
        name: lead.name || 'Unnamed business',
        category: lead.category || '',
        phone: lead.phone || '',
        address: lead.address || '',
        mapsUrl: lead.mapsUrl || '',
        rating: lead.rating ?? null,
        reviewCount: lead.reviewCount ?? 0,
        hasWebsite: lead.hasWebsite ? 1 : 0,
        website: lead.website || '',
        reputation: lead.reputation || 'unrated',
        queryUsed,
        now
      }

      if (!existing) {
        db.data.leads[id] = {
          id,
          name: params.name,
          category: params.category,
          phone: params.phone,
          address: params.address,
          maps_url: params.mapsUrl,
          rating: params.rating,
          review_count: params.reviewCount,
          has_website: params.hasWebsite,
          website: params.website,
          reputation: params.reputation,
          status: 'new',
          query_used: params.queryUsed,
          first_seen_at: now,
          last_seen_at: now,
          times_seen: 1
        }
        db.save()
        annotations.set(lead.id, { dbId: id, isNew: true, changes: [], status: 'new' })
        continue
      }

      const changes = []
      const existingSnapshot = {
        hasWebsite: !!existing.has_website,
        rating: existing.rating,
        reviewCount: existing.review_count,
        website: existing.website
      }
      for (const field of TRACKED_CHANGE_FIELDS) {
        const oldVal = existingSnapshot[field]
        const newVal = field === 'hasWebsite' ? !!lead.hasWebsite : lead[field]
        if (oldVal !== newVal && !(oldVal == null && newVal == null)) {
          changes.push({ field, oldVal, newVal })
          db.data.lead_history.push({
            id: db.data.next_history_id++,
            lead_id: id,
            changed_at: now,
            field,
            old_value: String(oldVal ?? ''),
            new_value: String(newVal ?? '')
          })
        }
      }

      // update existing
      existing.category = lead.category || existing.category
      existing.phone = lead.phone || existing.phone
      existing.address = lead.address || existing.address
      existing.maps_url = lead.mapsUrl || existing.maps_url
      existing.rating = lead.rating ?? existing.rating
      existing.review_count = lead.reviewCount ?? existing.review_count
      existing.has_website = lead.hasWebsite ? 1 : 0
      existing.website = lead.website || existing.website
      existing.reputation = lead.reputation || existing.reputation
      existing.query_used = queryUsed || existing.query_used
      existing.last_seen_at = now
      existing.times_seen = (existing.times_seen || 1) + 1

      db.save()
      annotations.set(lead.id, { dbId: id, isNew: false, changes, status: existing.status })
    }
    return annotations
  }

  // SQLite path remains unchanged
  const getStmt = db.prepare(`SELECT * FROM leads WHERE id = ?`)
  const insertStmt = db.prepare(`
    INSERT INTO leads
      (id, name, category, phone, address, maps_url, rating, review_count,
       has_website, website, reputation, status, query_used, first_seen_at,
       last_seen_at, times_seen)
    VALUES
      (@id, @name, @category, @phone, @address, @mapsUrl, @rating, @reviewCount,
       @hasWebsite, @website, @reputation, 'new', @queryUsed, @now, @now, 1)
  `)
  const updateStmt = db.prepare(`
    UPDATE leads SET
      category = @category, phone = @phone, address = @address,
      maps_url = @mapsUrl, rating = @rating, review_count = @reviewCount,
      has_website = @hasWebsite, website = @website, reputation = @reputation,
      query_used = @queryUsed, last_seen_at = @now, times_seen = times_seen + 1
    WHERE id = @id
  `)
  const historyStmt = db.prepare(`
    INSERT INTO lead_history (lead_id, changed_at, field, old_value, new_value)
    VALUES (?, ?, ?, ?, ?)
  `)

  const annotations = new Map()

  const run = db.transaction((items) => {
    for (const lead of items) {
      const id = fingerprint(lead)
      const existing = getStmt.get(id)
      const params = {
        id,
        name: lead.name || 'Unnamed business',
        category: lead.category || '',
        phone: lead.phone || '',
        address: lead.address || '',
        mapsUrl: lead.mapsUrl || '',
        rating: lead.rating,
        reviewCount: lead.reviewCount ?? 0,
        hasWebsite: lead.hasWebsite ? 1 : 0,
        website: lead.website || '',
        reputation: lead.reputation || 'unrated',
        queryUsed,
        now
      }

      if (!existing) {
        insertStmt.run(params)
        refreshFtsRow(id, lead)
        annotations.set(lead.id, { dbId: id, isNew: true, changes: [], status: 'new' })
        continue
      }

      const changes = []
      const existingSnapshot = {
        hasWebsite: !!existing.has_website,
        rating: existing.rating,
        reviewCount: existing.review_count,
        website: existing.website
      }
      for (const field of TRACKED_CHANGE_FIELDS) {
        const oldVal = existingSnapshot[field]
        const newVal = field === 'hasWebsite' ? !!params.hasWebsite : lead[field]
        if (oldVal !== newVal && !(oldVal == null && newVal == null)) {
          changes.push({ field, oldVal, newVal })
          historyStmt.run(id, now, field, String(oldVal ?? ''), String(newVal ?? ''))
        }
      }

      updateStmt.run(params)
      refreshFtsRow(id, lead)
      annotations.set(lead.id, { dbId: id, isNew: false, changes, status: existing.status })
    }
  })

  run(leads)
  return annotations
}

/**
 * Lists persisted leads with optional filters — this is what powers the
 * "My Leads Database" view (every business ever scraped, across every past
 * search), separate from the current search's results table.
 */
function matchesFallbackFilters(l, { status, hasWebsite, minRating, search }) {
  if (status && l.status !== status) return false
  if (hasWebsite === true && !l.has_website) return false
  if (hasWebsite === false && l.has_website) return false
  if (typeof minRating === 'number' && (l.rating ?? 0) < minRating) return false
  if (search && search.trim()) {
    const s = search.trim().toLowerCase()
    if (!(l.name + ' ' + (l.category || '') + ' ' + (l.address || '')).toLowerCase().includes(s)) {
      return false
    }
  }
  return true
}

/**
 * Counts leads matching a filter set without pulling full rows — used by
 * the pipeline board to show "N leads in this stage" per column and by the
 * table view to show "showing X of Y" without loading Y rows to get Y.
 */
export function countLeads(filters = {}) {
  initDb()
  if (db.isFallback) {
    return Object.values(db.data.leads || {}).filter((l) => matchesFallbackFilters(l, filters))
      .length
  }

  const { status, hasWebsite, minRating, search } = filters
  const clauses = []
  const params = {}
  if (status) {
    clauses.push('status = @status')
    params.status = status
  }
  if (hasWebsite === true || hasWebsite === false) {
    clauses.push('has_website = @hasWebsite')
    params.hasWebsite = hasWebsite ? 1 : 0
  }
  if (typeof minRating === 'number') {
    clauses.push('rating >= @minRating')
    params.minRating = minRating
  }

  let sql
  if (search && search.trim()) {
    sql = `
      SELECT COUNT(*) AS n FROM leads
      JOIN leads_fts ON leads.id = leads_fts.id
      WHERE leads_fts MATCH @search
      ${clauses.length ? 'AND ' + clauses.join(' AND ') : ''}
    `
    params.search = `${search.trim()}*`
  } else {
    sql = `SELECT COUNT(*) AS n FROM leads ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}`
  }
  return db.prepare(sql).get(params).n
}

/**
 * Lists persisted leads with optional filters, offset, and limit — pagination
 * (rather than one giant fetch) is what keeps this view usable as the
 * dataset grows into the thousands: the UI asks for a page at a time
 * instead of shipping the whole table across the IPC bridge every load.
 */
export function listLeads({ status, hasWebsite, minRating, search, limit = 200, offset = 0 } = {}) {
  initDb()
  if (db.isFallback) {
    let results = Object.values(db.data.leads || {}).filter((l) =>
      matchesFallbackFilters(l, { status, hasWebsite, minRating, search })
    )
    results.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
    return results.slice(offset, offset + limit)
  }

  const clauses = []
  const params = {}

  if (status) {
    clauses.push('status = @status')
    params.status = status
  }
  if (hasWebsite === true || hasWebsite === false) {
    clauses.push('has_website = @hasWebsite')
    params.hasWebsite = hasWebsite ? 1 : 0
  }
  if (typeof minRating === 'number') {
    clauses.push('rating >= @minRating')
    params.minRating = minRating
  }

  let sql
  if (search && search.trim()) {
    sql = `
      SELECT leads.* FROM leads
      JOIN leads_fts ON leads.id = leads_fts.id
      WHERE leads_fts MATCH @search
      ${clauses.length ? 'AND ' + clauses.join(' AND ') : ''}
      ORDER BY last_seen_at DESC
      LIMIT @limit OFFSET @offset
    `
    params.search = `${search.trim()}*`
  } else {
    sql = `
      SELECT * FROM leads
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
      ORDER BY last_seen_at DESC
      LIMIT @limit OFFSET @offset
    `
  }
  params.limit = limit
  params.offset = offset

  return db.prepare(sql).all(params)
}

export function getLeadHistory(leadId) {
  initDb()
  if (db.isFallback) {
    return (db.data.lead_history || [])
      .filter((h) => h.lead_id === leadId)
      .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
  }
  return db
    .prepare(`SELECT * FROM lead_history WHERE lead_id = ? ORDER BY changed_at DESC`)
    .all(leadId)
}

export function setLeadStatus(leadId, status) {
  initDb()
  if (!LEAD_STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${LEAD_STATUSES.join(', ')}`)
  }
  if (db.isFallback) {
    const existing = db.data.leads[leadId]
    if (!existing) throw new Error('Lead not found')
    existing.status = status
    db.save()
    return
  }
  db.prepare(`UPDATE leads SET status = ? WHERE id = ?`).run(status, leadId)
}

/**
 * Local cache for LLM analysis results (analystEngine.js), keyed by a
 * normalized business URL — avoids re-calling Gemini/OpenRouter for a URL
 * that's already been analyzed. Callers are responsible for their own TTL
 * policy; this just persists/retrieves whatever payload + cachedAt they
 * ask for, same JSON-blob approach as the rest of this file's fallback mode.
 */
export function getCachedAnalysis(cacheKey) {
  initDb()
  if (db.isFallback) {
    const row = (db.data.analysis_cache || {})[cacheKey]
    if (!row) return null
    try {
      return { ...JSON.parse(row.payload), cachedAt: row.created_at }
    } catch {
      return null
    }
  }
  const row = db.prepare('SELECT payload, created_at FROM analysis_cache WHERE cache_key = ?').get(cacheKey)
  if (!row) return null
  try {
    return { ...JSON.parse(row.payload), cachedAt: row.created_at }
  } catch {
    return null
  }
}

export function setCachedAnalysis(cacheKey, value) {
  initDb()
  const now = new Date().toISOString()
  const payload = JSON.stringify(value)

  if (db.isFallback) {
    db.data.analysis_cache = db.data.analysis_cache || {}
    db.data.analysis_cache[cacheKey] = { payload, created_at: now }
    db.save()
    return
  }

  db.prepare(
    `INSERT INTO analysis_cache (cache_key, payload, created_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`
  ).run(cacheKey, payload, now)
}

export function getDbStats() {
  initDb()
  if (db.isFallback) {
    const leads = Object.values(db.data.leads || {})
    const total = leads.length
    const noWebsite = leads.filter((l) => !l.has_website).length
    const byStatus = Object.entries(
      leads.reduce((acc, l) => {
        acc[l.status] = (acc[l.status] || 0) + 1
        return acc
      }, {})
    ).map(([status, n]) => ({ status, n }))
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const recentChanges = (db.data.lead_history || []).filter(
      (h) => new Date(h.changed_at).getTime() >= sevenDaysAgo
    ).length
    return { total, noWebsite, byStatus, recentChanges }
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM leads`).get().n
  const noWebsite = db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE has_website = 0`).get().n
  const byStatus = db.prepare(`SELECT status, COUNT(*) AS n FROM leads GROUP BY status`).all()
  const recentChanges = db
    .prepare(
      `SELECT COUNT(*) AS n FROM lead_history WHERE changed_at >= datetime('now', '-7 days')`
    )
    .get().n
  return { total, noWebsite, byStatus, recentChanges }
}
