import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { primeMeta } from '../lib/anilistMeta'
import {
  FoundArtist,
  FoundImage,
  FoundMedia,
  GELBOORU_CHANGED_EVENT,
  GelbooruAuthError,
  GelbooruCredentials,
  GelbooruRating,
  ImageGroup,
  aniListImages,
  downloadImage,
  gelbooruImages,
  getMedia,
  parseGelbooruCredentials,
  readGelbooruCredentials,
  saveGelbooruCredentials,
  kitsuImages,
  mangaDexImages,
  searchArtists,
  searchTitles,
  wallhavenImages,
} from '../lib/imageFinder'
import { useContentMode } from '../hooks/useAdultFilter'
import { useGalleryBlur } from '../hooks/usePanelAccess'
import { usePanels, useUploadPanels } from '../hooks/usePanels'
import { MediaItem, anilistId } from '../types/media'
import { useToast } from './Toast'
import { TagEditor } from './TagEditor'

type SearchMode = 'title' | 'artist'

const TYPE_LABEL: Record<string, string> = { anime: 'Anime', manga: 'Manga', manhwa: 'Manhwa' }
const GELBOORU_RATINGS: { id: GelbooruRating | null; label: string }[] = [
  { id: null, label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'sensitive', label: 'Sensitive' },
  { id: 'questionable', label: 'Questionable' },
  { id: 'explicit', label: 'Explicit' },
]

