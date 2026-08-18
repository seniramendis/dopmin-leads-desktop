// src/main/db.js
//
// Local SQLite implementation (better-sqlite3). This is the leads DB that
// powers the Results table, Lead History, and the Dashboard — it lives on
// disk in the app's userData folder and needs zero setup or external
// accounts, so the app works fully offline out of the box.
//
// NOTE: this is separate from src/main/cloudBridge.js, which is an
// *optional* feature (triggering a remote GitHub Actions scrape via a
// Vercel bridge + Turso). That piece still uses Turso for its own job
// polling and only activates if you configure BRIDGE_URL/TURSO_* — it does
// not affect the local leads DB below, and the app runs perfectly without
// it ever being configured.
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { LEAD_STATUSES, TRACKED_CHANGE_FIELDS } from './constants'

// Lazy-load database to prevent Electron boot crashes
let db = null

/** Normalizes name+address into a stable id */
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

// Kept for shape-compatibility with callers that expect plain JS values
// (better-sqlite3 already returns plain numbers/strings, but this keeps
// the "clean object, no surprises over IPC" guarantee explicit).
function serializeRows(rows) {
  if (!rows) return []
  return rows.map((row) => {
    const clean = {}
    for (const [key, value] of Object.entries(row)) {
      clean[key] = typeof value === 'bigint' ? Number(value) : value
    }
    return clean
  })
}

function resolveDbPath() {
  // app.getPath is only available once Electron's app is ready; by the
  // time any IPC handler calls initDb() that's already true. Fall back to
  // cwd for non-Electron contexts (e.g. running db.js under plain node).
  const userDataDir = app?.getPath ? app.getPath('userData') : process.cwd()
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }
  return path.join(userDataDir, 'dopmin-leads.db')
}

export async function initDb() {
  if (db) return db // If already connected, skip

  const dbPath = resolveDbPath()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 1. Build Tables
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
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
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

  // 2. The 30-Day Auto-Purge. Cleans up any leads older than 30 days every
  // time the database boots.
  try {
    db.prepare(`DELETE FROM leads WHERE first_seen_at < datetime('now', '-30 days')`).run()
  } catch (err) {
    console.error('Failed to execute 30-day purge:', err)
  }

  return db
}

export async function upsertLeads(leads, queryUsed) {
  const database = await initDb()
  if (!database) return new Map()

  const now = new Date().toISOString()
  const annotations = new Map()

  const getExisting = database.prepare(`SELECT * FROM leads WHERE id = ?`)
  const insertLead = database.prepare(`
    INSERT INTO leads
      (id, name, category, phone, address, maps_url, rating, review_count, has_website, website, reputation, status, query_used, first_seen_at, last_seen_at, times_seen)
    VALUES (@id, @name, @category, @phone, @address, @mapsUrl, @rating, @reviewCount, @hasWebsite, @website, @reputation, 'new', @queryUsed, @now, @now, 1)
  `)
  const updateLead = database.prepare(`
    UPDATE leads SET
      category = @category, phone = @phone, address = @address, maps_url = @mapsUrl,
      rating = @rating, review_count = @reviewCount, has_website = @hasWebsite,
      website = @website, reputation = @reputation, query_used = @queryUsed,
      last_seen_at = @now, times_seen = times_seen + 1
    WHERE id = @id
  `)
  const deleteFts = database.prepare(`DELETE FROM leads_fts WHERE id = ?`)
  const insertFts = database.prepare(
    `INSERT INTO leads_fts (id, name, category, address) VALUES (?, ?, ?, ?)`
  )
  const insertHistory = database.prepare(`
    INSERT INTO lead_history (lead_id, changed_at, field, old_value, new_value)
    VALUES (?, ?, ?, ?, ?)
  `)

  const run = database.transaction((leadsToProcess) => {
    for (const lead of leadsToProcess) {
      const id = fingerprint(lead)
      const existing = getExisting.get(id)

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
        queryUsed: queryUsed || '',
        now
      }

      if (!existing) {
        insertLead.run(params)
        deleteFts.run(id)
        insertFts.run(id, params.name, params.category, params.address)

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
          insertHistory.run(id, now, field, String(oldVal ?? ''), String(newVal ?? ''))
        }
      }

      params.queryUsed = queryUsed || existing.query_used

      updateLead.run(params)
      deleteFts.run(id)
      insertFts.run(id, params.name, params.category, params.address)

      annotations.set(lead.id, { dbId: id, isNew: false, changes, status: existing.status })
    }
  })

  run(leads)

  return annotations
}

