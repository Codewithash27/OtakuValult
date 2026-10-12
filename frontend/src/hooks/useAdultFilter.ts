import { useCallback, useEffect, useMemo, useState } from 'react'
import { MediaItem, anilistId } from '../types/media'
import { MODE_KEY, OVERRIDES_KEY, PREFS_CHANGED_EVENT as CHANGE_EVENT, schedulePrefsPush } from '../lib/prefsSync'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { MediaMeta, useAniListMeta } from '../lib/anilistMeta'
import { fetchCatalogueTags } from '../lib/pornhwadb'
import { isBackendConfigured } from '../lib/api'

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

/** Fired with the target mode when a switch starts; the curtain overlay listens for it. */
export const MODE_CURTAIN_EVENT = 'vault:mode-curtain'
/** Delay before the mode is applied, so the change happens behind the closed curtain. */
export const CURTAIN_CLOSE_MS = 560

let pendingSwitch: number | undefined

export function applyContentMode(m: ContentMode) {
  window.clearTimeout(pendingSwitch)
  localStorage.setItem(MODE_KEY, m)
  notify()
}

export function useContentMode() {
  const mode = useStored(readMode)
  const setMode = useCallback((m: ContentMode, opts?: { instant?: boolean }) => {
    if (m === readMode()) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (opts?.instant || reduced) return applyContentMode(m)
    window.dispatchEvent(new CustomEvent<ContentMode>(MODE_CURTAIN_EVENT, { detail: m }))
    window.clearTimeout(pendingSwitch)
    pendingSwitch = window.setTimeout(() => applyContentMode(m), CURTAIN_CLOSE_MS)
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
  const catalogue = useCatalogueTags(items)
  return useCallback(
    (item: MediaItem): MediaMeta | undefined => {
      const id = anilistId(item)
      if (id !== null) return meta[String(id)]
      const tags = catalogueTagsFor(item, catalogue)
      return tags ? { a: true, t: tags } : undefined
    },
    [meta, catalogue]
  )
}

type CatalogueTags = { bySlug: Record<string, string[]>; byTitle: Record<string, string[]> }

function catalogueTagsFor(item: MediaItem, cat: CatalogueTags | undefined): string[] | undefined {
  if (!cat) return undefined
  if (item.source === 'pornhwadb' && item.external_id) {
    const tags = cat.bySlug[item.external_id.toLowerCase()]
    if (tags) return tags
  }
  return item.media_type === 'manhwa' ? cat.byTitle[titleKey(item.title)] : undefined
}

const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Catalogue (PornhwaDB) tags for shelf manhwa that have no AniList id, by slug or title. */
function useCatalogueTags(items: MediaItem[]) {
  const { slugs, titles } = useMemo(() => {
    const s = new Set<string>()
    const t = new Set<string>()
    for (const i of items) {
      if (anilistId(i) !== null || i.media_type !== 'manhwa') continue
      if (i.source === 'pornhwadb' && i.external_id) s.add(i.external_id.toLowerCase())
      t.add(titleKey(i.title))
    }
    return { slugs: [...s].sort(), titles: [...t].sort() }
  }, [items])
  const { data } = useQuery({
    queryKey: ['catalogue-tags', slugs, titles],
    queryFn: () => fetchCatalogueTags(slugs, titles),
    enabled: isBackendConfigured() && (slugs.length > 0 || titles.length > 0),
    staleTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
  return data
}

/** Returns a function telling whether an item is 18+ (AniList data, overridden by the user's manual flag). */
export function useIsAdult(items: MediaItem[]) {
  const metaOf = useItemMeta(items)
  const overrides = useStored(readOverrides)
  return useCallback((item: MediaItem) => overrides[item.id] ?? !!metaOf(item)?.a, [metaOf, overrides])
}