function useGelbooruCredentials() {
  const [creds, setCreds] = useState<GelbooruCredentials | null>(readGelbooruCredentials)
  useEffect(() => {
    const sync = () => setCreds(readGelbooruCredentials())
    window.addEventListener(GELBOORU_CHANGED_EVENT, sync)
    return () => window.removeEventListener(GELBOORU_CHANGED_EVENT, sync)
  }, [])
  return creds
}

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
  const kitsu = useQuery({
    queryKey: ['find-images-kitsu', media?.id],
    queryFn: () => kitsuImages(media!),
    enabled: !!media,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })
  const wallpapers = useInfiniteQuery({
    queryKey: ['find-images-wallhaven', media?.id, allowAdult],
    queryFn: ({ pageParam }) => wallhavenImages(media!, !allowAdult, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.lastPage ? last.page + 1 : undefined),
    enabled: !!media,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })
  const gbCreds = useGelbooruCredentials()
  const [gbRatingChoice, setGbRating] = useState<GelbooruRating | null>(null)
  const gbRating = allowAdult ? gbRatingChoice : 'general'
  const gelbooru = useInfiniteQuery({
    queryKey: ['find-images-gelbooru', media?.id, gbRating, gbCreds?.userId],
    queryFn: ({ pageParam }) => gelbooruImages(media!, gbCreds!, gbRating, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.lastPage ? last.page + 1 : undefined),
    enabled: !!media && !!gbCreds,
    staleTime: 30 * 60 * 1000,
    retry: (count, err) => !(err instanceof GelbooruAuthError) && count < 1,
  })

  const shelfItem = useMemo(() => (media ? items.find((i) => anilistId(i) === media.id) : undefined), [items, media])
  const saved = useMemo(() => new Set(panels.map((p) => p.source_url).filter(Boolean) as string[]), [panels])
  const wallpaperImages = useMemo(() => wallpapers.data?.pages.flatMap((p) => p.images) ?? [], [wallpapers.data])
  const gelbooruList = useMemo(() => gelbooru.data?.pages.flatMap((p) => p.images) ?? [], [gelbooru.data])
  const images = useMemo(
    () => [...(alImages.data ?? []), ...(mdImages.data ?? []), ...(kitsu.data ?? []), ...wallpaperImages, ...gelbooruList],
    [alImages.data, mdImages.data, kitsu.data, wallpaperImages, gelbooruList],
  )

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
          adult: img.adult || undefined,
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
    const wakeNote = 'the server can take up to a minute to wake up'
    type Paged = { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown; total: number }
    const paged = (q: typeof wallpapers | typeof gelbooru): Paged => ({
      hasNextPage: q.hasNextPage,
      isFetchingNextPage: q.isFetchingNextPage,
      fetchNextPage: q.fetchNextPage,
      total: q.data?.pages[0]?.total ?? 0,
    })
    const sections: {
      group: ImageGroup
      title: string
      query: { isLoading: boolean; isError: boolean; isSuccess: boolean; error?: unknown; refetch: () => unknown }
      loading?: string
      empty?: string
      grid: string
      show: boolean
      more?: Paged
      extra?: ReactNode
    }[] = [
      { group: 'Cover & banner', title: 'Cover & banner · AniList', query: alImages, grid: 'grid-cols-3 sm:grid-cols-5', show: true },
      { group: 'Characters', title: 'Characters · AniList', query: alImages, grid: 'grid-cols-3 sm:grid-cols-5', show: true },
      {
        group: 'Volume covers',
        title: 'Volume covers · MangaDex',
        query: mdImages,
        loading: `Loading volume covers… ${wakeNote}.`,
        empty: 'MangaDex has no volume covers for this title.',
        grid: 'grid-cols-3 sm:grid-cols-5',
        show: media.type === 'MANGA',
      },
      { group: 'Kitsu art', title: 'Poster & cover · Kitsu', query: kitsu, grid: 'grid-cols-3 sm:grid-cols-5', show: true },
      {
        group: 'Wallpapers',
        title: 'Wallpapers · Wallhaven',
        query: wallpapers,
        loading: `Loading wallpapers… ${wakeNote}.`,
        empty: 'No wallpapers found on Wallhaven.',
        grid: 'grid-cols-2 sm:grid-cols-3',
        show: true,
        more: paged(wallpapers),
      },
      {
        group: 'Gelbooru',
        title: 'Gelbooru',
        query: gelbooru,
        loading: `Searching Gelbooru… ${wakeNote}.`,
        empty: gelbooru.data?.pages[0]?.tag
          ? `Nothing on Gelbooru for this rating (tag: ${gelbooru.data.pages[0].tag}).`
          : 'Gelbooru has no tag for this title.',
        grid: 'grid-cols-3 sm:grid-cols-4',
        show: !!gbCreds,
        more: paged(gelbooru),
        extra: allowAdult ? (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {GELBOORU_RATINGS.map((r) => (
              <button
                key={r.label}
                onClick={() => setGbRating(r.id)}
                className={`chip !px-2.5 !py-0.5 !text-[11px] ${gbRatingChoice === r.id ? 'chip-active' : ''}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 mb-2">Clean mode: general-rated posts only.</p>
        ),
      },
    ]
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

          {sections.map(({ group, title, query, loading, empty, grid, show, more, extra }) => {
            if (!show) return null
            const list = images.filter((i) => i.group === group)
            if (!list.length) {
              let body: ReactNode = null
              if (query.isLoading && loading) {
                body = <p className="text-sm text-slate-500 animate-pulse">{loading}</p>
              } else if (query.isError && group !== 'Characters' && group !== 'Cover & banner') {
                body = (
                  <p className="text-sm text-rose-500">
                    {query.error instanceof GelbooruAuthError ? query.error.message : "Didn't load."}{' '}
                    <button onClick={() => query.refetch()} className="font-semibold underline">
                      Try again
                    </button>
                  </p>
                )
              } else if (query.isSuccess && empty) {
                body = <p className="text-xs text-slate-500">{empty}</p>
              }
              if (!body) return null
              return (
                <div key={group}>
                  {(loading || extra) && <span className={label}>{title}</span>}
                  {extra}
                  {body}
                </div>
              )
            }
            const pickable = list.filter((i) => !saved.has(i.sourceUrl))
            const allOn = pickable.length > 0 && pickable.every((i) => selected.has(i.sourceUrl))
            const count = more && more.total > list.length ? `${list.length} of ${more.total}` : list.length
            return (
              <div key={group}>
                <div className="flex items-center justify-between mb-2">
                  <span className={label + ' !mb-0'}>
                    {title} ({count})
                  </span>
                  {pickable.length > 0 && (
                    <button onClick={() => toggleGroup(group)} disabled={busy} className="text-xs font-semibold text-violet-500 hover:underline">
                      {allOn ? 'Clear' : 'Select all'}
                    </button>
                  )}
                </div>
                {extra}
                <div className={`grid ${grid} gap-2`}>
                  {list.map((img) => (
                    <ImageTile
                      key={img.sourceUrl}
                      image={img}
                      saved={saved.has(img.sourceUrl)}
                      selected={selected.has(img.sourceUrl)}
                      blurred={blurred || (blurAdult && !!img.adult)}
                      disabled={busy}
                      onToggle={() => toggle(img.sourceUrl)}
                    />
                  ))}
                </div>
                {more?.hasNextPage && (
                  <button
                    onClick={() => more.fetchNextPage()}
                    disabled={more.isFetchingNextPage}
                    className="chip !px-3 !py-1.5 !text-xs w-full justify-center mt-2"
                  >
                    {more.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </div>
            )
          })}

          {gbCreds ? (
            <button
              onClick={() => saveGelbooruCredentials(null)}
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-500"
            >
              Disconnect Gelbooru on this device
            </button>
          ) : (
            <GelbooruConnect />
          )}

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
        Covers, banners and character art from AniList, volume covers from MangaDex, posters from Kitsu and wallpapers from
        Wallhaven.
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

function GelbooruConnect() {
  const [open, setOpen] = useState(false)
  const [keyText, setKeyText] = useState('')
  const [userId, setUserId] = useState('')
  const parsed = parseGelbooruCredentials(keyText, userId)
  const needsUserId = !!keyText && !/user_id=/.test(keyText)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-violet-400 p-3 text-left">
        <p className="text-sm font-semibold">＋ Connect Gelbooru</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Fan art and more, with your own free Gelbooru API key.</p>
      </button>
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-2">
      <p className="text-sm font-semibold">Connect Gelbooru</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        On Gelbooru, open{' '}
        <a
          href="https://gelbooru.com/index.php?page=account&s=options"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-violet-500 hover:underline"
        >
          Account → Options ↗
        </a>{' '}
        and copy the whole <code>&amp;api_key=…&amp;user_id=…</code> line under “API Access Credentials”. It's saved on this device only.
      </p>
      <input
        value={keyText}
        onChange={(e) => setKeyText(e.target.value)}
        placeholder="&api_key=…&user_id=…"
        className="input-premium !py-2 text-sm font-mono"
      />
      {needsUserId && (
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID (number)" className="input-premium !py-2 text-sm" />
      )}
      <div className="flex gap-2">
        <button onClick={() => parsed && saveGelbooruCredentials(parsed)} disabled={!parsed} className="btn-glow !px-4 !py-1.5 text-sm">
          Save
        </button>
        <button onClick={() => setOpen(false)} className="chip !px-3 !py-1.5 !text-xs">
          Cancel
        </button>
      </div>
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
      className={`group relative rounded-lg overflow-hidden bg-black/20 text-left ${image.wide ? 'col-span-3 sm:col-span-5 aspect-[4/1]' : image.landscape ? 'aspect-video' : 'aspect-[2/3]'} ${
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
