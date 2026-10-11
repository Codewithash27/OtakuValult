import { supabase } from './supabase'
import { setAdultOverrides } from '../hooks/useAdultFilter'
import type { PornhwaSeries } from './pornhwadb'

function insertErrorMessage(error: { message?: string; code?: string; details?: string }): string {
  const msg = error.message || 'Could not add to library'
  if (error.code === '23514' || /media_items_source_check|source check/i.test(msg)) {
    return 'Database needs an update: run migration 20261011000003_media_pornhwadb_source.sql in Supabase SQL Editor, then try again.'
  }
  return msg
}

/** Add export manhwa to the user's shelf (or return existing row id). */
export async function addPornhwadbToShelf(series: PornhwaSeries): Promise<string> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const row = {
    user_id: auth.user.id,
    source: 'pornhwadb' as const,
    external_id: series.slug,
    media_type: 'manhwa' as const,
    title: series.title,
    poster_url: series.coverImage,
    year: series.releaseYear,
    status: 'plan_to_watch' as const,
    rating: null,
    progress: 0,
    total: series.totalChapters,
    notes: null,
  }

  const { data, error } = await supabase.from('media_items').insert(row).select('id').single()
  if (!error && data?.id) {
    setAdultOverrides([data.id as string], true)
    return data.id as string
  }
  if (error?.code !== '23505') {
    throw new Error(insertErrorMessage(error ?? {}))
  }

  const existing = await supabase
    .from('media_items')
    .select('id')
    .eq('user_id', auth.user.id)
    .eq('source', 'pornhwadb')
    .eq('external_id', series.slug)
    .maybeSingle()
  if (existing.error) throw new Error(insertErrorMessage(existing.error))
  if (!existing.data?.id) throw new Error('Already on your list, but could not open it. Try Manhwa library.')
  return existing.data.id as string
}
