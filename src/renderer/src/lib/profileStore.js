// src/renderer/src/lib/profileStore.js
//
// LeadActions.svelte (one row per lead, deep inside ResultsTable) needs to
// open the Deep Profile modal that lives up in App.svelte. Piping a
// callback prop through ResultsTable -> LeadActions for this one thing
// would mean threading it through a component that otherwise has nothing
// to do with profiling. A tiny shared store is the more honest fit here.
import { writable } from 'svelte/store'

/** @type {import('svelte/store').Writable<{ url: string, leadName: string } | null>} */
export const deepProfileRequest = writable(null)

export function openDeepProfile(url, leadName = '') {
  deepProfileRequest.set({ url, leadName })
}

export function closeDeepProfile() {
  deepProfileRequest.set(null)
}
