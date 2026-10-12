export type MediaType = 'anime' | 'manga' | 'manhwa' | 'movie' | 'tv'
export type Status = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch'

export interface MediaItem {
  id: string
  user_id: string
  source: string
  external_id: string | null
  media_type: MediaType
  title: string
  poster_url: string | null
  year: number | null
  status: Status
  rating: number | null
  progress: number
  total: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** AniList numeric id from `external_id`, which is stored as `anime:123`, `manga:123` or `123`. */
export function anilistId(item: Pick<MediaItem, 'source' | 'external_id'>): number | null {
  if (item.source !== 'anilist' || !item.external_id) return null
  const match = /^(?:anime:|manga:)?(\d+)$/.exec(item.external_id)
  return match ? Number(match[1]) : null
}

/** Read-only details page for a shelf item, or null when it has no catalogue/AniList source to show. */
export function detailHref(item: Pick<MediaItem, 'source' | 'external_id' | 'media_type'>): string | null {
  if (item.source === 'pornhwadb' && item.external_id) {
    return `/community-lists/series/${encodeURIComponent(item.external_id)}`
  }
  const id = anilistId(item)
  if (id !== null) return `/title/${item.media_type === 'anime' ? 'anime' : 'manga'}/${id}`
  return null
}

export const STATUS_LABELS: Record<Status, string> = {
  watching: 'Watching',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
  plan_to_watch: 'Plan to Watch',
}

export const STATUS_COLORS: Record<Status, string> = {
  watching: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  on_hold: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  dropped: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  plan_to_watch: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
}

export const MEDIA_TYPE_EMOJI: Record<MediaType, string> = {
  anime: '📺',
  manga: '📖',
  manhwa: '📙',
  movie: '🎬',
  tv: '📡',
}
