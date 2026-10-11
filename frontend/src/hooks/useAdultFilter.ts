import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MediaItem, anilistId } from '../types/media'
import { MODE_KEY, OVERRIDES_KEY, PREFS_CHANGED_EVENT as CHANGE_EVENT, schedulePrefsPush } from '../lib/prefsSync'

export type ContentMode = 'creamy' | 'clean'

export const ADULT_GENRES = ['Hentai', 'Ecchi']

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

const QUERY = `query($ids:[Int]){ Page(perPage:50){ media(id_in:$ids){ id isAdult genres } } }`

const CACHE_KEY = 'anilist-adult-cache'

function readCache(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

/** Stores known AniList adult flags so the library doesn't have to look them up again. */
export function cacheAdultFlags(flags: Record<string, boolean>) {
  if (!Object.keys(flags).length) return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), ...flags }))
  } catch {
    /* storage full; flags will be fetched again */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchAniListAdult(ids: number[]): Promise<Record<string, boolean>> {
  const cache = readCache()
  const missing = ids.filter((id) => !(String(id) in cache))
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50)
    let res: Response
    for (let attempt = 0; ; attempt++) {
      res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { ids: batch } }),
      })
      if (res.status !== 429 || attempt >= 3) break
      await sleep((Number(res.headers.get('Retry-After')) || 30) * 1000)
    }
    if (!res.ok) throw new Error(`AniList ${res.status}`)
    const json = await res.json()
    const found: Record<string, boolean> = {}
    for (const m of json?.data?.Page?.media ?? []) {
      found[String(m.id)] = !!m.isAdult || (m.genres ?? []).some((g: string) => ADULT_GENRES.includes(g))
    }
    Object.assign(cache, found)
    cacheAdultFlags(found)
    if (i + 50 < missing.length) await sleep(700)
  }
  return cache
}

/** Returns a function telling whether an item is 18+ (AniList data, overridden by the user's manual flag). */
export function useIsAdult(items: MediaItem[]) {
  const ids = useMemo(
    () =>
      [...new Set(items.map(anilistId).filter((id): id is number => id !== null))].sort((a, b) => a - b),
    [items]
  )

  const idsKey = ids.join(',')
  const cached = useMemo(() => readCache(), [idsKey])
  const { data } = useQuery({
    queryKey: ['anilist-adult', idsKey],
    queryFn: () => fetchAniListAdult(ids),
    enabled: ids.length > 0,
    staleTime: Infinity,
    retry: 2,
  })
  const flags = data ?? cached

  const overrides = useStored(readOverrides)

  return useCallback(
    (item: MediaItem) => {
      const id = anilistId(item)
      return overrides[item.id] ?? (id !== null ? !!flags[String(id)] : false)
    },
    [flags, overrides]
  )
}
