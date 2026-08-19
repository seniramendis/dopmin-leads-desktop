// src/main/db.js
//
// Local SQLite implementation using sql.js — a pure WebAssembly build of
// SQLite. Deliberately chosen over better-sqlite3: better-sqlite3 is a
// native C++ addon that must be compiled per-machine (needs Visual Studio
// Build Tools on Windows, Xcode CLT on Mac, build-essential on Linux),
// which is exactly the kind of setup friction this app should not require
// from a customer install. sql.js has zero native dependencies — it just
// works everywhere Node.js runs.
//
// Trade-off: sql.js keeps the whole database in memory and we explicitly
// persist it to disk (as a single binary file) after each write. That's
// perfectly fine at this app's scale (a local leads list, not a
// high-write server database).
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
import { createRequire } from 'node:module'
import { app } from 'electron'
import initSqlJs from 'sql.js'
import { LEAD_STATUSES, TRACKED_CHANGE_FIELDS } from './constants'

const require = createRequire(import.meta.url)

// Lazy-loaded singletons
let db = null
let dbPath = null
let SQL = null

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

function resolveDbPath() {
  // app.getPath is only available once Electron's app is ready; by the
  // time any IPC handler calls initDb() that's already true. Fall back to
  // cwd for non-Electron contexts (e.g. running db.js under plain node).
  const userDataDir = app?.getPath ? app.getPath('userData') : process.cwd()
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }
  return path.join(userDataDir, 'dopmin-leads.sqlite')
}

/** Writes the current in-memory database to disk. Call after any write. */
function persist() {
  if (!db || !dbPath) return
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

// --- Thin query helpers over sql.js's statement API -----------------------
//
// (A prepared-statement cache was tried here to skip re-parsing repeated
// query shapes, but sql.js statement handles can go stale across a
// db.export()/persist() cycle — reusing one threw "Statement closed".
// prepare()+free() per call is what's actually safe with sql.js, and the
// indexes below plus the batched upsert lookup are where the real cost was
// anyway, so this stays simple rather than "clever".)

function run(sql, params = []) {
  db.run(sql, params)
}

function get(sql, params = []) {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params)
    if (stmt.step()) return stmt.getAsObject()
    return null
  } finally {
    stmt.free()
  }
}

function all(sql, params = []) {
  const stmt = db.prepare(sql)
  const rows = []
  try {
    stmt.bind(params)
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } finally {
    stmt.free()
  }
}

export async function initDb() {
  if (db) return db // If already connected, skip

  if (!SQL) {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    SQL = await initSqlJs({ locateFile: () => wasmPath })
  }

  dbPath = resolveDbPath()
  const existing = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null
  db = existing ? new SQL.Database(existing) : new SQL.Database()

  // 1. Build tables (search uses plain LIKE queries below rather than
  // FTS5, since FTS5 support varies across sql.js builds — LIKE is
  // guaranteed to work everywhere and this dataset is small enough that
  // it costs nothing in practice).
  db.run(`
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

    -- listLeads/countLeads always sort by last_seen_at DESC and commonly
    -- filter on has_website / rating / status together (the pipeline board
    -- filters status per-column, the table view filters website+rating).
    -- Without these, every list/count call was a full-table scan followed
    -- by an O(n log n) sort — fine at a few hundred rows, but it degrades
    -- fast as the local database grows into the thousands. These let
    -- SQLite answer "give me page N of {status, has_website, rating>=X}
    -- ordered by recency" as an index range scan instead.
    CREATE INDEX IF NOT EXISTS idx_leads_last_seen ON leads(last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_website ON leads(has_website);
    CREATE INDEX IF NOT EXISTS idx_leads_rating ON leads(rating);
    CREATE INDEX IF NOT EXISTS idx_leads_status_last_seen ON leads(status, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS analysis_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)

  // 2. The 30-Day Auto-Purge. Cleans up any leads older than 30 days every
  // time the database boots.
  try {
    run(`DELETE FROM leads WHERE first_seen_at < datetime('now', '-30 days')`)
  } catch (err) {
    console.error('Failed to execute 30-day purge:', err)
  }

  persist()

  return db
}

export async function upsertLeads(leads, queryUsed) {
  const database = await initDb()
  if (!database) return new Map()

  const now = new Date().toISOString()
  const annotations = new Map()

  // Batch-fetch every existing row this scrape could touch in a single
  // query instead of one SELECT per lead. A 500-lead scrape previously
  // meant 500 separate prepare/bind/step round trips just to find out
  // which leads already existed; this replaces that with one indexed
  // "WHERE id IN (...)" lookup (id is the PRIMARY KEY, so it's a direct
  // hash/B-tree lookup, not a scan) plus an in-memory Map, so each lead
  // in the loop below is an O(1) Map.get() instead of a fresh query.
  const ids = leads.map(fingerprint)
  const placeholders = ids.map(() => '?').join(',')
  const existingRows = ids.length
    ? all(`SELECT * FROM leads WHERE id IN (${placeholders})`, ids)
    : []
  const existingById = new Map(existingRows.map((row) => [row.id, row]))

  leads.forEach((lead, i) => {
    const id = ids[i]
    const existing = existingById.get(id) || null

    const name = lead.name || 'Unnamed business'
    const category = lead.category || ''
    const phone = lead.phone || ''
    const address = lead.address || ''
    const mapsUrl = lead.mapsUrl || ''
    const rating = lead.rating ?? null
    const reviewCount = lead.reviewCount ?? 0
    const hasWebsite = lead.hasWebsite ? 1 : 0
    const website = lead.website || ''
    const reputation = lead.reputation || 'unrated'

    if (!existing) {
      run(
        `INSERT INTO leads
          (id, name, category, phone, address, maps_url, rating, review_count, has_website, website, reputation, status, query_used, first_seen_at, last_seen_at, times_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, 1)`,
        [
          id,
          name,
          category,
          phone,
          address,
          mapsUrl,
          rating,
          reviewCount,
          hasWebsite,
          website,
          reputation,
          queryUsed || '',
          now,
          now
        ]
      )

      annotations.set(lead.id, { dbId: id, isNew: true, changes: [], status: 'new' })
      return
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
        run(
          `INSERT INTO lead_history (lead_id, changed_at, field, old_value, new_value) VALUES (?, ?, ?, ?, ?)`,
          [id, now, field, String(oldVal ?? ''), String(newVal ?? '')]
        )
      }
    }

    const queryUsedFinal = queryUsed || existing.query_used

    run(
      `UPDATE leads SET
        category = ?, phone = ?, address = ?, maps_url = ?,
        rating = ?, review_count = ?, has_website = ?,
        website = ?, reputation = ?, query_used = ?,
        last_seen_at = ?, times_seen = times_seen + 1
        WHERE id = ?`,
      [category, phone, address, mapsUrl, rating, reviewCount, hasWebsite, website, reputation, queryUsedFinal, now, id]
    )

    annotations.set(lead.id, { dbId: id, isNew: false, changes, status: existing.status })
  })

  persist()

  return annotations
}

function buildSearchClause(search, args) {
  if (!search || !search.trim()) return ''
  const like = `%${search.trim()}%`
  args.push(like, like, like)
  return '(name LIKE ? OR category LIKE ? OR address LIKE ?)'
}

export async function countLeads(filters = {}) {
  const database = await initDb()
  if (!database) return 0

  const { status, hasWebsite, minRating, search } = filters
  const clauses = []
  const args = []

  const searchClause = buildSearchClause(search, args)
  if (searchClause) clauses.push(searchClause)

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

  const sql = `SELECT COUNT(*) AS n FROM leads ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}`
  const row = get(sql, args)
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

  const searchClause = buildSearchClause(search, args)
  if (searchClause) clauses.push(searchClause)

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

  const sql = `
    SELECT * FROM leads
    ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
    ORDER BY last_seen_at DESC
    LIMIT ? OFFSET ?
  `
  args.push(limit, offset)

  return all(sql, args)
}

export async function getLeadHistory(leadId) {
  const database = await initDb()
  if (!database) return []

  return all(`SELECT * FROM lead_history WHERE lead_id = ? ORDER BY changed_at DESC`, [leadId])
}

export async function setLeadStatus(leadId, status) {
  const database = await initDb()
  if (!database) return

  if (!LEAD_STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${LEAD_STATUSES.join(', ')}`)
  }
  run(`UPDATE leads SET status = ? WHERE id = ?`, [status, leadId])
  persist()
}

