// src/main/cloudBridge.js
//
// Talks to the two remote pieces of the pipeline from Electron's main
// process (never the renderer — keeps the Turso token and bridge secret out
// of devtools/the page context):
//   1. POST the target URL to the Vercel bridge, which dispatches the
//      GitHub Actions workflow and hands back a jobId.
//   2. Poll Turso's scrape_jobs / leads tables for that jobId until the
//      Action finishes (or errors out).
//
// Exposed to the renderer via two IPC handlers in index.js:
//   'cloud-trigger-scrape'  -> { jobId } | { error }
//   'cloud-poll-job'        -> { status, leadCount, leads, error } | { error }

import { createClient } from '@libsql/client'
import { getCloudConfig, isCloudConfigured } from './cloudConfig'

let tursoClient = null

function getTursoClient() {
  if (tursoClient) return tursoClient
  const { tursoUrl, tursoToken } = getCloudConfig()
  if (!tursoUrl) return null
  tursoClient = createClient({ url: tursoUrl, authToken: tursoToken })
  return tursoClient
}

/** Kicks off a cloud scrape run. @param {string} targetUrl */
export async function triggerCloudScrape(targetUrl) {
  const { bridgeUrl, bridgeApiSecret } = getCloudConfig()

  if (!isCloudConfigured()) {
    return {
      error:
        'Cloud scraping isn\u2019t configured on this install \u2014 missing bridge URL or Turso credentials.'
    }
  }

  try {
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bridgeApiSecret ? { 'x-bridge-secret': bridgeApiSecret } : {})
      },
      body: JSON.stringify({ url: targetUrl })
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      return { error: body?.error || `Bridge returned HTTP ${res.status}` }
    }

    return { jobId: body.jobId }
  } catch (err) {
    return { error: err?.message || 'Failed to reach the bridge endpoint.' }
  }
}

/** Checks Turso for a job's current status + any leads it's produced so far.
 * @param {string} jobId */
export async function pollCloudJob(jobId) {
  const client = getTursoClient()
  if (!client) {
    return { error: 'Turso is not configured on this install.' }
  }

  try {
    const jobResult = await client.execute({
      sql: 'SELECT status, lead_count, error FROM scrape_jobs WHERE id = ?',
      args: [jobId]
    })

    if (jobResult.rows.length === 0) {
      // Row not written yet — the Action may still be starting up.
      return { status: 'pending', leadCount: 0, leads: [] }
    }

    const job = jobResult.rows[0]

    const leadsResult = await client.execute({
      sql: 'SELECT * FROM leads WHERE job_id = ? ORDER BY created_at DESC',
      args: [jobId]
    })

    return {
      status: job.status,
      leadCount: job.lead_count ?? leadsResult.rows.length,
      leads: leadsResult.rows,
      error: job.error || null
    }
  } catch (err) {
    return { error: err?.message || 'Failed to poll Turso.' }
  }
}
