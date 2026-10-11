import { useCallback, useEffect, useMemo, useState } from 'react'
import { MediaItem, anilistId } from '../types/media'
import { MODE_KEY, OVERRIDES_KEY, PREFS_CHANGED_EVENT as CHANGE_EVENT, schedulePrefsPush } from '../lib/prefsSync'
import { MediaMeta, useAniListMeta } from '../lib/anilistMeta'

export { ADULT_GENRES } from '../lib/anilistMeta'

export type ContentMode = 'creamy' | 'clean'

function readOverrides(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}')
  } catch {
    return {}
  }
}

function readMode(): ContentMode {
  return localStorage.getItem(MODE_KEY) === 'clean' ? 'clean' : 'creamy'
}

function useStored<T>(read: () => T): T {
  const [value, setValue] = useState(read)
  useEffect(() => {
    const sync = () => setValue(read())
    window.addEventListener(CHANGE_EVENT, sync)
    return () => window.removeEventListener(CHANGE_EVENT, sync)
  }, [read])
  return value
}

const notify = () => {
  window.dispatchEvent(new Event(CHANGE_EVENT))
  schedulePrefsPush()
}

export function useContentMode() {
  const mode = useStored(readMode)
  const setMode = useCallback((m: ContentMode) => {
    localStorage.setItem(MODE_KEY, m)
    notify()
  }, [])
  return [mode, setMode] as const
}

export function setAdultOverrides(itemIds: string[], value: boolean) {
  if (!itemIds.length) return
  const next = readOverrides()
  itemIds.forEach((id) => (next[id] = value))
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next))
  notify()
}

export function useAdultOverride(itemId: string) {
  const overrides = useStored(readOverrides)
  const setOverride = useCallback(
    (value: boolean | null) => {
      const next = readOverrides()
      if (value === null) delete next[itemId]
      else next[itemId] = value
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next))
      notify()
    },
    [itemId]
  )
  return [overrides[itemId] as boolean | undefined, setOverride] as const
}

/** Returns a lookup from item to its AniList 18+ flag and tags. */
export function useItemMeta(items: MediaItem[]) {
  const ids = useMemo(
    () => [...new Set(items.map(anilistId).filter((id): id is number => id !== null))].sort((a, b) => a - b),
    [items]
  )
  const meta = useAniListMeta(ids)
  return useCallback(
    (item: MediaItem): MediaMeta | undefined => {
      const id = anilistId(item)
      return id !== null ? meta[String(id)] : undefined
    },
    [meta]
  )
}

/** Returns a function telling whether an item is 18+ (AniList data, overridden by the user's manual flag). */
export function useIsAdult(items: MediaItem[]) {
  const metaOf = useItemMeta(items)
  const overrides = useStored(readOverrides)
  return useCallback((item: MediaItem) => overrides[item.id] ?? !!metaOf(item)?.a, [metaOf, overrides])
}
