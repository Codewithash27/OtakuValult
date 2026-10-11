import { useEffect, useState } from 'react'

export interface ShowcasePoster {
  id: number
  title: string
  cover: string
  color: string | null
}

const CACHE_KEY = 'showcase-posters-v1'
const TTL_MS = 12 * 60 * 60 * 1000
// The login wall is public, so it only ever shows safe-for-work titles.
const SAFE = 'isAdult: false, genre_not_in: ["Hentai", "Ecchi"]'
const FIELDS = 'id title { english romaji } coverImage { large color }'
const QUERY = `query {
  trending: Page(perPage: 40) { media(type: ANIME, sort: TRENDING_DESC, ${SAFE}) { ${FIELDS} } }
  popular: Page(perPage: 30) { media(type: ANIME, sort: POPULARITY_DESC, ${SAFE}) { ${FIELDS} } }
  manhwa: Page(perPage: 24) { media(type: MANGA, countryOfOrigin: "KR", sort: TRENDING_DESC, ${SAFE}) { ${FIELDS} } }
}`

interface RawMedia {
  id: number
  title: { english: string | null; romaji: string | null }
  coverImage: { large: string | null; color: string | null }
}

interface Cached {
  at: number
  posters: ShowcasePoster[]
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Cached) : null
  } catch {
    return null
  }
}

function toPoster(m: RawMedia): ShowcasePoster | null {
  if (!m.coverImage.large) return null
  return {
    id: m.id,
    title: m.title.english || m.title.romaji || '',
    cover: m.coverImage.large,
    color: m.coverImage.color,
  }
}

async function fetchShowcase(): Promise<ShowcasePoster[]> {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY }),
  })
  if (!res.ok) throw new Error(`AniList ${res.status}`)
  const { data } = (await res.json()) as { data: Record<'trending' | 'popular' | 'manhwa', { media: RawMedia[] }> }

  const anime = [...data.trending.media, ...data.popular.media]
  const manhwa = data.manhwa.media
  const mixed: RawMedia[] = []
  // Roughly one manhwa for every three anime, spread through the wall.
  for (let a = 0, m = 0; a < anime.length || m < manhwa.length; ) {
    for (let k = 0; k < 3 && a < anime.length; k++) mixed.push(anime[a++])
    if (m < manhwa.length) mixed.push(manhwa[m++])
  }

  const seen = new Set<number>()
  return mixed
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .map(toPoster)
    .filter((p): p is ShowcasePoster => p !== null)
}

/** Trending anime + manhwa covers for the login backdrop, cached for 12 hours. */
export function useShowcase(): ShowcasePoster[] {
  const [posters, setPosters] = useState<ShowcasePoster[]>(() => readCache()?.posters ?? [])

  useEffect(() => {
    const cached = readCache()
    if (cached && Date.now() - cached.at < TTL_MS && cached.posters.length) return
    let cancelled = false
    fetchShowcase()
      .then((fresh) => {
        if (cancelled || !fresh.length) return
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), posters: fresh } satisfies Cached))
        setPosters(fresh)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return posters
}
