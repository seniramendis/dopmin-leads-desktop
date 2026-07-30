// src/main/network.js
//
// Small, dependency-free helpers for dealing with a flaky internet
// connection during a scrape. Two jobs:
//   1. A fast up-front check ("do we even have a connection right now?")
//      so we can fail immediately instead of spending 30s on a Playwright
//      navigation timeout.
//   2. A classifier for Chromium's network-level error strings, so the
//      scraper can tell "Google rate-limited us" apart from "the user's
//      wifi dropped" and react differently to each.
import dns from 'dns/promises'

// Chromium/Playwright surfaces connection problems as `net::ERR_*` strings
// inside the navigation error message. These are the ones that mean "the
// network itself is the problem", as opposed to app-level failures (a
// selector not found, a page taking a slow-but-successful path, etc).
const NETWORK_ERROR_PATTERN =
  /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED|ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_TIMED_OUT|net::ERR_/i

export function isNetworkError(message = '') {
  return NETWORK_ERROR_PATTERN.test(String(message))
}

/**
 * Resolves a well-known hostname to confirm the machine currently has a
 * working internet connection (DNS + basic routing). This is much cheaper
 * and faster than letting a full page navigation time out, so it's used as
 * a quick pre-flight check before we ever launch a browser.
 */
export async function checkInternetConnection(timeoutMs = 5000) {
  try {
    await Promise.race([
      dns.lookup('google.com'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('dns timeout')), timeoutMs))
    ])
    return true
  } catch {
    return false
  }
}

/**
 * Tracks connection quality across a single scrape run. Every navigation
 * reports in via recordSuccess/recordFailure; once too many *network*
 * failures happen back-to-back (as opposed to occasional page hiccups),
 * `aborted` flips true and every in-flight loop should stop launching new
 * work rather than grinding through a dead connection.
 */
export class NetworkHealth {
  constructor({ onProgress, slowThresholdMs, maxConsecutiveFailures } = {}) {
    this.onProgress = onProgress
    this.slowThresholdMs = slowThresholdMs ?? 12000
    this.maxConsecutiveFailures = maxConsecutiveFailures ?? 4
    this.consecutiveFailures = 0
    this.aborted = false
    this._warnedSlow = false
  }

  recordSuccess(navMs) {
    this.consecutiveFailures = 0
    if (navMs > this.slowThresholdMs && !this._warnedSlow) {
      this._warnedSlow = true
      this.onProgress?.({
        phase: 'connection-slow',
        message: 'Your internet connection looks slow — this search may take longer than usual.'
      })
    }
    // Let a later slow navigation re-trigger the warning if things recover
    // and then degrade again.
    if (navMs <= this.slowThresholdMs) {
      this._warnedSlow = false
    }
  }

  recordFailure(message) {
    if (!isNetworkError(message)) return
    this.consecutiveFailures += 1
    if (this.consecutiveFailures >= this.maxConsecutiveFailures && !this.aborted) {
      this.aborted = true
      this.onProgress?.({
        phase: 'connection-lost',
        message: 'Lost the internet connection. Stopping the search — please try again.'
      })
    }
  }
}

export class ConnectionLostError extends Error {
  constructor() {
    super('Your internet connection dropped mid-search. Please check your connection and try again.')
    this.name = 'ConnectionLostError'
  }
}
