import { supabase } from './supabase'

export const MODE_KEY = 'content-mode'
export const OVERRIDES_KEY = 'adult-overrides'
export const WATCH_LINK_PREFIX = 'watch-link:'
export const PREFS_CHANGED_EVENT = 'adult-filter-changed'
export const WATCH_LINKS_CHANGED_EVENT = 'watch-links-changed'
const SYNCED_KEY = 'vault-prefs-synced'

interface VaultPrefs {
  contentMode: 'creamy' | 'clean'
  adultOverrides: Record<string, boolean>
  watchLinks: Record<string, string>
}

function collectLocal(): VaultPrefs {
  const watchLinks: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(WATCH_LINK_PREFIX)) watchLinks[key.slice(WATCH_LINK_PREFIX.length)] = localStorage.getItem(key) || ''
  }
  let adultOverrides: Record<string, boolean> = {}
  try {
    adultOverrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}')
  } catch {
    /* ignore corrupt value */
  }
  return {
    contentMode: localStorage.getItem(MODE_KEY) === 'clean' ? 'clean' : 'creamy',
    adultOverrides,
    watchLinks,
  }
}

function clearLocal() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(WATCH_LINK_PREFIX))
    .forEach((k) => localStorage.removeItem(k))
  localStorage.removeItem(OVERRIDES_KEY)
  localStorage.removeItem(MODE_KEY)
}

function applyToLocal(prefs: VaultPrefs) {
  clearLocal()
  localStorage.setItem(MODE_KEY, prefs.contentMode)
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(prefs.adultOverrides || {}))
  Object.entries(prefs.watchLinks || {}).forEach(([id, url]) => url && localStorage.setItem(WATCH_LINK_PREFIX + id, url))
  window.dispatchEvent(new Event(PREFS_CHANGED_EVENT))
  window.dispatchEvent(new Event(WATCH_LINKS_CHANGED_EVENT))
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
let signedIn = false

/** Call after any local change to content mode, 18+ flags or watch links. */
export function schedulePrefsPush() {
  if (!signedIn) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    supabase.auth.updateUser({ data: { vault_prefs: collectLocal() } }).catch(() => undefined)
  }, 800)
}

let started = false

/** Account copy wins once it exists; the first device to sync uploads its local data. */
export function initPrefsSync() {
  if (started) return
  started = true
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      signedIn = false
      clearLocal()
      localStorage.removeItem(SYNCED_KEY)
      window.dispatchEvent(new Event(PREFS_CHANGED_EVENT))
      return
    }
    if (!session?.user || (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN')) return
    signedIn = true
    const uid = session.user.id
    const remote = session.user.user_metadata?.vault_prefs as VaultPrefs | undefined
    const firstSyncHere = localStorage.getItem(SYNCED_KEY) !== uid

    if (firstSyncHere) {
      const local = collectLocal()
      const merged: VaultPrefs = {
        contentMode: remote?.contentMode ?? local.contentMode,
        adultOverrides: { ...local.adultOverrides, ...remote?.adultOverrides },
        watchLinks: { ...local.watchLinks, ...remote?.watchLinks },
      }
      applyToLocal(merged)
      localStorage.setItem(SYNCED_KEY, uid)
      if (JSON.stringify(merged) !== JSON.stringify(remote)) schedulePrefsPush()
    } else if (remote) {
      applyToLocal(remote)
    }
  })
}
