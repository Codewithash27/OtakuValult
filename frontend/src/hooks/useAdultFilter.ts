import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MediaItem, anilistId } from '../types/media'
import { MODE_KEY, OVERRIDES_KEY, PREFS_CHANGED_EVENT as CHANGE_EVENT, schedulePrefsPush } from '../lib/prefsSync'

export type ContentMode = 'creamy' | 'clean'

const ADULT_GENRES = ['Hentai', 'Ecchi']

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

async function fetchAniListAdult(ids: number[]): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { ids: ids.slice(i, i + 50) } }),
    })
    if (!res.ok) throw new Error(`AniList ${res.status}`)
    const json = await res.json()
    for (const m of json?.data?.Page?.media ?? []) {
      result[String(m.id)] = !!m.isAdult || (m.genres ?? []).some((g: string) => ADULT_GENRES.includes(g))
    }
  }
  return result
}

/** Returns a function telling whether an item is 18+ (AniList data, overridden by the user's manual flag). */
export function useIsAdult(items: MediaItem[]) {
  const ids = useMemo(
    () =>
      [...new Set(items.map(anilistId).filter((id): id is number => id !== null))].sort((a, b) => a - b),
    [items]
  )

  const { data: flags = {} } = useQuery({
    queryKey: ['anilist-adult', ids.join(',')],
    queryFn: () => fetchAniListAdult(ids),
    enabled: ids.length > 0,
    staleTime: Infinity,
    retry: 1,
  })

  const overrides = useStored(readOverrides)

  return useCallback(
    (item: MediaItem) => {
      const id = anilistId(item)
      return overrides[item.id] ?? (id !== null ? !!flags[String(id)] : false)
    },
    [flags, overrides]
  )
}
