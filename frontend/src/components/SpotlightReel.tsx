import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MediaItem, STATUS_LABELS } from '../types/media'
import { PosterImage } from './PosterImage'
import { useSynopsis } from '../hooks/useSynopsis'
import { useSlideshow, useSwipe } from '../hooks/useSlideshow'
import { chartCoverUrl, fetchManhwaChartPage, type RankedManhwa } from '../lib/manhwaCharts'
import { addPornhwadbToShelf } from '../lib/addPornhwadbItem'
import { isBackendConfigured } from '../lib/api'
import { useToast } from './Toast'

const SLIDES = 8
const AFTER_DARK_SLIDES = 4
const INTERVAL = 6500

type Slide = { item: MediaItem; kicker: string; catalogue?: RankedManhwa }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Catalogue titles shaped like shelf items so the reel can render them the same way. */
function catalogueSlide(m: RankedManhwa, kicker: string): Slide {
  const item = {
    id: `cat-${m.slug}`,
    title: m.title,
    media_type: 'manhwa',
    status: 'plan_to_watch',
    progress: 0,
    total: null,
    rating: null,
    notes: null,
    poster_url: chartCoverUrl(m.coverImage),
    year: m.releaseYear,
    source: 'pornhwadb',
    external_id: m.slug,
  } as unknown as MediaItem
  return { item, kicker, catalogue: m }
}

/** Trending + top-rated catalogue manhwa that aren't on the shelf yet. */
function useAfterDarkPicks(enabled: boolean, shelf: MediaItem[]) {
  const trending = useQuery({
    queryKey: ['manhwa-chart', 'trending', 1, null, 12],
    queryFn: () => fetchManhwaChartPage(1, 'trending', 12),
    enabled: enabled && isBackendConfigured(),
    staleTime: 30 * 60 * 1000,
  })
  const top = useQuery({
    queryKey: ['manhwa-chart', 'top-rated', 1, null, 12],
    queryFn: () => fetchManhwaChartPage(1, 'top-rated', 12),
    enabled: enabled && isBackendConfigured(),
    staleTime: 30 * 60 * 1000,
  })
  return useMemo(() => {
    if (!enabled) return []
    const owned = new Set(shelf.flatMap((i) => [norm(i.title), ...(i.source === 'pornhwadb' && i.external_id ? [i.external_id] : [])]))
    const fresh = (m: RankedManhwa) => m.coverImage && !owned.has(m.slug) && !owned.has(norm(m.title))
    const t = (trending.data?.items ?? []).filter(fresh).slice(0, 2).map((m) => catalogueSlide(m, '🔥 Trending tonight'))
    const seen = new Set(t.map((s) => s.catalogue!.slug))
    const r = (top.data?.items ?? [])
      .filter((m) => fresh(m) && !seen.has(m.slug))
      .slice(0, AFTER_DARK_SLIDES - t.length)
      .map((m) => catalogueSlide(m, `👑 Top rated · #${m.rank}`))
    return [...t, ...r]
  }, [enabled, shelf, trending.data, top.data])
}

/** Alternate shelf slides with catalogue picks so neither clumps together. */
function interleave(a: Slide[], b: Slide[]): Slide[] {
  const out: Slide[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i])
    if (b[i]) out.push(b[i])
  }
  return out
}

/** Pick a mix: what you're on now, your best rated, then a few random gems. */
function pickSlides(items: MediaItem[]): Slide[] {
  const withPoster = items.filter((i) => i.poster_url)
  const used = new Set<string>()
  const take = (list: MediaItem[], kicker: string, n: number) =>
    list
      .filter((i) => !used.has(i.id))
      .slice(0, n)
      .map((item) => (used.add(item.id), { item, kicker }))
  const reading = withPoster.filter((i) => i.status === 'watching')
  const best = [...withPoster].filter((i) => i.rating).sort((a, b) => (b.rating || 0) - (a.rating || 0))
  const random = [...withPoster].sort(() => Math.random() - 0.5)
  return [
    ...take(reading, 'Continue', 3),
    ...take(best, 'Top of your shelf', 2),
    ...take(random, 'Tonight’s pick', SLIDES),
  ].slice(0, SLIDES)
}