export async function getCachedAnalysis(cacheKey) {
  const database = await initDb()
  if (!database) return null

  const row = get('SELECT payload, created_at FROM analysis_cache WHERE cache_key = ?', [
    cacheKey
  ])
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

  run(
    `INSERT INTO analysis_cache (cache_key, payload, created_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`,
    [cacheKey, payload, now]
  )
  persist()
}

export async function getDbStats() {
  const database = await initDb()
  if (!database) return { total: 0, noWebsite: 0, byStatus: [], recentChanges: 0 }

  const total = get(`SELECT COUNT(*) AS n FROM leads`)
  const noWebsite = get(`SELECT COUNT(*) AS n FROM leads WHERE has_website = 0`)
  const byStatusRows = all(`SELECT status, COUNT(*) AS n FROM leads GROUP BY status`)
  const recentChanges = get(
    `SELECT COUNT(*) AS n FROM lead_history WHERE changed_at >= datetime('now', '-7 days')`
  )

  return {
    total: Number(total.n),
    noWebsite: Number(noWebsite.n),
    byStatus: byStatusRows,
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

  const total = get(`SELECT COUNT(*) AS n FROM leads`)
  const noWebsite = get(`SELECT COUNT(*) AS n FROM leads WHERE has_website = 0`)
  const avgRatingRow = get(`SELECT AVG(rating) AS v FROM leads WHERE rating IS NOT NULL`)

  const byStatusRows = all(`SELECT status, COUNT(*) AS n FROM leads GROUP BY status`)
  const byStatus = withZeroFilledCounts(byStatusRows, LEAD_STATUSES, 'status')

  const byCategory = all(`
    SELECT category, COUNT(*) AS n FROM leads
    WHERE category IS NOT NULL AND TRIM(category) != ''
    GROUP BY category ORDER BY n DESC LIMIT 6
  `)

  const ratingRows = all(`
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
  `)
  const byRating = withZeroFilledCounts(ratingRows, RATING_BUCKET_ORDER, 'bucket')

  const trendRows = all(`
    SELECT substr(first_seen_at, 1, 10) AS day, COUNT(*) AS n
    FROM leads
    WHERE first_seen_at >= datetime('now', '-14 days')
    GROUP BY day
  `)

  const trendByDay = new Map(trendRows.map((r) => [r.day, r.n]))
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(now - (13 - i) * dayMs).toISOString().slice(0, 10)
    return { day, n: trendByDay.get(day) || 0 }
  })

  const newLast7Days = get(
    `SELECT COUNT(*) AS n FROM leads WHERE first_seen_at >= datetime('now', '-7 days')`
  )
  const recentChanges = get(
    `SELECT COUNT(*) AS n FROM lead_history WHERE changed_at >= datetime('now', '-7 days')`
  )

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
