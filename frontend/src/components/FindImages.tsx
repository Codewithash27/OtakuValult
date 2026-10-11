import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { primeMeta } from '../lib/anilistMeta'
import {
  FoundArtist,
  FoundImage,
  FoundMedia,
  ImageGroup,
  aniListImages,
  downloadImage,
  getMedia,
  mangaDexImages,
  searchArtists,
  searchTitles,
} from '../lib/imageFinder'
import { useContentMode } from '../hooks/useAdultFilter'
import { useGalleryBlur } from '../hooks/usePanelAccess'
import { usePanels, useUploadPanels } from '../hooks/usePanels'
import { MediaItem, anilistId } from '../types/media'
import { useToast } from './Toast'
import { TagEditor } from './TagEditor'

type SearchMode = 'title' | 'artist'

const GROUPS: ImageGroup[] = ['Cover & banner', 'Characters', 'Volume covers']
const TYPE_LABEL: Record<string, string> = { anime: 'Anime', manga: 'Manga', manhwa: 'Manhwa' }

interface Props {
  items: MediaItem[]
  isAdultItem: (item: MediaItem) => boolean
  tagSuggestions: string[]
  initialQuery?: string
  /** Opens this AniList title's images straight away (a shelf title's drawer). */
  initialMediaId?: number | null
  onBusyChange: (busy: boolean) => void
  onDone: () => void
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function FindImages({ items, isAdultItem, tagSuggestions, initialQuery = '', initialMediaId, onBusyChange, onDone }: Props) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [contentMode] = useContentMode()
  const allowAdult = contentMode === 'creamy'
  const [blurAdult] = useGalleryBlur()
  const { data: panels = [] } = usePanels()
  const upload = useUploadPanels()

  const [mode, setMode] = useState<SearchMode>('title')
  const [query, setQuery] = useState(initialQuery)
  const q = useDebounced(query.trim(), 450)
  const [artist, setArtist] = useState<FoundArtist | null>(null)
  const [media, setMedia] = useState<FoundMedia | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [addToShelf, setAddToShelf] = useState(true)
  const [adult, setAdult] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const titleSearch = useQuery({
    queryKey: ['find-titles', q, allowAdult],
    queryFn: () => searchTitles(q, allowAdult),
    enabled: mode === 'title' && q.length >= 2,
    staleTime: 10 * 60 * 1000,
  })
  const artistSearch = useQuery({
    queryKey: ['find-artists', q, allowAdult],
    queryFn: () => searchArtists(q, allowAdult),
    enabled: mode === 'artist' && q.length >= 2,
    staleTime: 10 * 60 * 1000,
  })
  const alImages = useQuery({
    queryKey: ['find-images-anilist', media?.id],
    queryFn: () => aniListImages(media!),
    enabled: !!media,
    staleTime: 30 * 60 * 1000,
  })
  const mdImages = useQuery({
    queryKey: ['find-images-mangadex', media?.id],
    queryFn: () => mangaDexImages(media!),
    enabled: media?.type === 'MANGA',
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })

  const shelfItem = useMemo(() => (media ? items.find((i) => anilistId(i) === media.id) : undefined), [items, media])
  const saved = useMemo(() => new Set(panels.map((p) => p.source_url).filter(Boolean) as string[]), [panels])
  const images = useMemo(() => [...(alImages.data ?? []), ...(mdImages.data ?? [])], [alImages.data, mdImages.data])

  useEffect(() => onBusyChange(upload.isPending), [upload.isPending]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialMediaId) return
    let cancelled = false
    getMedia(initialMediaId)
      .then((m) => !cancelled && m && (allowAdult || !m.adult) && openMedia(m))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [initialMediaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const openMedia = (m: FoundMedia) => {
    setMedia(m)
    setSelected(new Set())
    setAddToShelf(true)
    const onShelf = items.find((i) => anilistId(i) === m.id)
    setAdult(m.adult || (!!onShelf && isAdultItem(onShelf)))
    setTags([])
    setProgress(null)
  }

  const toggle = (url: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })

