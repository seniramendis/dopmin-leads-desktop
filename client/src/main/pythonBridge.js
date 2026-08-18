// src/main/pythonBridge.js
//
// Shared bridge between the Electron main process and the Scrapling-based
// Python workers in backend/scrapling_worker/. Each worker is spawned per
// job and speaks newline-delimited JSON on stdout (see
// backend/scrapling_worker/protocol.py):
//
//   {"type": "progress", "payload": {...}}  → forwarded to onProgress
//   {"type": "result",   "payload": {...}}  → resolves the returned promise
//
// The payload shapes are byte-identical to what the old in-process JS
// scrapers produced, so index.js, the preload API, and the renderer need
// no changes.
import { spawn } from 'child_process'
import path from 'path'

// electron-vite builds the main process as CJS, so __dirname is available
// at runtime (same as the old scraper.js relied on for runScraper).
// In dev, the repo layout is client/src/main → ../../../backend. In a
// packaged build, point DOPMIN_BACKEND_DIR at wherever the backend folder
// was shipped (see MIGRATION.md).
const WORKER_DIR =
  process.env.DOPMIN_WORKER_DIR || path.join(__dirname, '../../../backend/scrapling_worker')

// Allow overriding the interpreter (e.g. a bundled venv) via env; fall back
// to the platform default, same as the old runScraper() did.
function pythonExecutable() {
  return process.env.DOPMIN_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
}

/**
 * Spawns one Python worker and resolves with its result payload.
 * Never rejects for handled failures — workers report those as
 * { success: false, error } results, same as the old JS API.
 */
export function runPythonWorker(scriptName, args, onProgress) {
  return new Promise((resolve) => {
    const scriptPath = path.join(WORKER_DIR, scriptName)

    let child
    try {
      child = spawn(pythonExecutable(), [scriptPath, ...args], { env: process.env })
    } catch (error) {
      return resolve({
        success: false,
        error:
          `Could not start the Python scraper: ${error.message}. ` +
          'Make sure Python 3 is installed and backend/requirements.txt has been installed (see MIGRATION.md).'
      })
    }

    let result = null
    let buffer = ''
    let stderrTail = ''

    child.stdout.on('data', (data) => {
      buffer += data.toString()
      let newlineIndex
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) continue

        let message
        try {
          message = JSON.parse(line)
        } catch {
          // Library logs/warnings on stdout — not protocol, just surface them.
          console.log('[scraper]', line)
          continue
        }

        if (message.type === 'progress') {
          try {
            onProgress?.(message.payload)
          } catch {
            // Progress reporting must never kill the scrape.
          }
        } else if (message.type === 'result') {
          result = message.payload
        }
      }
    })

    child.stderr.on('data', (data) => {
      // Keep only the tail — Python tracebacks go here and the last lines
      // are the useful part if the worker dies without a result.
      stderrTail = (stderrTail + data.toString()).slice(-4000)
    })

    child.on('error', (error) => {
      resolve({
        success: false,
        error:
          `Could not start the Python scraper: ${error.message}. ` +
          'Make sure Python 3 is installed and backend/requirements.txt has been installed (see MIGRATION.md).'
      })
    })

    child.on('close', (code) => {
      if (result) return resolve(result)
      const lastStderrLine = stderrTail.trim().split('\n').pop() || ''
      resolve({
        success: false,
        error:
          `Scraper worker exited without a result (code ${code}).` +
          (lastStderrLine ? ` ${lastStderrLine}` : '')
      })
    })
  })
}
