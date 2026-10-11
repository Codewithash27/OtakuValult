import { MediaItem, MediaType, anilistId } from '../types/media'
import { PanelKind } from '../types/panel'
import { metaFromMedia } from './anilistMeta'
import { apiFetch, getApiBase } from './api'
import { foundMediaFromPornhwadb, getPornhwadbSeries } from './pornhwadb'
import { SAME_SEX_TAGS, anilist } from './importers'

/** An AniList title the finder can pull images for. */
export interface FoundMedia {
  id: number
  type: 'ANIME' | 'MANGA'
  mediaType: MediaType
  title: string
  /** English, romaji and native titles, used to find the MangaDex entry. */
  titles: string[]
  cover: string | null
  coverXl: string | null
  banner: string | null
  year: number | null
  format: string | null
  total: number | null
  adult: boolean
  sameSex: boolean
  tags: string[]
  /** Shelf row when this search isn't tied to an AniList id (manual / import-only titles). */
  shelfItemId?: string
  /** PornhwaDB export slug when opened from local catalogue search. */
  pornhwadbSlug?: string
  /** Synopsis from PornhwaDB (not stored on shelf notes by default). */
  description?: string | null
}

export interface FoundArtist {
  id: number
  name: string
  native: string | null
  image: string | null
  roles: string[]
  works: FoundMedia[]
}

export type ImageGroup =
  | 'Cover & banner'
  | 'Characters'
  | 'Volume covers'
  | 'Kitsu art'
  | 'Wallpapers'
  | 'Gelbooru'
  | 'Gelbooru tags'
  | 'Web images'
  | 'PornhwaDB'

export interface FoundImage {
  /** Original image address; stored on the saved panel to spot duplicates. */
  sourceUrl: string
  thumb: string
  download: string
  group: ImageGroup
  label: string
  kind: PanelKind
  tags: string[]
  caption: string | null
  /** Banner-shaped (about 4:1), shown full width. */
  wide?: boolean
  /** Wallpaper-shaped (16:9). */
  landscape?: boolean
  /** This image itself is 18+, regardless of the title. */
  adult?: boolean
  /** Smaller copy to download when the original fails (e.g. too large for the proxy). */
  fallbackDownload?: string
}

interface RawMedia {
  id: number
  type: 'ANIME' | 'MANGA'
  format: string | null
  title: { romaji: string | null; english: string | null; native: string | null }
  coverImage: { large: string | null; extraLarge: string | null } | null
  bannerImage: string | null
  startDate: { year: number | null } | null
  episodes: number | null
  chapters: number | null
  countryOfOrigin: string | null
  isAdult: boolean | null
  genres: string[] | null
  tags: { name: string; rank: number | null }[] | null
}

const MEDIA_FIELDS = `id type format title { romaji english native } coverImage { large extraLarge } bannerImage startDate { year } episodes chapters countryOfOrigin isAdult genres tags { name rank }`

function toFound(m: RawMedia): FoundMedia {
  const isAnime = m.type === 'ANIME'
  const meta = metaFromMedia(m)
  return {
    id: m.id,
    type: m.type,
    mediaType: isAnime ? 'anime' : m.countryOfOrigin === 'KR' ? 'manhwa' : 'manga',
    title: m.title.english || m.title.romaji || m.title.native || 'Untitled',
    titles: [...new Set([m.title.english, m.title.romaji, m.title.native].filter((t): t is string => !!t))],
    cover: m.coverImage?.large ?? null,
    coverXl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
    banner: m.bannerImage,
    year: m.startDate?.year ?? null,
    format: m.format,
    total: (isAnime ? m.episodes : m.chapters) || null,
    adult: meta.a,
    sameSex: (m.tags ?? []).some((t) => SAME_SEX_TAGS.includes(t.name)),
    tags: meta.t ?? [],
  }
}

/** Clean mode asks AniList for non-18+ only; creamy mode leaves the filter off (null would mean "not 18+"). */
const adultArg = (allowAdult: boolean) => (allowAdult ? '' : ', isAdult: false')

export async function searchTitles(query: string, allowAdult: boolean): Promise<FoundMedia[]> {
  const data = await anilist<{ Page: { media: RawMedia[] } }>(
    `query ($q: String) { Page(perPage: 15) { media(search: $q, sort: SEARCH_MATCH${adultArg(allowAdult)}) { ${MEDIA_FIELDS} } } }`,
    { q: query },
  )
  return data.Page.media.map(toFound).filter((m) => allowAdult || !m.adult)
}

