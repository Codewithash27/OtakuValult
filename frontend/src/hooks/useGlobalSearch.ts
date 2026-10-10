import { useQuery } from '@tanstack/react-query'
import { useSession } from './useSession'
import { SearchResponse } from '../types/search'

export function useGlobalSearch(query: string, type: string = 'all', enabled: boolean = true) {
  const { session } = useSession()

  return useQuery<SearchResponse>({
    queryKey: ['global-search', query, type],
    queryFn: async () => {
      const url = new URL(`${import.meta.env.VITE_API_URL}/api/search`)
      url.searchParams.set('q', query)
      url.searchParams.set('type', type)

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(url.toString(), { headers })
      if (!response.ok) throw new Error(`Search failed: ${response.status}`)
      return response.json()
    },
    enabled: enabled && query.trim().length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
