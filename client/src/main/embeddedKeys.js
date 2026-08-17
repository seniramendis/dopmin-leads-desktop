// src/main/embeddedKeys.js
//
// Dopmin ships with its own API key baked in, so customers never see a
// key field and never need to get one themselves — the "AI pitch" button
// and the AI Analyst just work out of the box.
//
// Paste the real key(s) below before building an install for customers,
// then run `npm run build:win` / `build:mac` / `build:linux` as usual.
//
// ⚠️ Heads up on how this works: whatever you put here gets compiled
// straight into the app bundle. That's fine for "customers don't manage
// keys," but it's not a secret in the cryptographic sense — anyone who
// unpacks the installed app (a few minutes of work with public tools)
// can read it back out. Two practical implications:
//   1. Every install shares this one key/quota — usage from all your
//      customers draws on the same account.
//   2. Rotate this key if a build ever leaks or usage looks abnormal.
// If that ever becomes a real cost/abuse concern, the standard fix is a
// small backend you control that holds the key server-side and the app
// calls instead of hitting Google/OpenRouter directly. Not necessary to
// start — just worth knowing the tradeoff you're making by embedding it.
export const EMBEDDED_GEMINI_API_KEY = ''
export const EMBEDDED_OPENROUTER_API_KEY = ''
