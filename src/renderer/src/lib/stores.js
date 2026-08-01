// src/renderer/src/lib/stores.js
import { writable } from 'svelte/store'

// Whether the Settings modal (API keys) is open. Global because several
// far-apart places need to be able to open it: the sidebar/header settings
// button, and the "Add an API key" prompt that surfaces inline wherever an
// analysis fails for lack of one (a lead row's modal, the AI Profiler tab).
export const settingsOpen = writable(false)
