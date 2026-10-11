import { apiFetch } from './api'
import { proxiedPornhwaCover, type PornhwaSeries } from './pornhwadb'

export type ManhwaChartSort = 'top-rated' | 'trending' | 'recent'

export type RankedManhwa = PornhwaSeries & {
  rank: number
  weightedScore?: number
}

export type ChartTagCount = {
  name: string
  count: number
}

export async function fetchManhwaChartTags(
  sort: ManhwaChartSort,
  limit = 48,
): Promise<ChartTagCount[]> {
  const params = new URLSearchParams({ sort, limit: String(limit) })
  const data = await apiFetch<{ tags: ChartTagCount[] }>(`/api/pornhwadb/charts/tags?${params}`)
  return data.tags ?? []
}

export async function fetchManhwaChartPage(
  page: number,
  sort: ManhwaChartSort,
  perPage = 24,
  tag: string | null = null,
): Promise<{ items: RankedManhwa[]; hasNextPage: boolean; total: number }> {
  const params = new URLSearchParams({
    sort,
    page: String(page),
    limit: String(perPage),
  })
  if (tag) params.set('tag', tag)
  const data = await apiFetch<{
    items: RankedManhwa[]
    hasNextPage: boolean
    total: number
  }>(`/api/pornhwadb/charts?${params}`)
  return data
}

export function chartCoverUrl(cover: string | null | undefined): string | null {
  if (!cover) return null
  return proxiedPornhwaCover(cover)
}

export function chartSortLabel(sort: ManhwaChartSort): string {
  if (sort === 'top-rated') return 'Top rated'
  if (sort === 'trending') return 'Trending'
  return 'New'
}

export function formatRatingOutOf5(avg: number | null | undefined): string {
  if (avg == null) return '— / 5'
  return `${Number(avg).toFixed(2)} / 5`
}
