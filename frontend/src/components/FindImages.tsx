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
  gelbooruTagImages,
  getMedia,
  foundMediaFromShelfItem,
  parseGelbooruCredentials,
  readGelbooruCredentials,
  saveGelbooruCredentials,
  kitsuImages,
  mangaDexImages,
  searchArtists,
  searchTitles,
  wallhavenImages,
  webSearchConfigured,
  webSearchProviders,
  webSearchImages,
  buildWebSearchQuery,
  imageSearchPresets,
  filterWebImagesForMedia,
  themeTagFromPreset,
  type ImageSearchPresetId,
} from '../lib/imageFinder'
import { apiFetch, backendHasImagesApi, getApiBase, isBackendConfigured } from '../lib/api'
import { useContentMode } from '../hooks/useAdultFilter'
import { useGalleryBlur } from '../hooks/usePanelAccess'
import { usePanels, useUploadPanels } from '../hooks/usePanels'
import { MediaItem, anilistId } from '../types/media'
import { useToast } from './Toast'
import { TagEditor } from './TagEditor'

type SearchMode = 'title' | 'artist'

function describeApiError(err: unknown): string {
  if (err instanceof GelbooruAuthError) return err.message
  if (err instanceof Error) {
    if (err.message === 'MISSING_VITE_API_URL') {
      return 'Backend URL is not configured for this Vercel deploy (missing VITE_API_URL).'
    }
    if (err.message.startsWith('NETWORK:')) {
      const base = err.message.slice(8)
      return `Can't reach the API at ${base} — wrong URL, CORS, or Render is waking up (wait ~60s).`
    }
    if (err.message === 'STALE_BACKEND') {
      return 'Render API is outdated (no /api/images). Redeploy the backend from latest GitHub main.'
    }
  }
  return "Didn't load."
}

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
  /** Opens image search for this shelf title (works for manual adult manhwa too). */
  initialShelfItemId?: string | null
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