export async function countLeads(filters = {}) {
  const database = await initDb()
  if (!database) return 0

  const { status, hasWebsite, minRating, search } = filters
  const clauses = []
  const args = []

  if (status) {
    clauses.push('status = ?')
    args.push(status)
  }
  if (hasWebsite === true || hasWebsite === false) {
    clauses.push('has_website = ?')
    args.push(hasWebsite ? 1 : 0)
  }
  if (typeof minRating === 'number') {
    clauses.push('rating >= ?')
    args.push(minRating)
  }

  let sql
  if (search && search.trim()) {
    sql = `
      SELECT COUNT(*) AS n FROM leads
      JOIN leads_fts ON leads.id = leads_fts.id
      WHERE leads_fts MATCH ?
      ${clauses.length ? 'AND ' + clauses.join(' AND ') : ''}
    `
    args.unshift(`${search.trim()}*`)
  } else {
    sql = `SELECT COUNT(*) AS n FROM leads ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}`
  }

  const row = database.prepare(sql).get(...args)
  return Number(row.n)
}

export async function listLeads({
  status,
  hasWebsite,
  minRating,
  search,
  limit = 200,
  offset = 0
} = {}) {
  const database = await initDb()
  if (!database) return []

  const clauses = []
  const args = []

  if (status) {
    clauses.push('status = ?')
    args.push(status)
  }
  if (hasWebsite === true || hasWebsite === false) {
    clauses.push('has_website = ?')
    args.push(hasWebsite ? 1 : 0)
  }
  if (typeof minRating === 'number') {
    clauses.push('rating >= ?')
    args.push(minRating)
  }

  let sql
  if (search && search.trim()) {
    sql = `
      SELECT leads.* FROM leads
      JOIN leads_fts ON leads.id = leads_fts.id
      WHERE leads_fts MATCH ?
      ${clauses.length ? 'AND ' + clauses.join(' AND ') : ''}
      ORDER BY last_seen_at DESC
      LIMIT ? OFFSET ?
    `
    args.unshift(`${search.trim()}*`)
  } else {
    sql = `
      SELECT * FROM leads
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
      ORDER BY last_seen_at DESC
      LIMIT ? OFFSET ?
    `
  }
  args.push(limit, offset)

  const rows = database.prepare(sql).all(...args)
  return serializeRows(rows)
}

export async function getLeadHistory(leadId) {
  const database = await initDb()
  if (!database) return []

  const rows = database
    .prepare(`SELECT * FROM lead_history WHERE lead_id = ? ORDER BY changed_at DESC`)
    .all(leadId)
  return serializeRows(rows)
}