export async function getMedia(id: number): Promise<FoundMedia | null> {
  const data = await anilist<{ Media: RawMedia | null }>(`query ($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} } }`, { id })
  return data.Media ? toFound(data.Media) : null
}

/** Open image search for a title on your shelf (with or without AniList). */
export async function foundMediaFromShelfItem(item: MediaItem, isAdult: boolean): Promise<FoundMedia> {
  const id = anilistId(item)
  if (id !== null) {
    const m = await getMedia(id)
    if (m) return { ...m, shelfItemId: item.id }
  }
  if (item.source === 'pornhwadb' && item.external_id) {
    try {
      const row = await getPornhwadbSeries(item.external_id)
      return foundMediaFromPornhwadb(row, item.id)
    } catch {
      /* fall through to shelf-only stub */
    }
  }
  return {
    id: 0,
    shelfItemId: item.id,
    type: item.media_type === 'anime' ? 'ANIME' : 'MANGA',
    mediaType: item.media_type,
    title: item.title,
    titles: [item.title],
    cover: item.poster_url,
    coverXl: item.poster_url,
    banner: null,
    year: item.year,
    format: null,
    total: item.total,
    adult: isAdult,
    sameSex: false,
    tags: [],
  }
}

export type ImageSearchPresetId = 'title' | 'explicit' | 'panels' | 'cover' | `theme:${string}`

const MEDIA_WORD: Record<MediaType, string> = {
  manhwa: 'manhwa',
  manga: 'manga',
  anime: 'anime',
  movie: '',
  tv: '',
}

/** Preset chips shown under a selected title (AniList themes + common 18+ searches). */
export function imageSearchPresets(media: FoundMedia): { id: ImageSearchPresetId; label: string }[] {
  const base: { id: ImageSearchPresetId; label: string }[] = [
    { id: 'title', label: 'This title' },
    { id: 'explicit', label: 'Explicit / NSFW' },
    { id: 'panels', label: 'Panels / chapters' },
    { id: 'cover', label: 'Cover art' },
  ]
  const themes = (media.tags ?? []).slice(0, 10).map((t) => ({
    id: `theme:${t}` as ImageSearchPresetId,
    label: t,
  }))
  return [...base, ...themes]
}

export function themeTagFromPreset(preset: ImageSearchPresetId): string | null {
  if (!preset.startsWith('theme:')) return null
  return preset.slice(6).replace(/\s+/g, '_').toLowerCase()
}

export function buildWebSearchQuery(media: FoundMedia, preset: ImageSearchPresetId): string {
  const kind = MEDIA_WORD[media.mediaType]
  const name = media.title.trim()
  const adultManhwa = media.adult && media.mediaType === 'manhwa'

  switch (preset) {
    case 'explicit':
      return adultManhwa ? `${name} adult manhwa` : `${name} ${kind} explicit nsfw`.trim()
    case 'panels':
      return `${name} ${kind} chapter panel read`.trim()
    case 'cover':
      return `${name} ${kind} cover`.trim()
    case 'title':
      return adultManhwa ? `${name} adult manhwa` : `${name} ${kind}`.trim()
    default: {
      const theme = preset.slice(6)
      return `${name} ${theme} ${kind}`.trim()
    }
  }
}

/** @deprecated use buildWebSearchQuery */
export function webSearchQueryForMedia(media: FoundMedia): string {
  return buildWebSearchQuery(media, 'title')
}

function titleTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
}

const STOP = new Set(['manhwa', 'manga', 'anime', 'chapter', 'volume', 'official', 'read', 'online', 'adult', 'nsfw'])

function webImageHaystack(img: FoundImage): string {
  let fromUrl = ''
  const cap = img.caption ?? ''
  try {
    const u = new URL(cap)
    fromUrl = ` ${u.hostname} ${u.pathname.replace(/\//g, ' ')}`
  } catch {
    fromUrl = cap ? ` ${cap}` : ''
  }
  return `${img.label}${fromUrl} ${img.sourceUrl}`.toLowerCase()
}

function conflictingSeriesInHay(hay: string, titleTokens: string[]): boolean {
  const slug = titleTokens.join(' ')
  const rules: { need: string[]; reject: RegExp }[] = [
    {
      need: ['wife', 'exchange'],
      reject: /\b(change[\s_-]*wife|wife[\s_-]*(after|aft\b)|story identification|manhwa like)\b/i,
    },
    {
      need: ['change', 'wife'],
      reject: /\bwife[\s_-]*exchange\b/i,
    },
  ]
  for (const { need, reject } of rules) {
    if (need.every((w) => slug.includes(w)) && reject.test(hay)) return true
  }
  return /\b(story identification|similar to|recommendations?\s+like)\b/i.test(hay)
}