  const toggleGroup = (group: ImageGroup) => {
    const urls = images.filter((i) => i.group === group && !saved.has(i.sourceUrl)).map((i) => i.sourceUrl)
    const allOn = urls.every((u) => selected.has(u))
    setSelected((prev) => {
      const next = new Set(prev)
      urls.forEach((u) => (allOn ? next.delete(u) : next.add(u)))
      return next
    })
  }

  async function ensureShelfItem(m: FoundMedia): Promise<string | null> {
    if (shelfItem) return shelfItem.id
    if (!addToShelf) return null
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Not signed in')
    const external_id = `${m.type === 'ANIME' ? 'anime' : 'manga'}:${m.id}`
    primeMeta({ [String(m.id)]: { a: m.adult, t: m.tags } })
    const { data, error } = await supabase
      .from('media_items')
      .insert({
        user_id: auth.user.id,
        source: 'anilist',
        external_id,
        media_type: m.mediaType,
        title: m.title,
        poster_url: m.cover,
        year: m.year,
        status: 'plan_to_watch',
        rating: null,
        progress: 0,
        total: m.total,
        notes: null,
      })
      .select('id')
      .single()
    if (!error) return data.id as string
    if (error.code !== '23505') throw error
    const existing = await supabase.from('media_items').select('id').eq('source', 'anilist').eq('external_id', external_id).maybeSingle()
    return (existing.data?.id as string | undefined) ?? null
  }

  const add = async () => {
    if (!media) return
    const chosen = images.filter((i) => selected.has(i.sourceUrl))
    if (!chosen.length) return
    setProgress({ done: 0, total: chosen.length })
    let mediaItemId: string | null
    try {
      mediaItemId = await ensureShelfItem(media)
      if (mediaItemId && !shelfItem) queryClient.invalidateQueries({ queryKey: ['media-items'] })
    } catch (err) {
      setProgress(null)
      showToast(`Couldn't add the title to your shelf: ${err instanceof Error ? err.message : 'error'}`, 'error')
      return
    }
    upload.mutate(
      {
        mediaItemId,
        kind: 'art',
        adult,
        tags,
        entries: chosen.map((img) => ({
          name: img.label,
          load: () => downloadImage(img, media.title),
          kind: img.kind,
          tags: img.tags,
          caption: img.caption,
          sourceUrl: img.sourceUrl,
        })),
        onProgress: (done, total) => setProgress({ done, total }),
      },
      {
        onSuccess: ({ uploaded, failed }) => {
          if (failed.length) showToast(`Added ${uploaded}, ${failed.length} failed: ${failed[0]}`, 'error')
          else showToast(`Added ${uploaded} image${uploaded === 1 ? '' : 's'} from ${media.title}`, 'success')
          if (uploaded) onDone()
          else setProgress(null)
        },
        onError: (err) => {
          showToast(err instanceof Error ? err.message : 'Adding images failed', 'error')
          setProgress(null)
        },
      },
    )
  }

  const label = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5'
  const busy = upload.isPending || (!!progress && !upload.isError)

