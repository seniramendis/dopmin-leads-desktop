// src/main/secureStore.js
//
// The app's API key(s) are now baked in at build time (see
// embeddedKeys.js) instead of being entered per-customer through a
// Settings screen — there's no longer a per-user secret to encrypt, so
// this file is just a thin lookup by provider.
import { EMBEDDED_GEMINI_API_KEY, EMBEDDED_OPENROUTER_API_KEY } from './embeddedKeys'

const EMBEDDED_BY_PROVIDER = {
  gemini: EMBEDDED_GEMINI_API_KEY,
  openrouter: EMBEDDED_OPENROUTER_API_KEY
}

export function getApiKey(provider = 'gemini') {
  return EMBEDDED_BY_PROVIDER[provider] || EMBEDDED_BY_PROVIDER.gemini || ''
}