export async function setLeadStatus(leadId, status) {
  const database = await initDb()
  if (!database) return

  if (!LEAD_STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${LEAD_STATUSES.join(', ')}`)
  }
  database.prepare(`UPDATE leads SET status = ? WHERE id = ?`).run(status, leadId)
}

export async function getCachedAnalysis(cacheKey) {
  const database = await initDb()
  if (!database) return null

  const row = database
    .prepare('SELECT payload, created_at FROM analysis_cache WHERE cache_key = ?')
    .get(cacheKey)
  if (!row) return null

  try {
    return { ...JSON.parse(row.payload), cachedAt: row.created_at }
  } catch {
    return null
  }
}

export async function setCachedAnalysis(cacheKey, value) {
  const database = await initDb()
  if (!database) return

  const now = new Date().toISOString()
  const payload = JSON.stringify(value)

  database
    .prepare(
      `INSERT INTO analysis_cache (cache_key, payload, created_at) VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`
    )
    .run(cacheKey, payload, now)
}

export async function getDbStats() {
  const database = await initDb()
  if (!database) return { total: 0, noWebsite: 0, byStatus: [], recentChanges: 0 }

  const total = database.prepare(`SELECT COUNT(*) AS n FROM leads`).get()
  const noWebsite = database.prepare(`SELECT COUNT(*) AS n FROM leads WHERE has_website = 0`).get()
  const byStatusRows = database
    .prepare(`SELECT status, COUNT(*) AS n FROM leads GROUP BY status`)
    .all()
  const recentChanges = database
    .prepare(`SELECT COUNT(*) AS n FROM lead_history WHERE changed_at >= datetime('now', '-7 days')`)
    .get()

  return {
    total: Number(total.n),
    noWebsite: Number(noWebsite.n),
    byStatus: serializeRows(byStatusRows),
    recentChanges: Number(recentChanges.n)
  }
}

function withZeroFilledCounts(rows, allKeys, keyField) {
  const byKey = new Map(rows.map((r) => [r[keyField], Number(r.n)]))
  return allKeys.map((key) => ({ [keyField]: key, n: byKey.get(key) || 0 }))
}

const RATING_BUCKET_ORDER = ['4.5★+', '4.0–4.4★', '3.0–3.9★', 'Under 3★', 'Unrated']

export async function getDashboardStats() {
  const database = await initDb()

  if (!database) {
    return {
      total: 0,
      noWebsite: 0,
      avgRating: 0,
      byStatus: [],
      byCategory: [],
      byRating: [],
      trend: [],
      newLast7Days: 0,
      recentChanges: 0
    }
  }

  const total = database.prepare(`SELECT COUNT(*) AS n FROM leads`).get()
  const noWebsite = database.prepare(`SELECT COUNT(*) AS n FROM leads WHERE has_website = 0`).get()
  const avgRatingRow = database
    .prepare(`SELECT AVG(rating) AS v FROM leads WHERE rating IS NOT NULL`)
    .get()

  const byStatusRows = database
    .prepare(`SELECT status, COUNT(*) AS n FROM leads GROUP BY status`)
    .all()
  const byStatus = withZeroFilledCounts(serializeRows(byStatusRows), LEAD_STATUSES, 'status')

  const byCategory = serializeRows(
    database
      .prepare(
        `
        SELECT category, COUNT(*) AS n FROM leads
        WHERE category IS NOT NULL AND TRIM(category) != ''
        GROUP BY category ORDER BY n DESC LIMIT 6
        `
      )
      .all()
  )

  const ratingRows = database
    .prepare(
      `
      SELECT
        CASE
          WHEN rating IS NULL THEN 'Unrated'
          WHEN rating >= 4.5 THEN '4.5★+'
          WHEN rating >= 4.0 THEN '4.0–4.4★'
          WHEN rating >= 3.0 THEN '3.0–3.9★'
          ELSE 'Under 3★'
        END AS bucket,
        COUNT(*) AS n
      FROM leads GROUP BY bucket
      `
    )
    .all()
  const byRating = withZeroFilledCounts(serializeRows(ratingRows), RATING_BUCKET_ORDER, 'bucket')

  const trendRows = database
    .prepare(
      `
      SELECT substr(first_seen_at, 1, 10) AS day, COUNT(*) AS n
      FROM leads
      WHERE first_seen_at >= datetime('now', '-14 days')
      GROUP BY day
      `
    )
    .all()

  const serializedTrendRows = serializeRows(trendRows)
  const trendByDay = new Map(serializedTrendRows.map((r) => [r.day, r.n]))
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(now - (13 - i) * dayMs).toISOString().slice(0, 10)
    return { day, n: trendByDay.get(day) || 0 }
  })

  const newLast7Days = database
    .prepare(`SELECT COUNT(*) AS n FROM leads WHERE first_seen_at >= datetime('now', '-7 days')`)
    .get()
  const recentChanges = database
    .prepare(`SELECT COUNT(*) AS n FROM lead_history WHERE changed_at >= datetime('now', '-7 days')`)
    .get()

  return {
    total: Number(total.n),
    noWebsite: Number(noWebsite.n),
    avgRating: avgRatingRow.v ? Number(avgRatingRow.v) : null,
    byStatus,
    byCategory,
    byRating,
    trend,
    newLast7Days: Number(newLast7Days.n),
    recentChanges: Number(recentChanges.n)
  }
}
