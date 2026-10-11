import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { MediaItem } from '../types/media'

// Supabase caps each response at 1000 rows by default.
const PAGE = 1000

export function useMediaItems() {
  return useQuery<MediaItem[]>({
    queryKey: ['media-items'],
    queryFn: async () => {
      const all: MediaItem[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('media_items')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, from + PAGE - 1)

        if (error) throw error
        all.push(...(data || []))
        if (!data || data.length < PAGE) break
      }
      return all
    },
  })
}
