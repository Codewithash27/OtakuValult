import { useQuery } from '@tanstack/react-query'
import { SearchResponse } from '../types/search'

export function useGlobalSearch(query: string, type: string = 'all', enabled: boolean = true) {
  return useQuery<SearchResponse>({
    queryKey: ['global-search', query, type],
    queryFn: async () => {
      const url = new URL(`${import.meta.env.VITE_API_URL}/api/search`)
      url.searchParams.set('q', query)
      url.searchParams.set('type', type)

      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) throw new Error(`Search failed: ${response.status}`)
      return response.json()
    },
    enabled: enabled && query.trim().length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
