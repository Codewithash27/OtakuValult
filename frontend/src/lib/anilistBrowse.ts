import { anilist } from './importers'
import { cleanMediaDescription } from './mediaDescription'

export type AnimeFormat = 'TV' | 'MOVIE' | 'ONA' | 'OVA' | 'SPECIAL' | 'TV_SHORT' | 'MUSIC' | string

export interface BrowseAnime {
  id: number
  title: string
  description: string | null
  banner: string | null
  cover: string | null
  color: string | null
  format: string
  year: number | null
  status: string | null
  episodes: number | null
  score: number | null
  genres: string[]
  nextEpisode: number | null
  nextAiringAt: number | null
}

export interface AiringSlot {
  airingAt: number
  episode: number
  media: BrowseAnime
}

const MEDIA = `
  id
  title { romaji english }
  description(asHtml: false)
  bannerImage
  coverImage { extraLarge large color }
  format
  seasonYear
  startDate { year }
  status
  episodes
  averageScore
  genres
  isAdult
  nextAiringEpisode { episode airingAt }
`

function formatLabel(raw: string | null | undefined) {
  if (!raw) return 'TV'
  if (raw === 'TV_SHORT') return 'TV Short'
  if (raw === 'MOVIE') return 'Movie'
  return raw.replace(/_/g, ' ')
}

function mapMedia(m: Record<string, any> | null | undefined): BrowseAnime | null {
  if (!m || m.isAdult) return null
  const cover = m.coverImage?.extraLarge || m.coverImage?.large || null
  return {
    id: m.id,
    title: m.title?.english || m.title?.romaji || 'Untitled',
    description: cleanMediaDescription(m.description),
    banner: m.bannerImage || null,
    cover,
    color: m.coverImage?.color || null,
    format: formatLabel(m.format),
    year: m.seasonYear || m.startDate?.year || null,
    status: m.status || null,
    episodes: m.episodes ?? null,
    score: m.averageScore ?? null,
    genres: (m.genres ?? []).slice(0, 4),
    nextEpisode: m.nextAiringEpisode?.episode ?? null,
    nextAiringAt: m.nextAiringEpisode?.airingAt ?? null,
  }
}

const BROWSE_QUERY = `
query Browse($ids: [Int], $airFrom: Int, $airTo: Int) {
  trending: Page(page: 1, perPage: 16) {
    media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${MEDIA} }
  }
  popular: Page(page: 1, perPage: 12) {
    media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA} }
  }
  upcoming: Page(page: 1, perPage: 14) {
    media(type: ANIME, sort: POPULARITY_DESC, status: NOT_YET_RELEASED, isAdult: false) { ${MEDIA} }
  }
  fresh: Page(page: 1, perPage: 14) {
    media(type: ANIME, status: RELEASING, sort: START_DATE_DESC, isAdult: false) { ${MEDIA} }
  }
  shelf: Page(page: 1, perPage: 25) {
    media(id_in: $ids, type: ANIME) { ${MEDIA} }
  }
  airing: Page(page: 1, perPage: 50) {
    airingSchedules(airingAt_greater: $airFrom, airingAt_lesser: $airTo, sort: TIME) {
      airingAt
      episode
      media { ${MEDIA} }
    }
  }
}`

export interface AnimeBrowseData {
  trending: BrowseAnime[]
  popular: BrowseAnime[]
  upcoming: BrowseAnime[]
  fresh: BrowseAnime[]
  shelf: BrowseAnime[]
  airing: AiringSlot[]
}

function list(raw: any[] | undefined) {
  return (raw ?? []).map(mapMedia).filter((m): m is BrowseAnime => !!m)
}

export async function fetchAnimeBrowse(shelfIds: number[]): Promise<AnimeBrowseData> {
  const now = Math.floor(Date.now() / 1000)
  const data = await anilist<{
    trending: { media: any[] }
    popular: { media: any[] }
    upcoming: { media: any[] }
    fresh: { media: any[] }
    shelf: { media: any[] }
    airing: { airingSchedules: { airingAt: number; episode: number; media: any }[] }
  }>(BROWSE_QUERY, {
    ids: shelfIds.length ? shelfIds.slice(0, 25) : [1],
    airFrom: now - 3600,
    airTo: now + 7 * 24 * 3600,
  })

  const airing: AiringSlot[] = (data.airing?.airingSchedules ?? [])
    .map((s) => {
      const media = mapMedia(s.media)
      if (!media) return null
      return { airingAt: s.airingAt, episode: s.episode, media }
    })
    .filter((s): s is AiringSlot => !!s)

  return {
    trending: list(data.trending?.media),
    popular: list(data.popular?.media),
    upcoming: list(data.upcoming?.media),
    fresh: list(data.fresh?.media),
    shelf: shelfIds.length ? list(data.shelf?.media) : [],
    airing,
  }
}
