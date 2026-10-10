import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

export interface SearchResult {
  source: string
  external_id: string
  media_type: string
  title: string
  alt_title: string | null
  year: number | null
  poster_url: string | null
  overview: string | null
  total: number | null
  rating: number | null
}

export interface SearchResponse {
  results: SearchResult[]
  errors: Record<string, string>
}

export function useSearch(query: string, type: string = 'all', enabled: boolean = true) {
  return useQuery<SearchResponse>({
    queryKey: ['search', query, type],
    queryFn: () => apiFetch(`/api/search?q=${encodeURIComponent(query)}&type=${type}`),
    enabled: enabled && query.length >= 2,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}
