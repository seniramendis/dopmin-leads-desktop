// src/main/db.js
//
// 100% Serverless/Cloud implementation using Turso (libSQL).
// Bypasses all local C++ compiler requirements by using the pure HTTP /web client.
import crypto from 'node:crypto'
import { createClient } from '@libsql/client/web'
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

// Helper to safely serialize Turso rows for Electron IPC
// Strips custom prototypes and converts BigInts to standard Numbers
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

export async function initDb() {
  if (db) return db // If already connected, skip

  const url = process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN

  if (!url) {
    console.error('CRITICAL ERROR: Turso URL is missing from environment variables.')
    return null
  }

  // Initialize the client safely
  db = createClient({ url, authToken })

  // 1. Build Tables
  await db.executeMultiple(`
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

  // 2. The 30-Day Auto-Purge (Turso equivalent to pg_cron)
  // Cleans up any leads older than 30 days every time the database boots.
  try {
    await db.execute(`DELETE FROM leads WHERE first_seen_at < datetime('now', '-30 days')`)
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
  const statements = []

  for (const lead of leads) {
    const id = fingerprint(lead)

    const existingResult = await database.execute({
      sql: `SELECT * FROM leads WHERE id = ?`,
      args: [id]
    })
    const existing = existingResult.rows[0]

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
      statements.push({
        sql: `INSERT INTO leads 
          (id, name, category, phone, address, maps_url, rating, review_count, has_website, website, reputation, status, query_used, first_seen_at, last_seen_at, times_seen) 
          VALUES (:id, :name, :category, :phone, :address, :mapsUrl, :rating, :reviewCount, :hasWebsite, :website, :reputation, 'new', :queryUsed, :now, :now, 1)`,
        args: params
      })
      statements.push({
        sql: `DELETE FROM leads_fts WHERE id = ?`,
        args: [id]
      })
      statements.push({
        sql: `INSERT INTO leads_fts (id, name, category, address) VALUES (?, ?, ?, ?)`,
        args: [id, params.name, params.category, params.address]
      })

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
        statements.push({
          sql: `INSERT INTO lead_history (lead_id, changed_at, field, old_value, new_value) VALUES (?, ?, ?, ?, ?)`,
          args: [id, now, field, String(oldVal ?? ''), String(newVal ?? '')]
        })
      }
    }

    params.queryUsed = queryUsed || existing.query_used

    statements.push({
      sql: `UPDATE leads SET 
        category = :category, phone = :phone, address = :address, maps_url = :mapsUrl, 
        rating = :rating, review_count = :reviewCount, has_website = :hasWebsite, 
        website = :website, reputation = :reputation, query_used = :queryUsed, 
        last_seen_at = :now, times_seen = times_seen + 1 
        WHERE id = :id`,
      args: params
    })
    statements.push({
      sql: `DELETE FROM leads_fts WHERE id = ?`,
      args: [id]
    })
    statements.push({
      sql: `INSERT INTO leads_fts (id, name, category, address) VALUES (?, ?, ?, ?)`,
      args: [id, params.name, params.category, params.address]
    })

    annotations.set(lead.id, { dbId: id, isNew: false, changes, status: existing.status })
  }

  if (statements.length > 0) {
    await database.batch(statements, 'write')
  }

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

  const result = await database.execute({ sql, args })
  return Number(result.rows[0].n)
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

  const result = await database.execute({ sql, args })
  return serializeRows(result.rows)
}

export async function getLeadHistory(leadId) {
  const database = await initDb()
  if (!database) return []

  const result = await database.execute({
    sql: `SELECT * FROM lead_history WHERE lead_id = ? ORDER BY changed_at DESC`,
    args: [leadId]
  })
  return serializeRows(result.rows)
}

export async function setLeadStatus(leadId, status) {
  const database = await initDb()
  if (!database) return

  if (!LEAD_STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${LEAD_STATUSES.join(', ')}`)
  }
  await database.execute({
    sql: `UPDATE leads SET status = ? WHERE id = ?`,
    args: [status, leadId]
  })
}

export async function getCachedAnalysis(cacheKey) {
  const database = await initDb()
  if (!database) return null

  const result = await database.execute({
    sql: 'SELECT payload, created_at FROM analysis_cache WHERE cache_key = ?',
    args: [cacheKey]
  })
  if (result.rows.length === 0) return null

  try {
    return { ...JSON.parse(result.rows[0].payload), cachedAt: result.rows[0].created_at }
  } catch {
    return null
  }
}

