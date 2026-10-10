import { MediaType, Status } from '../types/media'

export interface ImportEntry {
  source: 'anilist' | 'jikan'
  external_id: string
  media_type: MediaType
  title: string
  poster_url: string | null
  year: number | null
  status: Status
  rating: number | null
  progress: number
  total: number | null
  notes: string | null
}

type ListKind = 'ANIME' | 'MANGA'

interface AniListMedia {
  id: number
  idMal: number | null
  type: ListKind
  title: { romaji: string | null; english: string | null }
  coverImage: { large: string | null } | null
  startDate: { year: number | null } | null
  episodes: number | null
  chapters: number | null
  countryOfOrigin: string | null
}

const ANILIST_URL = 'https://graphql.anilist.co'

const MEDIA_FIELDS = `id idMal type title { romaji english } coverImage { large } startDate { year } episodes chapters countryOfOrigin`

const LIST_QUERY = `
query ($user: String, $type: MediaType, $chunk: Int) {
  MediaListCollection(userName: $user, type: $type, chunk: $chunk, perChunk: 500) {
    hasNextChunk
    lists { entries { status score(format: POINT_10_DECIMAL) progress notes media { ${MEDIA_FIELDS} } } }
  }
}`

const BY_MAL_QUERY = `
query ($ids: [Int], $type: MediaType) {
  Page(perPage: 50) { media(idMal_in: $ids, type: $type) { ${MEDIA_FIELDS} } }
}`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function anilist<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 429 && attempt < 3) {
    await sleep((Number(res.headers.get('Retry-After')) || 30) * 1000)
    return anilist(query, variables, attempt + 1)
  }
  const json = await res.json().catch(() => null)
  const message = json?.errors?.[0]?.message
  if (!res.ok || message) {
    if (/not found/i.test(message || '')) throw new Error('AniList user not found. Check the spelling of the username.')
    if (/private/i.test(message || '')) throw new Error('This AniList list is private. Make it public in AniList settings and try again.')
    throw new Error(message || `AniList request failed (${res.status})`)
  }
  return json.data as T
}

const toRating = (score: number | null | undefined) =>
  score && score > 0 ? Math.min(10, Math.max(1, Math.round(score))) : null

function fromMedia(media: AniListMedia): Pick<ImportEntry, 'source' | 'external_id' | 'media_type' | 'title' | 'poster_url' | 'year' | 'total'> {
  const isAnime = media.type === 'ANIME'
  return {
    source: 'anilist',
    external_id: `${isAnime ? 'anime' : 'manga'}:${media.id}`,
    media_type: isAnime ? 'anime' : media.countryOfOrigin === 'KR' ? 'manhwa' : 'manga',
    title: media.title.english || media.title.romaji || 'Untitled',
    poster_url: media.coverImage?.large || null,
    year: media.startDate?.year || null,
    total: (isAnime ? media.episodes : media.chapters) || null,
  }
}

const ANILIST_STATUS: Record<string, Status> = {
  CURRENT: 'watching',
  REPEATING: 'watching',
  PLANNING: 'plan_to_watch',
  COMPLETED: 'completed',
  PAUSED: 'on_hold',
  DROPPED: 'dropped',
}

export async function fetchAniListUser(username: string, kinds: ListKind[]): Promise<ImportEntry[]> {
  const seen = new Map<string, ImportEntry>()
  for (const type of kinds) {
    for (let chunk = 1; ; chunk++) {
      const data = await anilist<{
        MediaListCollection: {
          hasNextChunk: boolean
          lists: { entries: { status: string; score: number; progress: number | null; notes: string | null; media: AniListMedia }[] }[]
        } | null
      }>(LIST_QUERY, { user: username.trim(), type, chunk })
      const collection = data.MediaListCollection
      for (const list of collection?.lists ?? []) {
        for (const e of list.entries) {
          const base = fromMedia(e.media)
          if (seen.has(base.external_id)) continue
          seen.set(base.external_id, {
            ...base,
            status: ANILIST_STATUS[e.status] || 'plan_to_watch',
            rating: toRating(e.score),
            progress: e.progress || 0,
            notes: e.notes?.trim() || null,
          })
        }
      }
      if (!collection?.hasNextChunk) break
    }
  }
  return [...seen.values()]
}

