// src/main/scrapeSettings.js
//
// Persists the user's Bright Data *fallback* configuration, so it survives
// app restarts without anyone hand-editing backend/.env.
//
// Local browser search always runs first — no account needed, and far
// faster for normal single-machine use than a round trip to a remote
// proxy for every page. Bright Data is only used automatically mid-search
// if the local attempt hits a real stall/rate-limit AND the user has
// enabled this fallback with a valid endpoint (see maps_pipeline.py's
// scrape_leads()). There's no more "pick one mode" toggle — this is
// purely an opt-in safety net for when local search runs into trouble.
import Store from 'electron-store'

const store = new Store({
  name: 'scrape-settings',
  defaults: {
    enableBrightDataFallback: false,
    brightDataEndpoint: ''
  }
})

export function getScrapeSettings() {
  return {
    enableBrightDataFallback: store.get('enableBrightDataFallback'),
    brightDataEndpoint: store.get('brightDataEndpoint')
  }
}

export function setScrapeSettings({ enableBrightDataFallback, brightDataEndpoint }) {
  if (typeof enableBrightDataFallback === 'boolean') {
    store.set('enableBrightDataFallback', enableBrightDataFallback)
  }
  if (typeof brightDataEndpoint === 'string') {
    store.set('brightDataEndpoint', brightDataEndpoint.trim())
  }
  return getScrapeSettings()
}

/** Env override for the maps_cli.py child process.
 *
 * Priority:
 *   1. In-app Settings toggle + endpoint (enableBrightDataFallback +
 *      brightDataEndpoint) — if the user has explicitly turned this on and
 *      entered a value, that always wins.
 *   2. Otherwise, fall back to whatever BRIGHT_DATA_WS_ENDPOINT is already
 *      sitting in backend/.env / the system environment, so setting it
 *      there is enough on its own without also touching the Settings UI.
 *   3. Empty string if neither is set.
 *
 * Previously this unconditionally returned '' whenever the in-app toggle
 * was off, which silently discarded a value the user had put in .env —
 * that's fixed by the process.env fallback in step 2. */
export function scrapeEnvOverrides() {
  const { enableBrightDataFallback, brightDataEndpoint } = getScrapeSettings()
  const endpoint =
    enableBrightDataFallback && brightDataEndpoint
      ? brightDataEndpoint
      : process.env.BRIGHT_DATA_WS_ENDPOINT || ''
  return {
    BRIGHT_DATA_WS_ENDPOINT: endpoint
  }
}
