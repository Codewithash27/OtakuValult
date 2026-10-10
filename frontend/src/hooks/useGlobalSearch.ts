import { useQuery } from '@tanstack/react-query'
import { SearchResponse } from '../types/search'
import { getApiBase } from '../lib/api'
import { useSession } from './useSession'

export function useGlobalSearch(query: string, type: string = 'all', enabled: boolean = true) {
  const { session } = useSession()

  return useQuery<SearchResponse>({
    queryKey: ['global-search', query, type],
    queryFn: async () => {
      const url = new URL(`${getApiBase()}/api/search`)
      url.searchParams.set('q', query.trim())
      url.searchParams.set('type', type)

      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      let response: Response
      try {
        response = await fetch(url.toString(), { headers })
      } catch {
        throw new Error('Search server is not responding. Start the API and try again.')
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Search failed (${response.status})`)
      }

      return response.json()
    },
    enabled: enabled && query.trim().length >= 2,
    staleTime: 60 * 1000,
    retry: 1,
  })
}