function requiredTitleTokens(tokenSets: string[][]): string[] {
  let best: string[] = []
  for (const tokens of tokenSets) {
    const req = tokens.filter((t) => t.length >= 3 && !STOP.has(t))
    if (req.length > best.length) best = req
  }
  return best
}

/** Drop wrong series; strict mode requires every important word from the title (e.g. wife + exchange). */
export function filterWebImagesForMedia(images: FoundImage[], media: FoundMedia, strict: boolean): FoundImage[] {
  const tokenSets = [...new Set([media.title, ...media.titles])]
    .map(titleTokens)
    .map((t) => t.filter((w) => !STOP.has(w)))
    .filter((t) => t.length > 0)
  if (!tokenSets.length) return images

  const required = requiredTitleTokens(tokenSets)
  const blocklist = /\b(best|top \d|reddit|pinterest|recommend|similar to|manhwa like|other manhwa)\b/i

  const scored = images.map((img) => {
    const hay = webImageHaystack(img)
    if (blocklist.test(hay)) return { img, ok: false, score: 0 }
    if (conflictingSeriesInHay(hay, required)) return { img, ok: false, score: 0 }

    let best = 0
    const requiredHits = required.filter((t) => hay.includes(t))
    const allRequiredHit = required.length === 0 || requiredHits.length === required.length
    for (const tokens of tokenSets) {
      const req = tokens.filter((t) => t.length >= 3 && !STOP.has(t))
      const hits = req.filter((t) => hay.includes(t))
      const score = hits.length * 12 + hits.reduce((n, t) => n + Math.max(0, t.length - 3), 0)
      best = Math.max(best, score)
    }

    const phrase = media.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (phrase.length > 6 && hay.includes(phrase)) best += 25

    const ok = strict
      ? allRequiredHit && best >= 8
      : best >= 8 || (best >= 4 && tokensMatchLoose(hay, tokenSets))
    return { img, ok, score: best }
  })

  const kept = scored.filter((s) => s.ok && s.score > 0)
  kept.sort((a, b) => b.score - a.score)
  if (kept.length >= 1) return kept.map((s) => s.img)
  if (strict) return []
  const soft = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
  return soft.length ? soft.map((s) => s.img) : images
}

function tokensMatchLoose(hay: string, tokenSets: string[][]): boolean {
  return tokenSets.some((tokens) => {
    const strong = tokens.filter((t) => t.length >= 5)
    if (strong.some((t) => hay.includes(t))) return true
    const hits = tokens.filter((t) => t.length >= 4 && hay.includes(t))
    return hits.length >= 2
  })
}

interface RawStaff {
  id: number
  name: { full: string; native: string | null }
  image: { medium: string | null } | null
  primaryOccupations: string[] | null
  staffMedia: { nodes: RawMedia[] }
}

const STAFF_QUERY = `query ($q: String) { Page(perPage: 8) { staff(search: $q, sort: SEARCH_MATCH) {
  id name { full native } image { medium } primaryOccupations
  staffMedia(perPage: 50, sort: POPULARITY_DESC) { nodes { ${MEDIA_FIELDS} } }
} } }`

export async function searchArtists(query: string, allowAdult: boolean): Promise<FoundArtist[]> {
  const run = (q: string) => anilist<{ Page: { staff: RawStaff[] } }>(STAFF_QUERY, { q }).then((d) => d.Page.staff)
  let staff = await run(query)
  // Korean names are often written family-name first; AniList stores them given-name first.
  const words = query.trim().split(/\s+/)
  if (!staff.length && words.length > 1) staff = await run([...words.slice(1), words[0]].join(' '))
  return staff.map((s) => {
    const seen = new Set<number>()
    const works = s.staffMedia.nodes
      .filter((m) => !seen.has(m.id) && seen.add(m.id))
      .map(toFound)
      .filter((m) => allowAdult || !m.adult)
    return {
      id: s.id,
      name: s.name.full,
      native: s.name.native,
      image: s.image?.medium ?? null,
      roles: s.primaryOccupations ?? [],
      works,
    }
  })
}

const isPlaceholder = (url: string | null | undefined): url is null | undefined => !url || /\/default\.(jpg|png)$/.test(url)