interface SpotlightReelProps {
  items: MediaItem[]
  tagsOf: (i: MediaItem) => string[] | undefined
  onOpen: (i: MediaItem) => void
  onPremiere: (i: MediaItem) => void
  /** Creamy mode: mix in trending / top-rated catalogue manhwa not yet on the shelf. */
  afterDark?: boolean
}

export function SpotlightReel({ items, tagsOf, onOpen, onPremiere, afterDark = false }: SpotlightReelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const picks = useAfterDarkPicks(afterDark, items)
  const base = useMemo(() => pickSlides(items), [items])
  const slides = useMemo(() => interleave(base, picks).slice(0, SLIDES + picks.length), [base, picks])
  const [hover, setHover] = useState(false)
  const [added, setAdded] = useState<Record<string, string>>({})
  const { index, tick, go, next, prev } = useSlideshow(slides.length, INTERVAL, hover)
  const swipe = useSwipe(next, prev)
  const slide = slides[index]
  const current = slide?.item ?? null
  const cat = slide?.catalogue
  const shelfSynopsis = useSynopsis(cat ? null : current)
  const synopsis = cat ? cat.description : shelfSynopsis

  const add = useMutation({
    mutationFn: (m: RankedManhwa) => addPornhwadbToShelf(m),
    onSuccess: (id, m) => {
      setAdded((a) => ({ ...a, [m.slug]: id }))
      queryClient.invalidateQueries({ queryKey: ['media-items'] })
      showToast(`Added ${m.title} to your vault`, 'success')
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Could not add', 'error'),
  })

  if (slides.length < 2 || !current) return null
  const unit = current.media_type === 'anime' ? 'ep' : 'ch'
  const tags = (cat ? cat.tags : tagsOf(current) ?? []).slice(0, 4)
  const verb = current.media_type === 'anime' ? 'watching' : 'reading'
  const openSlide = () => (cat ? navigate(`/community-lists/series/${encodeURIComponent(cat.slug)}`) : onOpen(current))

  return (
    <section
      className="reel relative overflow-hidden rounded-3xl mb-4 ring-1 ring-white/10 bg-[#070b12] text-white animate-fade-up"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...swipe}
      aria-roledescription="carousel"
    >
      {/* Backdrops crossfade */}
      {slides.map(({ item }, i) => (
        <img
          key={item.id}
          src={item.poster_url!}
          alt=""
          aria-hidden
          className={`absolute inset-0 w-full h-full object-cover blur-2xl scale-125 transition-opacity duration-1000 ${
            i === index ? 'opacity-50' : 'opacity-0'
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-[#070b12] via-[#070b12]/85 to-[#070b12]/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#070b12] via-transparent to-transparent" />
      <div className="reel-grain absolute inset-0 pointer-events-none" />

      <div key={`${current.id}-${tick}`} className="relative grid md:grid-cols-[1fr_auto] gap-5 p-5 sm:p-7 md:min-h-[300px]">
        <div className="flex flex-col justify-center min-w-0 max-w-2xl">
          <p className="reel-in text-[10px] font-bold uppercase tracking-[.35em] text-lantern-300" style={{ animationDelay: '50ms' }}>
            {slide.kicker === 'Continue' ? `Continue ${verb}` : slide.kicker}
          </p>
          <h2 className="reel-title mt-2 text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold leading-[1.05] line-clamp-2">
            {current.title}
          </h2>

          <div className="reel-in mt-3 flex flex-wrap items-center gap-2 text-xs" style={{ animationDelay: '250ms' }}>
            <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/15 font-bold uppercase tracking-wider text-[10px]">
              {current.media_type}
            </span>
            {current.year && <span className="text-white/60">{current.year}</span>}
            {cat ? (
              <>
                <span className="px-2 py-0.5 rounded-md bg-vermilion-500/25 text-vermilion-200 border border-vermilion-400/30 font-bold text-[10px] uppercase tracking-wider">
                  {added[cat.slug] ? '✓ In vault' : 'Not in your vault'}
                </span>
                {cat.averageRating ? <span className="font-bold text-amber-300">★ {Number(cat.averageRating).toFixed(2)}/5</span> : null}
              </>
            ) : (
              <>
                <span className="text-white/80 font-semibold">{STATUS_LABELS[current.status]}</span>
                {current.rating ? <span className="font-bold text-amber-300">★ {current.rating}/10</span> : null}
              </>
            )}
            {tags.map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-full bg-lantern-500/15 text-lantern-200 border border-lantern-400/25 text-[11px]">
                {t}
              </span>
            ))}
          </div>

          {synopsis && (
            <p className="reel-in mt-3 text-sm text-white/70 leading-relaxed line-clamp-2 sm:line-clamp-3" style={{ animationDelay: '350ms' }}>
              {synopsis}
            </p>
          )}

          {current.total ? (
            <div className="reel-in mt-3 flex items-center gap-3 text-xs text-white/60" style={{ animationDelay: '420ms' }}>
              <div className="h-1.5 w-44 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lantern-400 to-jade-400"
                  style={{ width: `${Math.min(100, (current.progress / current.total) * 100)}%` }}
                />
              </div>
              {current.progress}/{current.total} {unit}
            </div>
          ) : null}

          <div className="reel-in mt-5 flex flex-wrap gap-2" style={{ animationDelay: '500ms' }}>
            {cat ? (
              <>
                <button
                  onClick={() => !added[cat.slug] && add.mutate(cat)}
                  disabled={add.isPending || !!added[cat.slug]}
                  className="btn-glow !py-2.5 !px-5 text-sm disabled:opacity-80"
                >
                  {added[cat.slug] ? '✓ Added' : add.isPending ? 'Adding…' : '➕ Add to vault'}
                </button>
                <button onClick={openSlide} className="h-10 px-4 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md transition-colors">
                  📖 Details
                </button>
              </>
            ) : (
              <>
                <button onClick={openSlide} className="btn-glow !py-2.5 !px-5 text-sm">
                  {current.status === 'watching' ? '▶ Continue' : '📖 Details'}
                </button>
                <button
                  onClick={() => onPremiere(current)}
                  className="h-10 px-4 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md transition-colors"
                >
                  🎬 Premiere mode
                </button>
              </>
            )}
          </div>
        </div>

        <button onClick={openSlide} className="reel-poster hidden md:block self-center w-44 lg:w-48 rounded-2xl overflow-hidden ring-1 ring-white/20">
          <PosterImage src={current.poster_url} alt={current.title} mediaType={current.media_type} className="w-full aspect-[2/3] kenburns" />
        </button>
      </div>

      {/* Thumbnails with timer */}
      <div className="relative flex items-center gap-2 px-5 sm:px-7 pb-4">
        <button onClick={prev} className="reel-nav" aria-label="Previous">‹</button>
        <div className="flex-1 flex gap-1.5 min-w-0">
          {slides.map(({ item }, i) => (
            <button
              key={item.id}
              onClick={() => go(i)}
              className="group flex-1 min-w-0 text-left"
              aria-label={item.title}
              aria-current={i === index}
            >
              <span className="block h-1 rounded-full bg-white/15 overflow-hidden">
                <span
                  key={i === index ? tick : 'idle'}
                  className={`block h-full rounded-full bg-gradient-to-r from-lantern-400 to-jade-400 ${
                    i === index ? (hover ? 'w-full opacity-60' : 'reel-timer') : i < index ? 'w-full opacity-40' : 'w-0'
                  }`}
                  style={{ ['--reel-ms' as string]: `${INTERVAL}ms` }}
                />
              </span>
              <span className={`hidden lg:block mt-1.5 text-[10px] truncate transition-colors ${i === index ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`}>
                {item.title}
              </span>
            </button>
          ))}
        </div>
        <button onClick={next} className="reel-nav" aria-label="Next">›</button>
      </div>
    </section>
  )
}
