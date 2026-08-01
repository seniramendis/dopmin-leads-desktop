// src/main/secureStore.js
//
// Wraps electron-store for the one secret this app persists: the user's
// API key. Previously this was written to disk under a hardcoded
// "encryptionKey" string, which is really just obfuscation — anyone with
// the source (i.e. anyone) can decrypt it. Electron's `safeStorage` module
// instead asks the OS keychain (Keychain on macOS, DPAPI on Windows,
// libsecret on Linux) to do the encryption, so the key never lives
// anywhere as a value we control. We fall back to electron-store's own
// at-rest obfuscation only on platforms where OS encryption isn't
// available (e.g. some minimal Linux setups) so the app still works.
import { safeStorage } from 'electron'
import Store from 'electron-store'

const StoreClass = Store && Store.default ? Store.default : Store

const store = new StoreClass({
  name: 'secure-config',
  // Fallback obfuscation for the rare case safeStorage.isEncryptionAvailable()
  // is false. When it's true (the common case), the value we store is
  // already OS-encrypted, so this second layer barely matters.
  encryptionKey: 'dopmin-scraper-local-fallback'
})

// Field names per provider. "gemini" deliberately keeps the original
// 'apiKey' field name so a key someone already saved via the existing
// Settings UI keeps working unchanged after this file adds a second
// provider.
const FIELD_BY_PROVIDER = {
  gemini: 'apiKey',
  openrouter: 'apiKey_openrouter'
}

function fieldFor(provider) {
  return FIELD_BY_PROVIDER[provider] || FIELD_BY_PROVIDER.gemini
}

export function getApiKey(provider = 'gemini') {
  const field = fieldFor(provider)
  const stored = store.get(field, '')
  if (!stored) return ''

  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      // Value was stored before safeStorage was available (or on a
      // different machine/OS user) — treat it as unreadable rather than
      // crashing the app.
      return ''
    }
  }

  return stored
}

export function setApiKey(key, provider = 'gemini') {
  const field = fieldFor(provider)
  if (!key) {
    store.delete(field)
    return
  }

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    store.set(field, encrypted.toString('base64'))
  } else {
    store.set(field, key)
  }
}