export async function aniListImages(media: FoundMedia): Promise<FoundImage[]> {
  const images: FoundImage[] = []
  if (media.coverXl) {
    images.push({
      sourceUrl: media.coverXl,
      thumb: media.cover ?? media.coverXl,
      download: media.coverXl,
      group: 'Cover & banner',
      label: 'Cover',
      kind: 'art',
      tags: ['cover'],
      caption: null,
    })
  }
  if (media.banner) {
    images.push({
      sourceUrl: media.banner,
      thumb: media.banner,
      download: media.banner,
      group: 'Cover & banner',
      label: 'Banner',
      kind: 'art',
      tags: ['banner', 'wallpaper'],
      caption: null,
      wide: true,
    })
  }

  const data = await anilist<{
    Media: { characters: { edges: { role: string; node: { id: number; name: { full: string }; image: { large: string | null } | null } }[] } }
  }>(
    `query ($id: Int) { Media(id: $id) { characters(perPage: 50, sort: [ROLE, RELEVANCE, ID]) { edges { role node { id name { full } image { large } } } } } }`,
    { id: media.id },
  )
  for (const edge of data.Media.characters.edges) {
    const url = edge.node.image?.large
    if (isPlaceholder(url)) continue
    images.push({
      sourceUrl: url,
      thumb: url,
      download: url,
      group: 'Characters',
      label: edge.node.name.full,
      kind: 'art',
      tags: ['character'],
      caption: edge.node.name.full,
    })
  }
  return images
}

interface MangaDexCovers {
  manga_id: string | null
  content_rating: string | null
  covers: { id: string; volume: string | null; locale: string | null; full_url: string; thumb_url: string }[]
}

const proxied = (url: string) => `${getApiBase()}/api/images/proxy?url=${encodeURIComponent(url)}`

/** Volume covers from MangaDex, through the backend because MangaDex images can't be downloaded from the browser. */
export async function mangaDexImages(media: FoundMedia): Promise<FoundImage[]> {
  if (media.type !== 'MANGA') return []
  const params = new URLSearchParams({ anilist_id: String(media.id) })
  media.titles.slice(0, 3).forEach((t) => params.append('title', t))
  const data = await apiFetch<MangaDexCovers>(`/api/images/mangadex?${params}`)
  return data.covers.map((c) => {
    const label = c.volume ? `Volume ${c.volume}` : 'Cover'
    return {
      sourceUrl: c.full_url,
      thumb: proxied(c.thumb_url),
      download: proxied(c.full_url),
      group: 'Volume covers' as const,
      label: c.locale && c.locale !== 'en' ? `${label} · ${c.locale.toUpperCase()}` : label,
      kind: 'art' as const,
      tags: ['cover', 'volume cover'],
      caption: `${label} cover`,
    }
  })
}

interface KitsuResponse {
  kitsu_id: string | null
  age_rating: string | null
  images: { kind: 'poster' | 'cover'; full_url: string; thumb_url: string }[]
}

/** Kitsu's poster and wide cover; Kitsu images have no CORS, so downloads go through the backend. */
export async function kitsuImages(media: FoundMedia): Promise<FoundImage[]> {
  const kind = media.type === 'ANIME' ? 'anime' : 'manga'
  const data = await apiFetch<KitsuResponse>(`/api/images/kitsu?anilist_id=${media.id}&kind=${kind}`)
  return data.images.map((img) => ({
    sourceUrl: img.full_url,
    thumb: img.thumb_url,
    download: proxied(img.full_url),
    group: 'Kitsu art' as const,
    label: img.kind === 'poster' ? 'Kitsu poster' : 'Kitsu cover',
    kind: 'art' as const,
    tags: img.kind === 'poster' ? ['cover'] : ['banner', 'wallpaper'],
    caption: null,
    wide: img.kind === 'cover',
  }))
}

interface WallhavenResponse {
  query: string | null
  page: number
  last_page: number
  total: number
  wallpapers: {
    id: string
    purity: 'sfw' | 'sketchy'
    resolution: string | null
    full_url: string
    thumb_url: string
    page_url: string | null
    source: string | null
  }[]
}

export interface WallpaperPage {
  images: FoundImage[]
  page: number
  lastPage: number
  total: number
}

function isLandscape(resolution: string | null) {
  const [w, h] = (resolution ?? '').split('x').map(Number)
  return !(w && h) || w >= h
}

