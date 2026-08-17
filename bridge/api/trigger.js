// bridge/api/trigger.js
//
// POST /api/trigger  { url: "https://target-site.com" }
//
// This is the only piece of the pipeline that holds the GitHub PAT. It never
// reaches the client — Svelte calls this endpoint, this endpoint calls
// GitHub, and the desktop app finds out the scrape is done by polling Turso
// directly (see client/src/main/cloudBridge.js).
//
// Required Vercel project env vars (Project Settings -> Environment Variables,
// NOT committed to git — see bridge/.env.example):
//   GITHUB_PAT       Fine-grained PAT with "Actions: read and write" on this repo
//   GITHUB_OWNER      e.g. "yourorg"
//   GITHUB_REPO       e.g. "dopmin-leads-desktop"
//   GITHUB_REF        branch to run the workflow from, defaults to "main"
//   BRIDGE_API_SECRET shared secret the desktop app must send back so this
//                      public endpoint can't be used by strangers to burn
//                      your GitHub Actions minutes

const crypto = require('crypto')

function isValidUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { GITHUB_PAT, GITHUB_OWNER, GITHUB_REPO, GITHUB_REF, BRIDGE_API_SECRET } = process.env

  if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error('Bridge misconfigured: missing GITHUB_PAT / GITHUB_OWNER / GITHUB_REPO')
    return res.status(500).json({ error: 'Bridge is not configured' })
  }

  // Simple shared-secret gate so this public URL can't be hammered by
  // randoms to burn your Actions minutes. The desktop app sends this back
  // in the x-bridge-secret header (see client/src/main/cloudBridge.js).
  if (BRIDGE_API_SECRET) {
    const provided = req.headers['x-bridge-secret']
    if (!provided || provided !== BRIDGE_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const { url } = req.body || {}
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Body must include a valid http(s) "url"' })
  }

  const jobId = crypto.randomUUID()
  const ref = GITHUB_REF || 'main'

  const ghResponse = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/scrape.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref,
        inputs: {
          target_url: url,
          job_id: jobId
        }
      })
    }
  )

  if (ghResponse.status !== 204) {
    const detail = await ghResponse.text().catch(() => '')
    console.error('GitHub dispatch failed:', ghResponse.status, detail)
    return res.status(502).json({ error: 'Failed to dispatch GitHub Action', detail })
  }

  // 204 No Content on success — GitHub doesn't hand back a run id here,
  // which is exactly why job_id is generated on this side and written by
  // scrape_task.py into the scrape_jobs table for the client to poll.
  return res.status(202).json({ jobId, dispatchedAt: new Date().toISOString() })
}
