// src/main/cloudConfig.js
//
// Same pattern as embeddedKeys.js: these values get baked into the app
// bundle at build time so customer installs never see a settings screen for
// them. Same tradeoff applies — anyone who unpacks the installed app can
// read these back out, so:
//   - TURSO_AUTH_TOKEN here should be a database-scoped token, not an
//     org/account-level one (Turso: `turso db tokens create dopmin-leads`).
//   - BRIDGE_API_SECRET only gates the public Vercel URL from randoms
//     burning your GitHub Actions minutes — it is not a real access
//     control boundary once it's inside a shipped binary. If that becomes
//     a real abuse concern, move to per-customer license keys checked by
//     the bridge instead of one shared secret baked into every install.
//   - Rotate all of these if a build ever leaks.
//
// For local development, values in `client/.env` (gitignored, see
// client/.env.example) take priority over the constants below, so you're
// not tempted to put real secrets here until you actually build an
// installer for customers.

export const EMBEDDED_CLOUD_CONFIG = {
  // Vercel bridge endpoint, e.g. https://dopmin-leads-bridge.vercel.app/api/trigger
  BRIDGE_URL: '',
  // Must match bridge's BRIDGE_API_SECRET env var
  BRIDGE_API_SECRET: '',
  // Turso database URL + a database-scoped auth token with at least read
  // access, used to poll for job completion / new leads.
  TURSO_DATABASE_URL: '',
  TURSO_AUTH_TOKEN: ''
}

function fromEnvOrEmbedded(envKey, embeddedKey) {
  return process.env[envKey] || EMBEDDED_CLOUD_CONFIG[embeddedKey] || ''
}

export function getCloudConfig() {
  return {
    bridgeUrl: fromEnvOrEmbedded('DOPMIN_BRIDGE_URL', 'BRIDGE_URL'),
    bridgeApiSecret: fromEnvOrEmbedded('DOPMIN_BRIDGE_API_SECRET', 'BRIDGE_API_SECRET'),
    tursoUrl: fromEnvOrEmbedded('TURSO_DATABASE_URL', 'TURSO_DATABASE_URL'),
    tursoToken: fromEnvOrEmbedded('TURSO_AUTH_TOKEN', 'TURSO_AUTH_TOKEN')
  }
}

export function isCloudConfigured() {
  const cfg = getCloudConfig()
  return Boolean(cfg.bridgeUrl && cfg.tursoUrl && cfg.tursoToken)
}
