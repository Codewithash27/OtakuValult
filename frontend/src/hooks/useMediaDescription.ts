import { useQuery } from '@tanstack/react-query'
import { MediaItem, anilistId } from '../types/media'
import { fetchAniListDescription } from '../lib/mediaDescription'

/** Full plot/synopsis from AniList for a shelf item. */
export function useMediaDescription(item: MediaItem | null, enabled = true) {
  const id = item ? anilistId(item) : null
  return useQuery({
    queryKey: ['media-description', id],
    queryFn: () => fetchAniListDescription(id!),
    enabled: enabled && id !== null,
    staleTime: 24 * 60 * 60 * 1000,
  })
}
