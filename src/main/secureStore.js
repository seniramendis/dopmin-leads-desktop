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

const API_KEY_FIELD = 'apiKey'

export function getApiKey() {
  const stored = store.get(API_KEY_FIELD, '')
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

export function setApiKey(key) {
  if (!key) {
    store.delete(API_KEY_FIELD)
    return
  }

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    store.set(API_KEY_FIELD, encrypted.toString('base64'))
  } else {
    store.set(API_KEY_FIELD, key)
  }
}
