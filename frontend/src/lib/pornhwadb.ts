import { apiFetch, apiUrl } from './api'
import type { FoundMedia } from './imageFinder'

export type PornhwaSeries = {
  slug: string
  title: string
  alternativeTitles: string[]
  description: string | null
  status: string | null
  releaseYear: number | null
  totalChapters: number | null
  coverImage: string | null
  averageRating: number | null
  totalRatings: number | null
  tags: string[]
  externalLinks: { siteName?: string; url?: string }[]
  exportImageCount?: number
}

export type PornhwaExportImage = {
  id: string
  url: string
  label: string
  kind: string
  caption: string | null
}

export type PornhwaStatus = {
  configured: boolean
  path?: string
  hint?: string
  remoteBootstrap?: boolean
  generatedAt?: string
  seriesCount?: number
}

export async function pornhwadbStatus(): Promise<PornhwaStatus> {
  return apiFetch('/api/pornhwadb/status')
}

export async function searchPornhwadb(query: string): Promise<PornhwaSeries[]> {
  const params = new URLSearchParams({ q: query })
  const data = await apiFetch<{ items: PornhwaSeries[] }>(`/api/pornhwadb/search?${params}`)
  return data.items
}

export async function getPornhwadbSeries(slug: string): Promise<PornhwaSeries> {
  return apiFetch(`/api/pornhwadb/series/${encodeURIComponent(slug)}`)
}

export type SimilarSeries = Pick<PornhwaSeries, 'slug' | 'title' | 'coverImage' | 'averageRating' | 'tags'>

export async function getPornhwadbSimilar(
  slug: string,
  limit = 10,
): Promise<{ storyline: SimilarSeries[]; sharedTags: SimilarSeries[] }> {
  return apiFetch(`/api/pornhwadb/series/${encodeURIComponent(slug)}/similar?limit=${limit}`)
}

export function proxiedPornhwaCover(url: string): string {
  return apiUrl(`/api/images/proxy?url=${encodeURIComponent(url)}`)
}

export async function fetchPornhwadbExportImages(slug: string): Promise<{
  total: number
  items: PornhwaExportImage[]
  note?: string
}> {
  return apiFetch(`/api/pornhwadb/series/${encodeURIComponent(slug)}/images`)
}

export function pornhwadbExportToFoundImages(
  items: PornhwaExportImage[],
): import('./imageFinder').FoundImage[] {
  return items.map((item) => ({
    sourceUrl: item.url,
    thumb: proxiedPornhwaCover(item.url),
    download: proxiedPornhwaCover(item.url),
    group: 'PornhwaDB' as const,
    label: item.label,
    kind: item.kind === 'character' ? ('art' as const) : ('art' as const),
    tags: ['pornhwadb', item.kind],
    caption: item.caption,
    adult: true,
  }))
}

export function foundMediaFromPornhwadb(row: PornhwaSeries, shelfItemId?: string): FoundMedia {
  const cover = row.coverImage
  return {
    id: 0,
    shelfItemId,
    pornhwadbSlug: row.slug,
    type: 'MANGA',
    mediaType: 'manhwa',
    title: row.title,
    titles: [row.title, ...row.alternativeTitles].filter(Boolean),
    cover,
    coverXl: cover,
    banner: null,
    year: row.releaseYear,
    format: null,
    total: row.totalChapters,
    adult: true,
    sameSex: false,
    tags: row.tags.slice(0, 12),
    description: row.description,
  }
}
