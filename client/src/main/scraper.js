// src/main/scraper.js
//
// Search + indexing pipeline for worldwide Google Maps business data.
//
// As of the Scrapling migration, the actual scraping no longer runs in this
// process — it lives in the Python workers under backend/scrapling_worker/
// (maps_pipeline.py), built on Scrapling's AsyncStealthySession:
// anti-detect browser, managed page pool, session-wide resource blocking,
// and Selector-API parsing. This file is now a thin bridge that spawns a
// worker per job and streams its progress back, keeping the exact same
// exports and result shapes index.js has always consumed:
//
//   scrapeLeads(query, maxResults, onProgress, options)  → maps_cli.py
//   scrapeSingleBusiness(url, options, onProgress)       → profile_cli.py
//   runScraper(targetUrl, jobId)                         → scrape_task.py
//     (the cloud/Turso worker — was already Python + Scrapling)
//
// The two-phase design docs now live in backend/scrapling_worker/maps_pipeline.py.
import { spawn } from 'child_process'
import path from 'path'
import { runPythonWorker } from './pythonBridge'
import { getApiKey } from './secureStore'

/**
 * Google Maps lead search. Same signature and result shape as before the
 * migration: { success, leads, requested, totalFound, truncated,
 * failedCount, expanded, queriesUsed } plus progress events with the same
 * phases ('searching' | 'discovering' | 'extracting' | 'done' |
 * 'connection-slow' | 'connection-lost').
 */
export async function scrapeLeads(query, maxResults = 20, onProgress, options = {}) {
  return runPythonWorker(
    'maps_cli.py',
    [String(query || ''), String(maxResults ?? 20), options.mode || ''],
    onProgress
  )
}

/**
 * Single-business deep profile (pricing/services, contact/social, tech
 * stack, optional competitor comparison, folded-in $0 audit). Same
 * signature and result shape as the old businessProfiler.js export.
 *
 * profile_cli.py's Phase 2 LLM extraction (llm_extractor.py) needs the
 * embedded Gemini key, which lives in secureStore.js on this side, not
 * anywhere the Python child process can read it directly — so it's passed
 * through as an env var on the spawn call. If the key is empty (no
 * embedded key baked into this build), profiler.py just falls back to its
 * regex parsers, so this is safe to pass unconditionally.
 */
export async function scrapeSingleBusiness(url, options = {}, onProgress) {
  return runPythonWorker(
    'profile_cli.py',
    [String(url || ''), JSON.stringify(options.competitorUrls || [])],
    onProgress,
    { DOPMIN_GEMINI_API_KEY: getApiKey('gemini') }
  )
}

/**
 * Integrates with the Python backend (`backend/scrape_task.py`)
 * Spawns the Scrapling-based worker as a child process.
 */
export function runScraper(targetUrl, jobId = null) {
  return new Promise((resolve, reject) => {
    // Ensure cross-platform compatibility for the python executable
    const pythonExecutable =
      process.env.DOPMIN_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')

    // Target the specific scrape_task.py file in your backend folder
    const scriptPath = path.join(__dirname, '../../../backend/scrape_task.py')

    // Pass targetUrl as the first positional argument, and jobId as the second if provided.
    // (Matches sys.argv in your Python script)
    const args = [scriptPath, targetUrl]
    if (jobId) {
      args.push(jobId)
    }

    // Pass process.env so the Python script can read the Turso credentials
    const scraperProcess = spawn(pythonExecutable, args, {
      env: process.env
    })

    let outputLog = ''
    let errorLog = ''

    // Capture standard output (plaintext progress logs)
    scraperProcess.stdout.on('data', (data) => {
      const msg = data.toString()
      outputLog += msg
      console.log(`[Scraper Info]: ${msg.trim()}`)
    })

    // Capture standard error (for actual Python exceptions)
    scraperProcess.stderr.on('data', (data) => {
      const msg = data.toString()
      errorLog += msg
      console.error(`[Scraper Error]: ${msg.trim()}`)
    })

    scraperProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Scraper exited with code ${code}.\nLogs: ${errorLog || outputLog}`)
        )
      }

      // Resolve immediately on success since Python handles the Turso DB upsert
      resolve({
        status: 'success',
        message: 'Scrape job completed and pushed to Turso.',
        jobId: jobId
      })
    })
  })
}