export async function setCachedAnalysis(cacheKey, value) {
  const database = await initDb()
  if (!database) return

  const now = new Date().toISOString()
  const payload = JSON.stringify(value)

  await database.execute({
    sql: `INSERT INTO analysis_cache (cache_key, payload, created_at) VALUES (?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`,
    args: [cacheKey, payload, now]
  })
}

export async function getDbStats() {
  const database = await initDb()
  if (!database) return { total: 0, noWebsite: 0, byStatus: [], recentChanges: 0 }

  const totalRes = await database.execute(`SELECT COUNT(*) AS n FROM leads`)
  const noWebsiteRes = await database.execute(
    `SELECT COUNT(*) AS n FROM leads WHERE has_website = 0`
  )
  const byStatusRes = await database.execute(
    `SELECT status, COUNT(*) AS n FROM leads GROUP BY status`
  )
  const recentChangesRes = await database.execute(
    `SELECT COUNT(*) AS n FROM lead_history WHERE changed_at >= datetime('now', '-7 days')`
  )

  return {
    total: Number(totalRes.rows[0].n),
    noWebsite: Number(noWebsiteRes.rows[0].n),
    byStatus: serializeRows(byStatusRes.rows),
    recentChanges: Number(recentChangesRes.rows[0].n)
  }
}

function withZeroFilledCounts(rows, allKeys, keyField) {
  const byKey = new Map(rows.map((r) => [r[keyField], Number(r.n)]))
  return allKeys.map((key) => ({ [keyField]: key, n: byKey.get(key) || 0 }))
}

function ratingBucketOf(rating) {
  if (rating == null) return 'Unrated'
  if (rating >= 4.5) return '4.5★+'
  if (rating >= 4.0) return '4.0–4.4★'
  if (rating >= 3.0) return '3.0–3.9★'
  return 'Under 3★'
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

  const totalRes = await database.execute(`SELECT COUNT(*) AS n FROM leads`)
  const noWebsiteRes = await database.execute(
    `SELECT COUNT(*) AS n FROM leads WHERE has_website = 0`
  )
  const avgRatingRes = await database.execute(
    `SELECT AVG(rating) AS v FROM leads WHERE rating IS NOT NULL`
  )

  const byStatusRes = await database.execute(
    `SELECT status, COUNT(*) AS n FROM leads GROUP BY status`
  )
  const byStatus = withZeroFilledCounts(serializeRows(byStatusRes.rows), LEAD_STATUSES, 'status')

  const byCategoryRes = await database.execute(`
    SELECT category, COUNT(*) AS n FROM leads
    WHERE category IS NOT NULL AND TRIM(category) != ''
    GROUP BY category ORDER BY n DESC LIMIT 6
  `)
  const byCategory = serializeRows(byCategoryRes.rows)

  const ratingRowsRes = await database.execute(`
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
  const byRating = withZeroFilledCounts(
    serializeRows(ratingRowsRes.rows),
    RATING_BUCKET_ORDER,
    'bucket'
  )

  const trendRowsRes = await database.execute(`
    SELECT substr(first_seen_at, 1, 10) AS day, COUNT(*) AS n
    FROM leads
    WHERE first_seen_at >= datetime('now', '-14 days')
    GROUP BY day
  `)

  const serializedTrendRows = serializeRows(trendRowsRes.rows)
  const trendByDay = new Map(serializedTrendRows.map((r) => [r.day, r.n]))
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(now - (13 - i) * dayMs).toISOString().slice(0, 10)
    return { day, n: trendByDay.get(day) || 0 }
  })

  const newLast7DaysRes = await database.execute(
    `SELECT COUNT(*) AS n FROM leads WHERE first_seen_at >= datetime('now', '-7 days')`
  )
  const recentChangesRes = await database.execute(
    `SELECT COUNT(*) AS n FROM lead_history WHERE changed_at >= datetime('now', '-7 days')`
  )

  return {
    total: Number(totalRes.rows[0].n),
    noWebsite: Number(noWebsiteRes.rows[0].n),
    avgRating: avgRatingRes.rows[0].v ? Number(avgRatingRes.rows[0].v) : null,
    byStatus,
    byCategory,
    byRating,
    trend,
    newLast7Days: Number(newLast7DaysRes.rows[0].n),
    recentChanges: Number(recentChangesRes.rows[0].n)
  }
}
