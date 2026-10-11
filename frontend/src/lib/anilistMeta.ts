import { useEffect, useSyncExternalStore } from 'react'

/** Per-title AniList data: `a` = 18+, `t` = tag names (missing until fetched). */
export interface MediaMeta {
  a: boolean
  t?: string[]
}

export const ADULT_GENRES = ['Hentai', 'Ecchi']
const MIN_TAG_RANK = 40
const STORE_KEY = 'anilist-meta-v1'
const LEGACY_KEY = 'anilist-adult-cache'
const QUERY = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { id isAdult genres tags { name rank } } } }`

interface RawMedia {
  id: number
  isAdult: boolean | null
  genres: string[] | null
  tags: { name: string; rank: number | null }[] | null
}

export function metaFromMedia(m: Omit<RawMedia, 'id'>): MediaMeta {
  return {
    a: !!m.isAdult || (m.genres ?? []).some((g) => ADULT_GENRES.includes(g)),
    t: (m.tags ?? []).filter((t) => (t.rank ?? 100) >= MIN_TAG_RANK).map((t) => t.name),
  }
}

function load(): Record<string, MediaMeta> {
  try {
    const meta: Record<string, MediaMeta> = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    if (!Object.keys(meta).length) {
      const legacy: Record<string, boolean> = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}')
      for (const [id, a] of Object.entries(legacy)) meta[id] = { a: !!a }
    }
    return meta
  } catch {
    return {}
  }
}

let store = load()
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

function commit(updates: Record<string, MediaMeta>) {
  if (!Object.keys(updates).length) return
  store = { ...store, ...updates }
  listeners.forEach((l) => l())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store))
    } catch {
      /* storage full; data is fetched again next session */
    }
  }, 1000)
}

export const primeMeta = commit

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pending = new Set<number>()
let running = false

async function fetchBatch(ids: number[]): Promise<Record<string, MediaMeta> | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { ids } }),
    }).catch(() => null)
    if (res?.status === 429) {
      await sleep((Number(res.headers.get('Retry-After')) || 30) * 1000)
      continue
    }
    if (!res?.ok) return null
    const json = await res.json()
    const out: Record<string, MediaMeta> = {}
    // Ids AniList no longer has are stored empty so they aren't requested forever.
    for (const id of ids) out[String(id)] = { a: false, t: [] }
    for (const m of (json?.data?.Page?.media ?? []) as RawMedia[]) out[String(m.id)] = metaFromMedia(m)
    return out
  }
  return null
}

async function run() {
  running = true
  try {
    while (pending.size) {
      const batch = [...pending].slice(0, 50)
      batch.forEach((id) => pending.delete(id))
      const result = await fetchBatch(batch)
      if (!result) break
      commit(result)
      if (pending.size) await sleep(700)
    }
  } finally {
    running = false
  }
}

function requestMeta(ids: number[]) {
  for (const id of ids) if (!store[String(id)]?.t) pending.add(id)
  if (!running && pending.size) void run()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** AniList 18+ flags and tags for the given ids, fetched in the background and kept on the device. */
export function useAniListMeta(ids: number[]): Record<string, MediaMeta> {
  const key = ids.join(',')
  useEffect(() => requestMeta(ids), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(subscribe, () => store)
}
