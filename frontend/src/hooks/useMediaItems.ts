import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { MediaItem } from '../types/media'

export function useMediaItems() {
  return useQuery<MediaItem[]>({
    queryKey: ['media-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('media_items')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
  })
}