  if (media) {
    const blurred = blurAdult && adult
    const mdState = media.type !== 'MANGA' ? null : mdImages.isLoading ? 'loading' : mdImages.isError ? 'error' : null
    return (
      <>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMedia(null)}
              disabled={busy}
              className="w-9 h-9 shrink-0 grid place-items-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-40"
              aria-label="Back to results"
            >
              ←
            </button>
            {media.cover && <img src={media.cover} alt="" className="w-10 h-14 rounded-md object-cover shrink-0" />}
            <div className="min-w-0">
              <p className="font-bold truncate">{media.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {TYPE_LABEL[media.mediaType]}
                {media.year ? ` · ${media.year}` : ''}
                {media.adult ? ' · 18+' : ''}
                {shelfItem ? ' · on your shelf' : ''}
              </p>
            </div>
          </div>

          {alImages.isLoading && <p className="text-sm text-slate-500 animate-pulse">Loading images from AniList…</p>}
          {alImages.isError && <p className="text-sm text-rose-500">Couldn't load AniList images. Try again in a minute.</p>}

          {GROUPS.map((group) => {
            const list = images.filter((i) => i.group === group)
            if (group === 'Volume covers' && mdState) {
              return (
                <div key={group}>
                  <span className={label}>Volume covers · MangaDex</span>
                  {mdState === 'loading' ? (
                    <p className="text-sm text-slate-500 animate-pulse">Loading volume covers… the server can take up to a minute to wake up.</p>
                  ) : (
                    <p className="text-sm text-rose-500">
                      Volume covers didn't load.{' '}
                      <button onClick={() => mdImages.refetch()} className="font-semibold underline">
                        Try again
                      </button>
                    </p>
                  )}
                </div>
              )
            }
            if (!list.length) {
              return group === 'Volume covers' && media.type === 'MANGA' && mdImages.isSuccess ? (
                <p key={group} className="text-xs text-slate-500">MangaDex has no volume covers for this title.</p>
              ) : null
            }
            const pickable = list.filter((i) => !saved.has(i.sourceUrl))
            const allOn = pickable.length > 0 && pickable.every((i) => selected.has(i.sourceUrl))
            return (
              <div key={group}>
                <div className="flex items-center justify-between mb-2">
                  <span className={label + ' !mb-0'}>
                    {group === 'Volume covers' ? 'Volume covers · MangaDex' : group} ({list.length})
                  </span>
                  {pickable.length > 0 && (
                    <button onClick={() => toggleGroup(group)} disabled={busy} className="text-xs font-semibold text-violet-500 hover:underline">
                      {allOn ? 'Clear' : 'Select all'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {list.map((img) => (
                    <ImageTile
                      key={img.sourceUrl}
                      image={img}
                      saved={saved.has(img.sourceUrl)}
                      selected={selected.has(img.sourceUrl)}
                      blurred={blurred}
                      disabled={busy}
                      onToggle={() => toggle(img.sourceUrl)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {images.length > 0 && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {shelfItem ? (
                  <span className="text-slate-500 dark:text-slate-400">Linked to “{shelfItem.title}” on your shelf</span>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={addToShelf}
                      onChange={(e) => setAddToShelf(e.target.checked)}
                      className="accent-violet-500 w-4 h-4"
                    />
                    <span>Add this title to my shelf (Plan to read)</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="accent-rose-500 w-4 h-4" />
                  <span>Mark as 18+</span>
                </label>
              </div>
              <div>
                <label className={label}>Extra tags</label>
                <TagEditor value={tags} onChange={setTags} suggestions={tagSuggestions} />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-white/10">
          {progress && (
            <div className="mb-3">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>Downloading and saving…</span>
                <span>
                  {progress.done} / {progress.total}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <button onClick={add} disabled={!selected.size || busy} className="btn-glow w-full !py-2.5">
            {busy ? 'Adding…' : selected.size ? `Add ${selected.size} image${selected.size === 1 ? '' : 's'}` : 'Tick the images you want'}
          </button>
        </div>
      </>
    )
  }

  const search = mode === 'title' ? titleSearch : artistSearch
  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      <div className="flex gap-1.5">
        {(['title', 'artist'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              setArtist(null)
            }}
            className={`chip !px-3 !py-1 !text-xs ${mode === m ? 'chip-active' : ''}`}
          >
            {m === 'title' ? 'By title' : 'By artist / author'}
          </button>
        ))}
      </div>
      <input
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setArtist(null)
        }}
        placeholder={mode === 'title' ? 'Manhwa, manga or anime name…' : 'Artist or author name, e.g. So-Ryeong Gi'}
        className="input-premium w-full"
      />
      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
        Official covers, banners and character art from AniList, plus volume covers from MangaDex.
      </p>

      {q.length >= 2 && search.isLoading && <p className="text-sm text-slate-500 animate-pulse">Searching AniList…</p>}
      {search.isError && <p className="text-sm text-rose-500">{(search.error as Error).message}</p>}

      {mode === 'title' && titleSearch.data && (
        <MediaList list={titleSearch.data} items={items} onPick={openMedia} empty={`No titles found for “${q}”.`} />
      )}

      {mode === 'artist' && artistSearch.data && !artist && (
        <div className="space-y-1.5">
          {!artistSearch.data.length && <p className="text-sm text-slate-500">No artists found for “{q}”. Try the name the other way round.</p>}
          {artistSearch.data.map((a) => (
            <button
              key={a.id}
              onClick={() => setArtist(a)}
              className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/5"
            >
              {a.image ? (
                <img src={a.image} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-500/20 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">
                  {a.name}
                  {a.native && <span className="font-normal text-slate-500"> · {a.native}</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">{a.roles.join(', ') || 'Staff'}</p>
              </div>
              <span className="text-xs text-slate-500 shrink-0">{a.works.length} works →</span>
            </button>
          ))}
        </div>
      )}

      {mode === 'artist' && artist && (
        <div>
          <button onClick={() => setArtist(null)} className="text-xs font-semibold text-violet-500 hover:underline mb-2">
            ← All artists
          </button>
          <p className="font-bold mb-2">{artist.name}'s works</p>
          <MediaList list={artist.works} items={items} onPick={openMedia} empty="No works to show." />
        </div>
      )}
    </div>
  )
}

function MediaList({ list, items, onPick, empty }: { list: FoundMedia[]; items: MediaItem[]; onPick: (m: FoundMedia) => void; empty: string }) {
  const onShelf = useMemo(() => new Set(items.map(anilistId).filter((id): id is number => id !== null)), [items])
  if (!list.length) return <p className="text-sm text-slate-500">{empty}</p>
  return (
    <div className="space-y-1.5">
      {list.map((m) => (
        <button key={m.id} onClick={() => onPick(m)} className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/5">
          {m.cover ? (
            <img src={m.cover} alt="" loading="lazy" className="w-10 h-14 rounded-md object-cover shrink-0" />
          ) : (
            <div className="w-10 h-14 rounded-md bg-slate-500/20 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{m.title}</p>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <Badge>{TYPE_LABEL[m.mediaType]}</Badge>
              {m.year && <Badge>{m.year}</Badge>}
              {m.adult && <Badge tone="rose">18+</Badge>}
              {m.sameSex && <Badge>BL/Yuri</Badge>}
              {onShelf.has(m.id) && <Badge tone="violet">On shelf</Badge>}
            </div>
          </div>
          <span className="text-slate-400 shrink-0">→</span>
        </button>
      ))}
    </div>
  )
}

function Badge({ children, tone }: { children: ReactNode; tone?: 'rose' | 'violet' }) {
  const color =
    tone === 'rose' ? 'bg-rose-500/15 text-rose-500' : tone === 'violet' ? 'bg-violet-500/15 text-violet-500' : 'bg-slate-500/15 text-slate-500'
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${color}`}>{children}</span>
}

function ImageTile({
  image,
  saved,
  selected,
  blurred,
  disabled,
  onToggle,
}: {
  image: FoundImage
  saved: boolean
  selected: boolean
  blurred: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saved || disabled}
      title={image.label}
      className={`group relative rounded-lg overflow-hidden bg-black/20 text-left ${image.wide ? 'col-span-3 sm:col-span-5 aspect-[4/1]' : 'aspect-[2/3]'} ${
        selected ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-transparent' : ''
      } ${saved ? 'opacity-50 cursor-default' : ''}`}
    >
      <img
        src={image.thumb}
        alt={image.label}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover ${blurred ? 'blur-xl scale-110' : ''}`}
      />
      <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[10px] font-semibold text-white truncate bg-gradient-to-t from-black/80 to-transparent">
        {image.label}
      </span>
      {saved ? (
        <span className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500 text-white">Saved</span>
      ) : (
        <span
          className={`absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-full text-xs font-bold border-2 ${
            selected ? 'bg-violet-500 border-violet-500 text-white' : 'bg-black/40 border-white/80 text-transparent'
          }`}
        >
          ✓
        </span>
      )}
    </button>
  )
}