export function FindImages({
  items,
  isAdultItem,
  tagSuggestions,
  initialQuery = '',
  initialMediaId,
  initialShelfItemId,
  onBusyChange,
  onDone,
}: Props) {
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
  const [imageSearchPreset, setImageSearchPreset] = useState<ImageSearchPresetId>('explicit')
  const [strictTitleFilter, setStrictTitleFilter] = useState(true)

  useEffect(() => {
    if (!media || !allowAdult) return
    setImageSearchPreset(media.adult ? 'explicit' : 'title')
    setStrictTitleFilter(true)
  }, [media?.id, media?.adult, allowAdult])

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
    enabled: !!media && media.id > 0,
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
    enabled: !!media && media.id > 0 && !!gbCreds,
    staleTime: 30 * 60 * 1000,
    retry: (count, err) => !(err instanceof GelbooruAuthError) && count < 1,
  })
  const gelbooruThemeTag = media ? themeTagFromPreset(imageSearchPreset) : null
  const gelbooruTags = useInfiniteQuery({
    queryKey: ['find-images-gelbooru-tags', media?.id, media?.title, gbRating, gbCreds?.userId, imageSearchPreset],
    queryFn: ({ pageParam }) => gelbooruTagImages(media!, gbCreds!, gbRating, pageParam, gelbooruThemeTag),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.lastPage ? last.page + 1 : undefined),
    enabled: !!media && !!gbCreds && allowAdult,
    staleTime: 30 * 60 * 1000,
    retry: (count, err) => !(err instanceof GelbooruAuthError) && count < 1,
  })
  const backendHealth = useQuery({
    queryKey: ['api-health', getApiBase()],
    queryFn: async () => {
      const health = await apiFetch<{ status?: string; capabilities?: { images?: boolean } }>('/api/health')
      const hasImages = await backendHasImagesApi()
      if (!hasImages) throw new Error('STALE_BACKEND')
      return health
    },
    enabled: isBackendConfigured(),
    staleTime: 30_000,
    retry: 1,
  })
  const webReady = useQuery({
    queryKey: ['web-search-configured'],
    queryFn: webSearchConfigured,
    enabled: isBackendConfigured() && backendHealth.isSuccess,
    staleTime: 60 * 60 * 1000,
  })
  const webProviders = useQuery({
    queryKey: ['web-search-providers'],
    queryFn: webSearchProviders,
    staleTime: 60 * 60 * 1000,
  })
  const webQuery = media ? buildWebSearchQuery(media, imageSearchPreset) : ''
  const web = useInfiniteQuery({
    queryKey: ['find-images-web', webQuery, allowAdult],
    queryFn: ({ pageParam }) => webSearchImages(webQuery, !allowAdult, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, lastParam) =>
      last.page < last.lastPage ? lastParam + 10 : undefined,
    enabled: !!media && !!webReady.data && allowAdult,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  const shelfItem = useMemo(() => {
    if (!media) return undefined
    if (media.shelfItemId) return items.find((i) => i.id === media.shelfItemId)
    return media.id > 0 ? items.find((i) => anilistId(i) === media.id) : undefined
  }, [items, media])
  const saved = useMemo(() => new Set(panels.map((p) => p.source_url).filter(Boolean) as string[]), [panels])
  const wallpaperImages = useMemo(() => wallpapers.data?.pages.flatMap((p) => p.images) ?? [], [wallpapers.data])
  const gelbooruList = useMemo(() => gelbooru.data?.pages.flatMap((p) => p.images) ?? [], [gelbooru.data])
  const gelbooruTagList = useMemo(() => gelbooruTags.data?.pages.flatMap((p) => p.images) ?? [], [gelbooruTags.data])
  const webProviderLabel = web.data?.pages[0]?.provider
  const webListRaw = useMemo(() => web.data?.pages.flatMap((p) => p.images) ?? [], [web.data])
  const webList = useMemo(
    () => (media ? filterWebImagesForMedia(webListRaw, media, strictTitleFilter) : webListRaw),
    [webListRaw, media, strictTitleFilter],
  )
  const images = useMemo(
    () =>
      [
        ...(alImages.data ?? []),
        ...(mdImages.data ?? []),
        ...(kitsu.data ?? []),
        ...wallpaperImages,
        ...gelbooruList,
        ...gelbooruTagList,
        ...webList,
      ],
    [alImages.data, mdImages.data, kitsu.data, wallpaperImages, gelbooruList, gelbooruTagList, webList],
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

  useEffect(() => {
    if (!initialShelfItemId) return
    const item = items.find((i) => i.id === initialShelfItemId)
    if (!item) return
    let cancelled = false
    foundMediaFromShelfItem(item, isAdultItem(item))
      .then((m) => !cancelled && openMedia(m))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [initialShelfItemId]) // eslint-disable-line react-hooks/exhaustive-deps

  const openMedia = (m: FoundMedia) => {
    setMedia(m)
    setSelected(new Set())
    setAddToShelf(true)
    const onShelf = m.shelfItemId ? items.find((i) => i.id === m.shelfItemId) : items.find((i) => anilistId(i) === m.id)
    const isAdult = m.adult || (!!onShelf && isAdultItem(onShelf))
    setAdult(isAdult)
    setTags(isAdult ? ['panel'] : [])
    if (allowAdult && isAdult) setGbRating('explicit')
    setImageSearchPreset('title')
    setStrictTitleFilter(false)
    setProgress(null)
  }

  const openShelfItem = (item: MediaItem) => {
    void foundMediaFromShelfItem(item, isAdultItem(item)).then(openMedia)
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
    if (m.shelfItemId) return m.shelfItemId
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
    const paged = (q: typeof wallpapers | typeof gelbooru | typeof gelbooruTags | typeof web): Paged => ({
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
        title: 'Gelbooru · series tag',
        query: gelbooru,
        loading: `Searching Gelbooru… ${wakeNote}.`,
        empty: gelbooru.data?.pages[0]?.tag
          ? `Nothing on Gelbooru for this rating (tag: ${gelbooru.data.pages[0].tag}).`
          : 'Gelbooru has no series tag for this title.',
        grid: 'grid-cols-3 sm:grid-cols-4',
        show: !!gbCreds && media.id > 0,
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
      {
        group: 'Gelbooru tags',
        title: 'Gelbooru · title tags (18+ manhwa)',
        query: gelbooruTags,
        loading: `Searching Gelbooru by title tags… ${wakeNote}.`,
        empty: gelbooruTags.data?.pages[0]?.tag
          ? `No posts for tags “${gelbooruTags.data.pages[0].tag}” at this rating.`
          : 'Try Explicit or Questionable above.',
        grid: 'grid-cols-3 sm:grid-cols-4',
        show: !!gbCreds && allowAdult,
        more: paged(gelbooruTags),
        extra: allowAdult ? (
          <p className="text-[11px] text-slate-500 mb-2">
            Matches tags like <code className="text-violet-500">{media.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}</code> — fan art &amp; panels when they exist on Gelbooru.
          </p>
        ) : null,
      },
      {
        group: 'Web images',
        title: webProviderLabel
          ? `Web images · ${
              webProviderLabel === 'searxng'
                ? 'SearXNG'
                : webProviderLabel === 'free'
                  ? 'free search'
                  : webProviderLabel
            }`
          : 'Web images · free search',
        query: web,
        loading: `Searching the web for “${webQuery}”… ${wakeNote}.`,
        empty: `No images returned for “${webQuery}”. Try a shorter name or Gelbooru tags below.`,
        grid: 'grid-cols-3 sm:grid-cols-4',
        show: allowAdult,
        more: paged(web),
        extra: (
          <div className="space-y-2 mb-2">
            {web.isError && (
              <p className="text-[11px] text-rose-500">
                Web search failed ({web.error instanceof Error ? web.error.message : 'error'}). Is the backend running on port 8000?
              </p>
            )}
            {strictTitleFilter && webListRaw.length > webList.length && (
              <p className="text-[11px] text-amber-600 dark:text-amber-300">
                Hid {webListRaw.length - webList.length} results that didn&apos;t match “{media.title}”. Turn off strict filter to see all.
              </p>
            )}
            {!web.isLoading && !web.isError && webListRaw.length > 0 && webList.length === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-300">
                Strict filter removed all {webListRaw.length} results — turn off <b>Strict: this title only</b> above or try another focus chip.
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              Query: <code className="text-violet-500 break-all">{webQuery}</code>
            </p>
            {webProviders.data && (
              <p className="text-[11px] text-slate-500">
                Engine:{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {webProviderLabel === 'searxng'
                    ? 'SearXNG (free, no API key)'
                    : 'DDGS meta-search (free, no API key)'}
                </span>
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              No paid search API keys on the server — results come from free meta-search, then SearXNG if needed.
            </p>
          </div>
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

          {allowAdult && (
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={label + ' !mb-0'}>Search focus · {media.title}</p>
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={strictTitleFilter}
                    onChange={(e) => setStrictTitleFilter(e.target.checked)}
                    className="accent-violet-500 w-3.5 h-3.5"
                  />
                  Strict: this title only
                </label>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Use <b>Explicit / NSFW</b> for panel art like Google Images. <b>Strict</b> keeps only results that match every word in “
                {media.title}”.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {imageSearchPresets(media).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setImageSearchPreset(p.id)}
                    className={`chip !px-2.5 !py-0.5 !text-[11px] ${imageSearchPreset === p.id ? 'chip-active' : ''}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {alImages.isLoading && <p className="text-sm text-slate-500 animate-pulse">Loading images from AniList…</p>}
          {alImages.isError && <p className="text-sm text-rose-500">Couldn't load AniList images. Try again in a minute.</p>}

          {!isBackendConfigured() && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100 space-y-1">
              <p className="font-semibold">Image search needs your Render API</p>
              <p>
                In Vercel → Project → Settings → Environment Variables, set{' '}
                <code className="text-violet-600 dark:text-violet-300">VITE_API_URL</code> to your backend (e.g.{' '}
                <code className="text-violet-600 dark:text-violet-300">https://otakuvault-api.onrender.com</code>), then{' '}
                <b>Redeploy</b> (Preview + Production).
              </p>
            </div>
          )}
          {isBackendConfigured() && backendHealth.isError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-100 space-y-1">
              <p className="font-semibold">Backend not responding</p>
              <p>{describeApiError(backendHealth.error)}</p>
              {backendHealth.error instanceof Error && backendHealth.error.message === 'STALE_BACKEND' ? (
                <p>
                  Open{' '}
                  <a
                    className="text-violet-600 dark:text-violet-300 underline font-semibold"
                    href={`${getApiBase()}/docs`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {getApiBase()}/docs
                  </a>{' '}
                  — you should see <code className="text-violet-500">/api/images/…</code> routes. If not, Render →
                  your service → <b>Manual Deploy → Deploy latest commit</b> (root directory <code className="text-violet-500">backend</code>
                  ).
                </p>
              ) : (
                <p>
                  Set <code className="text-violet-500">VITE_API_URL</code> to the origin only (e.g.{' '}
                  <code className="text-violet-500">https://otakuvalult.onrender.com</code>, no{' '}
                  <code className="text-violet-500">/api</code> suffix). On Render,{' '}
                  <code className="text-violet-500">FRONTEND_ORIGIN_REGEX</code> ={' '}
                  <code className="text-violet-500">https://otaku-valult.*\.vercel\.app</code>.
                </p>
              )}
              <button type="button" onClick={() => backendHealth.refetch()} className="font-semibold underline">
                Retry connection
              </button>
            </div>
          )}

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
                    {describeApiError(query.error)}{' '}
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
      {allowAdult && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 space-y-2 -mt-1">
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">18+ image finder (Creamy mode)</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Pick a title below or search by name, then use <b>Gelbooru title tags</b> or <b>Web images</b> to browse explicit panels like a Google image search and save them to your gallery.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items
              .filter((i) => i.media_type === 'manhwa' || isAdultItem(i))
              .slice(0, 10)
              .map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => openShelfItem(i)}
                  className="chip !px-2.5 !py-0.5 !text-[11px] max-w-[12rem] truncate"
                  title={i.title}
                >
                  {i.title}
                </button>
              ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
        Covers from AniList &amp; MangaDex, wallpapers from Wallhaven, plus Gelbooru and web search in Creamy mode.
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
  const [src, setSrc] = useState(image.thumb)
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
        src={src}
        alt={image.label}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          if (image.group === 'Web images' && src === image.thumb) {
            setSrc(`${getApiBase()}/api/images/proxy?url=${encodeURIComponent(image.sourceUrl)}`)
          } else setFailed(true)
        }}
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
