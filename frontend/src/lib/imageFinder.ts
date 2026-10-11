import { MediaType } from '../types/media'
import { PanelKind } from '../types/panel'
import { metaFromMedia } from './anilistMeta'
import { apiFetch, getApiBase } from './api'
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
}

export interface FoundArtist {
  id: number
  name: string
  native: string | null
  image: string | null
  roles: string[]
  works: FoundMedia[]
}

export type ImageGroup = 'Cover & banner' | 'Characters' | 'Volume covers' | 'Kitsu art' | 'Wallpapers' | 'Gelbooru'

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
        group: 'Gelbooru' as const,
        label: `#${p.id} · ${p.rating}`,
        kind: 'art' as const,
        tags: ['gelbooru', p.rating],
        caption: p.source || `https://gelbooru.com/index.php?page=post&s=view&id=${p.id}`,
        landscape: !!(p.width && p.height && p.width > p.height),
        adult,
        fallbackDownload: p.sample_url ? proxied(p.sample_url) : undefined,
      }
    }),
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
