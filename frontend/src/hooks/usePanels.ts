import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { processImage } from '../lib/imageProcess'
import { Panel, PanelKind, normalizeTag } from '../types/panel'

const BUCKET = 'panels'
const PAGE = 1000
const PANELS_KEY = ['panels']

export function usePanels() {
  return useQuery<Panel[]>({
    queryKey: PANELS_KEY,
    queryFn: async () => {
      const all: Panel[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('panels')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) throw error
        all.push(...((data as Panel[]) || []))
        if (!data || data.length < PAGE) break
      }
      return all
    },
  })
}

export interface UploadOptions {
  mediaItemId: string | null
  kind: PanelKind
  adult: boolean
  tags: string[]
  onProgress?: (done: number, total: number) => void
}

/** One image to save; `load` is used for images that still have to be downloaded. */
export interface UploadEntry {
  name: string
  file?: File
  load?: () => Promise<File>
  kind?: PanelKind
  tags?: string[]
  caption?: string | null
  sourceUrl?: string | null
}

function uploadError(err: unknown) {
  const message = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : 'failed'
  if (/source_url|panels_kind_check/.test(message)) return 'run the "panels_official_art" SQL migration in Supabase first'
  if (/duplicate key/.test(message)) return 'already in your gallery'
  return message
}

export function useUploadPanels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ files = [], entries = [], ...opts }: UploadOptions & { files?: File[]; entries?: UploadEntry[] }) => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')

      const all: UploadEntry[] = [...files.map((file) => ({ name: file.name, file })), ...entries]
      const failed: string[] = []
      let done = 0
      for (const entry of all) {
        try {
          const file = entry.file ?? (await entry.load!())
          const tags = [...new Set([...opts.tags, ...(entry.tags ?? [])].map(normalizeTag).filter(Boolean))]
          const img = await processImage(file)
          const id = crypto.randomUUID()
          const fullPath = `${uid}/${id}.${img.ext}`
          const thumbPath = `${uid}/${id}_t.${img.thumb.type === 'image/webp' ? 'webp' : 'jpg'}`
          const store = supabase.storage.from(BUCKET)
          const up1 = await store.upload(fullPath, img.full, { contentType: img.full.type, cacheControl: '31536000' })
          if (up1.error) throw up1.error
          const up2 = await store.upload(thumbPath, img.thumb, { contentType: img.thumb.type, cacheControl: '31536000' })
          if (up2.error) {
            await store.remove([fullPath])
            throw up2.error
          }
          const { error } = await supabase.from('panels').insert({
            id,
            media_item_id: opts.mediaItemId,
            storage_path: fullPath,
            thumb_path: thumbPath,
            kind: entry.kind ?? opts.kind,
            width: img.width,
            height: img.height,
            adult: opts.adult,
            tags,
            ...(entry.caption ? { caption: entry.caption } : {}),
            ...(entry.sourceUrl ? { source_url: entry.sourceUrl } : {}),
          })
          if (error) {
            await store.remove([fullPath, thumbPath])
            throw error
          }
        } catch (err) {
          failed.push(`${entry.name}: ${uploadError(err)}`)
        }
        opts.onProgress?.(++done, all.length)
      }
      return { uploaded: all.length - failed.length, failed }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PANELS_KEY }),
  })
}

export type PanelUpdate = Partial<Pick<Panel, 'media_item_id' | 'kind' | 'adult' | 'tags' | 'caption'>>

export function useUpdatePanels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: PanelUpdate }) => {
      const { error } = await supabase.from('panels').update(data).in('id', ids)
      if (error) throw error
    },
    onMutate: async ({ ids, data }) => {
      await queryClient.cancelQueries({ queryKey: PANELS_KEY })
      const prev = queryClient.getQueryData<Panel[]>(PANELS_KEY)
      queryClient.setQueryData<Panel[]>(PANELS_KEY, (old) =>
        old?.map((p) => (ids.includes(p.id) ? { ...p, ...data } : p)),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => ctx?.prev && queryClient.setQueryData(PANELS_KEY, ctx.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: PANELS_KEY }),
  })
}

export function useDeletePanels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (panels: Panel[]) => {
      if (!panels.length) return
      const { error } = await supabase.from('panels').delete().in('id', panels.map((p) => p.id))
      if (error) throw error
      await supabase.storage.from(BUCKET).remove(panels.flatMap((p) => [p.storage_path, p.thumb_path]))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PANELS_KEY }),
  })
}

// Signed links to the private bucket, shared across components and refreshed before they expire.
const URL_TTL_S = 6 * 60 * 60
const urlCache = new Map<string, { url: string; exp: number }>()
const inflight = new Set<string>()
const listeners = new Set<() => void>()

async function signMissing(paths: string[]) {
  const now = Date.now()
  const missing = paths.filter((p) => {
    const hit = urlCache.get(p)
    return (!hit || hit.exp - now < 10 * 60 * 1000) && !inflight.has(p)
  })
  if (!missing.length) return
  missing.forEach((p) => inflight.add(p))
  try {
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100)
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(chunk, URL_TTL_S)
      data?.forEach((d) => {
        if (d.signedUrl && d.path) urlCache.set(d.path, { url: d.signedUrl, exp: now + URL_TTL_S * 1000 })
      })
    }
  } finally {
    missing.forEach((p) => inflight.delete(p))
    listeners.forEach((l) => l())
  }
}

/** Returns a lookup from storage path to a temporary signed URL. */
export function useSignedUrls(paths: string[]) {
  const [, setVersion] = useState(0)
  const key = paths.join('|')

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    listeners.add(bump)
    return () => {
      listeners.delete(bump)
    }
  }, [])

  useEffect(() => {
    if (key) signMissing(key.split('|'))
  }, [key])

  return (path: string) => urlCache.get(path)?.url
}

export async function signedUrl(path: string) {
  await signMissing([path])
  return urlCache.get(path)?.url
}
