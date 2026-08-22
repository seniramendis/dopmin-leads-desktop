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

/** Env override for the maps_cli.py child process: only set
 * BRIGHT_DATA_WS_ENDPOINT when the user has actually enabled the fallback
 * AND entered an endpoint — otherwise pass an empty string so it can't
 * accidentally pick up a stray value from backend/.env or the system
 * environment while the user thinks fallback is off. */
export function scrapeEnvOverrides() {
  const { enableBrightDataFallback, brightDataEndpoint } = getScrapeSettings()
  return {
    BRIGHT_DATA_WS_ENDPOINT: enableBrightDataFallback && brightDataEndpoint ? brightDataEndpoint : ''
  }
}
