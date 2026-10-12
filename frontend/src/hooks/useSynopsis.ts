import { useQuery } from '@tanstack/react-query'
import { MediaItem } from '../types/media'
import { useMediaDescription } from './useMediaDescription'
import { getPornhwadbSeries } from '../lib/pornhwadb'
import { isBackendConfigured } from '../lib/api'

/** Plot text for a shelf item from AniList or the PornhwaDB catalogue (whichever it came from). */
export function useSynopsis(item: MediaItem | null): string | null {
  const anilist = useMediaDescription(item)
  const slug = item?.source === 'pornhwadb' ? item.external_id : null
  const catalogue = useQuery({
    queryKey: ['pornhwadb-series', slug],
    queryFn: () => getPornhwadbSeries(slug!),
    enabled: !!slug && isBackendConfigured(),
    staleTime: 30 * 60 * 1000,
  })
  const text = (anilist.data as string | null | undefined) ?? catalogue.data?.description ?? null
  return text ? text.replace(/<[^>]+>/g, '').trim() || null : null
}