interface MalRow {
  kind: ListKind
  malId: number
  title: string
  status: Status
  rating: number | null
  progress: number
  total: number | null
  notes: string | null
}

const MAL_STATUS: Record<string, Status> = {
  watching: 'watching',
  reading: 'watching',
  completed: 'completed',
  'on-hold': 'on_hold',
  dropped: 'dropped',
  'plan to watch': 'plan_to_watch',
  'plan to read': 'plan_to_watch',
  '1': 'watching',
  '2': 'completed',
  '3': 'on_hold',
  '4': 'dropped',
  '6': 'plan_to_watch',
}

async function readText(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
  const gzipped = head[0] === 0x1f && head[1] === 0x8b
  if (!gzipped) return file.text()
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .gz files. Extract the .xml first and upload that.')
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function parseMal(xml: string): MalRow[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror') || !doc.querySelector('myanimelist')) {
    throw new Error("That file isn't a MyAnimeList export. Use the .xml or .xml.gz from MAL's Export page.")
  }
  const text = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || ''
  const num = (el: Element, tag: string) => Number(text(el, tag)) || 0

  const rows: MalRow[] = []
  for (const el of Array.from(doc.getElementsByTagName('anime'))) {
    const total = num(el, 'series_episodes')
    rows.push({
      kind: 'ANIME',
      malId: num(el, 'series_animedb_id'),
      title: text(el, 'series_title'),
      status: MAL_STATUS[text(el, 'my_status').toLowerCase()] || 'plan_to_watch',
      rating: toRating(num(el, 'my_score')),
      progress: num(el, 'my_watched_episodes'),
      total: total || null,
      notes: text(el, 'my_comments') || null,
    })
  }
  for (const el of Array.from(doc.getElementsByTagName('manga'))) {
    const total = num(el, 'manga_chapters')
    rows.push({
      kind: 'MANGA',
      malId: num(el, 'manga_mangadb_id'),
      title: text(el, 'manga_title'),
      status: MAL_STATUS[text(el, 'my_status').toLowerCase()] || 'plan_to_watch',
      rating: toRating(num(el, 'my_score')),
      progress: num(el, 'my_read_chapters'),
      total: total || null,
      notes: text(el, 'my_comments') || null,
    })
  }
  return rows.filter((r) => r.malId && r.title)
}

/** Parses MAL export files and matches each title to AniList for posters, years and types. */
export async function importMalFiles(files: File[], onProgress?: (done: number, total: number) => void): Promise<ImportEntry[]> {
  const rows: MalRow[] = []
  for (const file of files) rows.push(...parseMal(await readText(file)))
  if (!rows.length) throw new Error('No titles found in that file.')

  const matched = new Map<string, AniListMedia>()
  const batches: { kind: ListKind; ids: number[] }[] = []
  for (const kind of ['ANIME', 'MANGA'] as const) {
    const ids = [...new Set(rows.filter((r) => r.kind === kind).map((r) => r.malId))]
    for (let i = 0; i < ids.length; i += 50) batches.push({ kind, ids: ids.slice(i, i + 50) })
  }

  for (let b = 0; b < batches.length; b++) {
    onProgress?.(b, batches.length)
    const data = await anilist<{ Page: { media: AniListMedia[] } }>(BY_MAL_QUERY, { ids: batches[b].ids, type: batches[b].kind })
    for (const m of data.Page.media) if (m.idMal) matched.set(`${batches[b].kind}:${m.idMal}`, m)
    if (b < batches.length - 1) await sleep(700)
  }
  onProgress?.(batches.length, batches.length)

  const seen = new Map<string, ImportEntry>()
  for (const r of rows) {
    const media = matched.get(`${r.kind}:${r.malId}`)
    const base = media
      ? fromMedia(media)
      : {
          source: 'jikan' as const,
          external_id: `${r.kind === 'ANIME' ? 'anime' : 'manga'}:${r.malId}`,
          media_type: (r.kind === 'ANIME' ? 'anime' : 'manga') as MediaType,
          title: r.title,
          poster_url: null,
          year: null,
          total: r.total,
        }
    const key = `${base.source}:${base.external_id}`
    if (seen.has(key)) continue
    seen.set(key, {
      ...base,
      total: base.total ?? r.total,
      status: r.status,
      rating: r.rating,
      progress: r.progress,
      notes: r.notes,
    })
  }
  return [...seen.values()]
}