/** Anime wallpapers from Wallhaven: SFW only in clean mode, SFW + "sketchy" otherwise. Never NSFW. */
export async function wallhavenImages(media: FoundMedia, sfwOnly: boolean, page: number): Promise<WallpaperPage> {
  const params = new URLSearchParams({ sfw_only: String(sfwOnly), page: String(page) })
  media.titles.slice(0, 3).forEach((t) => params.append('title', t))
  const data = await apiFetch<WallhavenResponse>(`/api/images/wallhaven?${params}`)
  return {
    page: data.page,
    lastPage: data.last_page,
    total: data.total,
    images: data.wallpapers.map((w) => ({
      sourceUrl: w.full_url,
      thumb: w.thumb_url,
      download: w.full_url,
      group: 'Wallpapers' as const,
      label: w.resolution ? `Wallpaper ${w.resolution}` : 'Wallpaper',
      kind: 'art' as const,
      tags: w.purity === 'sketchy' ? ['wallpaper', 'sketchy'] : ['wallpaper'],
      caption: w.source ? `Wallpaper · source: ${w.source}` : w.page_url ? `Wallpaper · ${w.page_url}` : 'Wallpaper',
      landscape: isLandscape(w.resolution),
    })),
  }
}

export interface GelbooruCredentials {
  userId: string
  apiKey: string
}

export type GelbooruRating = 'general' | 'sensitive' | 'questionable' | 'explicit'

const GELBOORU_KEY = 'gelbooru-credentials'
export const GELBOORU_CHANGED_EVENT = 'gelbooru-credentials-changed'

/** Kept on this device only; the key is sent to the backend per request and never stored there. */
export function readGelbooruCredentials(): GelbooruCredentials | null {
  try {
    const value = JSON.parse(localStorage.getItem(GELBOORU_KEY) || 'null')
    return value?.userId && value?.apiKey ? value : null
  } catch {
    return null
  }
}

export function saveGelbooruCredentials(creds: GelbooruCredentials | null) {
  if (creds) localStorage.setItem(GELBOORU_KEY, JSON.stringify(creds))
  else localStorage.removeItem(GELBOORU_KEY)
  window.dispatchEvent(new Event(GELBOORU_CHANGED_EVENT))
}

/** Accepts the "&api_key=…&user_id=…" line from Gelbooru's options page, or the two values separately. */
export function parseGelbooruCredentials(text: string, userId = ''): GelbooruCredentials | null {
  const key = /api_key=([0-9a-f]+)/i.exec(text)?.[1] ?? (/^[0-9a-f]{20,}$/i.test(text.trim()) ? text.trim() : null)
  const user = /user_id=(\d+)/.exec(text)?.[1] ?? (/^\d+$/.test(userId.trim()) ? userId.trim() : null)
  return key && user ? { userId: user, apiKey: key } : null
}

interface GelbooruResponse {
  tag: string | null
  total: number
  page: number
  posts: {
    id: number
    rating: GelbooruRating
    width: number | null
    height: number | null
    file_url: string
    sample_url: string | null
    thumb_url: string
    source: string | null
  }[]
}

export const GELBOORU_PAGE_SIZE = 40

export class GelbooruAuthError extends Error {}

/** Posts for a title's Gelbooru series tag; previews and downloads go through the backend. */
function mapGelbooruPosts(data: GelbooruResponse, group: 'Gelbooru' | 'Gelbooru tags'): WallpaperPage & { tag: string | null } {
  return {
    tag: data.tag,
    page: data.page,
    lastPage: Math.ceil(data.total / GELBOORU_PAGE_SIZE),
    total: data.total,
    images: data.posts.map((p) => {
      const adult = p.rating === 'questionable' || p.rating === 'explicit'
      return {
        sourceUrl: p.file_url,
        thumb: proxied(p.thumb_url),
        download: proxied(p.file_url),
        group,
        label: `#${p.id} · ${p.rating}`,
        kind: 'panel' as const,
        tags: ['panel', 'gelbooru', p.rating],
        caption: p.source || `https://gelbooru.com/index.php?page=post&s=view&id=${p.id}`,
        landscape: !!(p.width && p.height && p.width > p.height),
        adult,
        fallbackDownload: p.sample_url ? proxied(p.sample_url) : undefined,
      }
    }),
  }
}

export async function gelbooruImages(
  media: FoundMedia,
  creds: GelbooruCredentials,
  rating: GelbooruRating | null,
  page: number,
): Promise<WallpaperPage & { tag: string | null }> {
  const params = new URLSearchParams({ page: String(page) })
  if (rating) params.set('rating', rating)
  media.titles.slice(0, 3).forEach((t) => params.append('title', t))
  const res = await fetch(`${getApiBase()}/api/images/gelbooru?${params}`, {
    headers: { 'X-Gelbooru-User': creds.userId, 'X-Gelbooru-Key': creds.apiKey },
  })
  if (res.status === 401) throw new GelbooruAuthError('Gelbooru rejected your user ID or API key')
  if (!res.ok) throw new Error(`Gelbooru search failed (${res.status})`)
  const data = (await res.json()) as GelbooruResponse
  return mapGelbooruPosts(data, 'Gelbooru')
}

/** Tag search (change_wife manhwa …) — better for adult manhwa without a Gelbooru series tag. */
export async function gelbooruTagImages(
  media: FoundMedia,
  creds: GelbooruCredentials,
  rating: GelbooruRating | null,
  page: number,
  extraTag?: string | null,
): Promise<WallpaperPage & { tag: string | null }> {
  const params = new URLSearchParams({ page: String(page), media_type: media.mediaType })
  if (rating) params.set('rating', rating)
  if (extraTag) params.set('extra_tag', extraTag)
  media.titles.slice(0, 3).forEach((t) => params.append('title', t))
  const res = await fetch(`${getApiBase()}/api/images/gelbooru/tags?${params}`, {
    headers: { 'X-Gelbooru-User': creds.userId, 'X-Gelbooru-Key': creds.apiKey },
  })
  if (res.status === 401) throw new GelbooruAuthError('Gelbooru rejected your user ID or API key')
  if (!res.ok) throw new Error(`Gelbooru tag search failed (${res.status})`)
  const data = (await res.json()) as GelbooruResponse
  return mapGelbooruPosts(data, 'Gelbooru tags')
}

export type WebSearchProviders = {
  free: boolean
  ddgs: boolean
  searxng: boolean
  active?: string
}

export async function webSearchProviders(): Promise<WebSearchProviders | null> {
  try {
    const data = await apiFetch<{ providers?: WebSearchProviders }>('/api/images/web-search/config')
    return data.providers ?? null
  } catch {
    return null
  }
}

export async function webSearchConfigured(): Promise<boolean> {
  try {
    const data = await apiFetch<{ configured: boolean }>('/api/images/web-search/config')
    return !!data.configured
  } catch {
    return false
  }
}

export async function webSearchImages(
  query: string,
  safe: boolean,
  start: number,
): Promise<WallpaperPage & { query: string; provider?: string }> {
  const params = new URLSearchParams({ q: query, safe: String(safe), start: String(start) })
  const data = await apiFetch<{
    configured: boolean
    provider?: string
    query: string
    page: number
    total: number
    last_page?: number
    items: { id: string; title: string; page_url: string | null; file_url: string; thumb_url: string; width: number | null; height: number | null }[]
  }>(`/api/images/web-search?${params}`)
  if (!data.configured) {
    return { query, page: 1, lastPage: 1, total: 0, images: [] }
  }
  const lastPage = data.last_page ?? Math.max(1, Math.ceil(data.total / 10))
  return {
    query: data.query,
    provider: data.provider,
    page: data.page,
    lastPage,
    total: data.total,
    images: data.items.map((item) => ({
      sourceUrl: item.file_url,
      thumb: item.thumb_url,
      download: proxied(item.file_url),
      group: 'Web images' as const,
      label: item.title.slice(0, 80) || 'Web image',
      kind: 'panel' as const,
      tags: ['panel', 'web'],
      caption: item.page_url,
      landscape: !!(item.width && item.height && item.width > item.height),
      adult: !safe,
      fallbackDownload: proxied(item.thumb_url),
    })),
  }
}

async function fetchImage(url: string) {
  // The preview <img> caches a copy without CORS headers; reusing it makes fetch fail.
  try {
    return await fetch(url, { cache: 'no-store' })
  } catch (err) {
    if (url.startsWith(getApiBase())) throw err
    return fetch(proxied(url))
  }
}

export async function downloadImage(image: FoundImage, baseName: string): Promise<File> {
  let res = await fetchImage(image.download)
  if (!res.ok && image.fallbackDownload) res = await fetchImage(image.fallbackDownload)
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error('not an image')
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  const slug = `${baseName}-${image.label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return new File([blob], `${slug || 'image'}.${ext}`, { type: blob.type })
}
