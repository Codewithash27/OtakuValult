import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MediaItem, Status, STATUS_LABELS, anilistId } from '../types/media'
import { fetchAnimeBrowse, type AiringSlot, type BrowseAnime } from '../lib/anilistBrowse'
import { useSlideshow, useSwipe } from '../hooks/useSlideshow'
import { useAddItem } from '../hooks/useMediaMutations'
import { useToast } from './Toast'
import { SearchBar } from './SearchBar'
import { AnimePosterRow, type PosterTile } from './AnimePosterRow'
import { MediaCard } from './MediaCard'
import { MediaRow } from './MediaRow'
import type { VaultView } from './VaultHeader'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STATUSES: (Status | 'all')[] = ['all', 'watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch']

type TopRange = 'trending' | 'popular'

function clock(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function shelfMatch(items: MediaItem[], id: number) {
  return items.find((i) => anilistId(i) === id) ?? null
}

function toTile(
  a: BrowseAnime,
  onOpen: (a: BrowseAnime) => void,
  extra?: Partial<PosterTile>
): PosterTile {
  return {
    key: String(a.id),
    title: a.title,
    cover: a.cover,
    subtitle: [a.format, a.year].filter(Boolean).join(' · '),
    onClick: () => onOpen(a),
    ...extra,
  }
}

interface AnimeHomeProps {
  items: MediaItem[]
  search: string
  onSearch: (q: string) => void
  status: Status | 'all'
  onStatus: (s: Status | 'all') => void
  counts: Record<Status | 'all', number>
  onOpen: (item: MediaItem) => void
  onPremiere: (item: MediaItem) => void
  onCinema: () => void
  filtered: MediaItem[]
  shown: MediaItem[]
  view: VaultView
  onView: (v: VaultView) => void
  sentinelRef: React.RefObject<HTMLDivElement>
}

export function AnimeHome({
  items,
  search,
  onSearch,
  status,
  onStatus,
  counts,
  onOpen,
  onPremiere,
  onCinema,
  filtered,
  shown,
  view,
  onView,
  sentinelRef,
}: AnimeHomeProps) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const add = useAddItem()
  const [hover, setHover] = useState(false)
  const [topRange, setTopRange] = useState<TopRange>('trending')
  const [day, setDay] = useState(() => new Date().getDay())
  const [added, setAdded] = useState<Record<number, true>>({})

  const ids = useMemo(
    () => items.map(anilistId).filter((n): n is number => n !== null),
    [items]
  )

  const browse = useQuery({
    queryKey: ['anime-browse', ids.slice(0, 25).join(',')],
    queryFn: () => fetchAnimeBrowse(ids),
    staleTime: 30 * 60 * 1000,
  })

  const data = browse.data
  const byId = useMemo(() => {
    const map = new Map<number, BrowseAnime>()
    for (const m of data?.shelf ?? []) map.set(m.id, m)
    for (const m of [...(data?.trending ?? []), ...(data?.popular ?? []), ...(data?.upcoming ?? []), ...(data?.fresh ?? [])]) {
      if (!map.has(m.id)) map.set(m.id, m)
    }
    return map
  }, [data])

  const watching = items.filter((i) => i.status === 'watching' && i.poster_url)
  const planned = items.filter((i) => i.status === 'plan_to_watch' && i.poster_url)
  const recent = [...items].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).filter((i) => i.poster_url)

  const slides = useMemo(() => {
    const fromShelf = watching
      .map((item) => ({
        kind: 'shelf' as const,
        item,
        meta: byId.get(anilistId(item) ?? -1),
      }))
      .filter((s) => s.meta?.banner)
      .slice(0, 2)
    const seen = new Set(ids)
    const takeCatalog = (list: BrowseAnime[] | undefined, n: number) => {
      const out: { kind: 'catalog'; meta: BrowseAnime }[] = []
      for (const m of list ?? []) {
        if (!m.banner || seen.has(m.id)) continue
        seen.add(m.id)
        out.push({ kind: 'catalog', meta: m })
        if (out.length >= n) break
      }
      return out
    }
    const fromNew = takeCatalog(data?.fresh, 3)
    const fromSoon = takeCatalog(data?.upcoming, 2)
    const fromTrend = takeCatalog(data?.trending, 3)
    const mixed: Array<(typeof fromShelf)[number] | (typeof fromNew)[number]> = []
    const pools = [fromShelf, fromNew, fromSoon, fromTrend]
    for (let i = 0; i < 8; i++) {
      for (const pool of pools) {
        if (pool[i]) mixed.push(pool[i])
      }
    }
    return mixed.slice(0, 8)
  }, [watching, ids, data, byId])

  const { index, next, prev, go } = useSlideshow(slides.length, 7000, hover)
  const swipe = useSwipe(next, prev)
  const slide = slides[index]

  const openCatalog = (a: BrowseAnime) => {
    const owned = shelfMatch(items, a.id)
    if (owned) onOpen(owned)
    else navigate(`/title/anime/${a.id}`, { state: { from: window.location.pathname } })
  }

  const addCatalog = async (a: BrowseAnime) => {
    try {
      await add.mutateAsync({
        title: a.title,
        media_type: 'anime',
        poster_url: a.cover,
        year: a.year,
        status: 'plan_to_watch',
        rating: null,
        progress: 0,
        total: a.episodes,
        notes: null,
        source: 'anilist',
        external_id: `anime:${a.id}`,
      })
      setAdded((s) => ({ ...s, [a.id]: true }))
      showToast(`Added ${a.title} to your vault`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not add', 'error')
    }
  }

  const browsing = !search && status === 'all'
  const topList = topRange === 'trending' ? data?.trending ?? [] : data?.popular ?? []

  const airingByDay = useMemo(() => {
    const buckets: AiringSlot[][] = Array.from({ length: 7 }, () => [])
    for (const slot of data?.airing ?? []) {
      buckets[new Date(slot.airingAt * 1000).getDay()].push(slot)
    }
    return buckets
  }, [data])

  const spotlightTitle = slide?.kind === 'shelf' ? slide.item.title : slide?.meta?.title
  const spotlightMeta = slide?.kind === 'shelf' ? slide.meta : slide?.meta
  const spotlightKicker =
    slide?.kind === 'shelf'
      ? `Continue watching · ${index + 1}`
      : slide?.meta?.status === 'NOT_YET_RELEASED'
        ? 'Upcoming'
        : slide?.meta?.status === 'RELEASING'
          ? 'New this season'
          : `#${index + 1} Spotlight`
  const spotlightSynopsis = spotlightMeta?.description
  const spotlightOwned = slide?.kind === 'shelf' ? slide.item : slide?.meta ? shelfMatch(items, slide.meta.id) : null

  return (
    <div className="anime-home -mx-4 -mt-4 lg:-mx-6 lg:mt-0 pb-6 lg:pb-10">
      {browsing && slides.length > 0 && (
        <section
          className="anime-spot relative overflow-hidden text-white"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          {...swipe}
        >
          {slides.map((s, i) => {
            const src = s.kind === 'shelf' ? s.meta?.banner : s.meta.banner
            return (
              <div
                key={s.kind === 'shelf' ? s.item.id : s.meta.id}
                className={`anime-spot-art ${i === index ? 'is-on' : ''}`}
              >
                {src ? (
                  <img
                    src={src}
                    alt=""
                    width={1920}
                    height={400}
                    sizes="100vw"
                    decoding={i === index ? 'sync' : 'async'}
                    fetchPriority={i === index ? 'high' : 'low'}
                  />
                ) : null}
              </div>
            )
          })}
          <div className="anime-spot-shade" />

          <div className="absolute inset-0 z-10 flex items-end sm:items-center">
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 pt-8 pb-10 sm:py-10">
              <div className="min-w-0 max-w-xl">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[.18em] sm:tracking-[.22em] text-lantern-300 truncate">
                {spotlightKicker}
              </p>
              <h1 className="mt-1.5 sm:mt-2 max-w-3xl text-[1.65rem] sm:text-5xl lg:text-[3.4rem] font-display font-extrabold leading-[1.08] line-clamp-2 drop-shadow-2xl">
                {spotlightTitle}
              </h1>
              <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-white/70">
                {spotlightMeta?.format && (
                  <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-[10px] font-bold uppercase tracking-wider text-white">
                    {spotlightMeta.format}
                  </span>
                )}
                {slide?.kind === 'shelf' && <span>{STATUS_LABELS[slide.item.status]}</span>}
                {(spotlightMeta?.year || (slide?.kind === 'shelf' && slide.item.year)) && (
                  <span>{spotlightMeta?.year || (slide?.kind === 'shelf' ? slide.item.year : null)}</span>
                )}
                {slide?.kind === 'shelf' && slide.item.rating ? (
                  <span className="text-amber-300 font-bold">★ {slide.item.rating}/10</span>
                ) : spotlightMeta?.score ? (
                  <span className="text-amber-300 font-bold">★ {(spotlightMeta.score / 10).toFixed(1)}</span>
                ) : null}
              </div>
              {spotlightSynopsis && (
                <p className="mt-2 sm:mt-3 max-w-xl text-[13px] sm:text-sm text-white/70 leading-relaxed line-clamp-2 sm:line-clamp-3">
                  {spotlightSynopsis}
                </p>
              )}
              {slide?.kind === 'shelf' && slide.item.total ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
                  <div className="h-1.5 w-40 rounded-full bg-white/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-lantern-400 to-jade-400"
                      style={{ width: `${Math.min(100, (slide.item.progress / slide.item.total) * 100)}%` }}
                    />
                  </div>
                  {slide.item.progress}/{slide.item.total} ep
                </div>
              ) : null}
              <div className="mt-4 sm:mt-5 flex flex-wrap gap-2">
                {spotlightOwned ? (
                  <>
                    <button type="button" onClick={() => onOpen(spotlightOwned)} className="btn-glow !py-2.5 !px-5 text-sm min-h-10">
                      ▶ Continue
                    </button>
                    <button
                      type="button"
                      onClick={() => onPremiere(spotlightOwned)}
                      className="h-10 min-h-10 px-4 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 border border-white/15"
                    >
                      🎬 Premiere
                    </button>
                  </>
                ) : slide?.kind === 'catalog' ? (
                  <>
                    <button
                      type="button"
                      disabled={add.isPending || added[slide.meta.id]}
                      onClick={() => addCatalog(slide.meta)}
                      className="btn-glow !py-2.5 !px-5 text-sm disabled:opacity-80 min-h-10"
                    >
                      {added[slide.meta.id] ? '✓ Added' : '➕ Add to vault'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openCatalog(slide.meta)}
                      className="h-10 min-h-10 px-4 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 border border-white/15"
                    >
                      Details
                    </button>
                  </>
                ) : null}
              </div>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 flex-col gap-2">
            <button type="button" onClick={prev} className="reel-nav !w-10 !h-10" aria-label="Previous">
              ‹
            </button>
            <button type="button" onClick={next} className="reel-nav !w-10 !h-10" aria-label="Next">
              ›
            </button>
          </div>

          {slides.length > 1 && (
            <div className="anime-spot-dots flex sm:hidden">
              {slides.map((s, i) => (
                <button
                  key={s.kind === 'shelf' ? s.item.id : s.meta.id}
                  type="button"
                  className={`anime-spot-dot ${i === index ? 'is-on' : ''}`}
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {browsing && (
        <div className="max-w-7xl mx-auto px-4 lg:px-6 mt-4">
          <div className="max-w-xl">
            <SearchBar
              value={search}
              onValueChange={onSearch}
              lockType="anime"
              placeholder="Search anime, or find new ones…"
              onPickShelf={onOpen}
              onOpenManualAdd={() => window.dispatchEvent(new CustomEvent('openAddModal'))}
            />
          </div>
        </div>
      )}

      {!browsing && (
        <div className="px-4 lg:px-6 pt-4">
          <SearchBar
            value={search}
            onValueChange={onSearch}
            lockType="anime"
            placeholder="Search anime, or find new ones…"
            onPickShelf={onOpen}
            onOpenManualAdd={() => window.dispatchEvent(new CustomEvent('openAddModal'))}
          />
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 lg:px-6 mt-6 space-y-8">
        {browsing && (
          <>
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8 lg:items-start">
              <div className="space-y-8 min-w-0">
                <AnimePosterRow
                  title="Continue watching"
                  items={watching.slice(0, 16).map((item) => ({
                    key: item.id,
                    title: item.title,
                    cover: item.poster_url,
                    badge: item.total ? `${item.progress}/${item.total}` : STATUS_LABELS[item.status],
                    subtitle: item.year ? String(item.year) : 'Anime',
                    onClick: () => onOpen(item),
                  }))}
                />
                <AnimePosterRow
                  title="Plan to watch"
                  items={planned.slice(0, 16).map((item) => ({
                    key: item.id,
                    title: item.title,
                    cover: item.poster_url,
                    subtitle: 'Up next',
                    onClick: () => onOpen(item),
                  }))}
                />
                <AnimePosterRow
                  title="Recently added"
                  items={recent.slice(0, 16).map((item) => ({
                    key: item.id,
                    title: item.title,
                    cover: item.poster_url,
                    subtitle: STATUS_LABELS[item.status],
                    onClick: () => onOpen(item),
                  }))}
                />
                <AnimePosterRow
                  title="Trending now"
                  items={(data?.trending ?? []).slice(0, 16).map((a) =>
                    toTile(a, openCatalog, { badge: a.score ? `★ ${(a.score / 10).toFixed(1)}` : undefined })
                  )}
                />
              </div>

              <aside className="mt-8 lg:mt-0 lg:sticky lg:top-4 glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display font-bold text-slate-900 dark:text-white">Top anime</h2>
                  <div className="flex gap-1 text-[11px] font-bold">
                    {(
                      [
                        ['trending', 'Now'],
                        ['popular', 'Popular'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTopRange(id)}
                        className={`px-2 py-1 rounded-lg ${
                          topRange === id ? 'chip-active' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <ol className="space-y-2.5">
                  {topList.slice(0, 8).map((a, i) => (
                    <li key={a.id} className={i >= 5 ? 'hidden lg:list-item' : undefined}>
                      <button type="button" onClick={() => openCatalog(a)} className="w-full flex items-center gap-3 text-left group">
                        <span className={`w-5 text-sm font-black tabular-nums ${i === 0 ? 'text-lantern-400' : 'text-slate-400'}`}>
                          {i + 1}
                        </span>
                        <img src={a.cover || ''} alt="" className="w-10 h-14 object-cover rounded-md ring-1 ring-white/10" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold line-clamp-2 text-slate-800 dark:text-white group-hover:text-lantern-400">
                            {a.title}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-white/40">
                            {a.format}
                            {a.score ? ` · ★ ${(a.score / 10).toFixed(1)}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>
            </div>

            <AnimePosterRow
              title="Upcoming anime"
              items={(data?.upcoming ?? []).map((a) => toTile(a, openCatalog, { subtitle: a.year ? String(a.year) : 'Soon' }))}
            />

            <section className="glass rounded-2xl overflow-hidden">
              <div className="px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between gap-3">
                <h2 className="font-display font-bold text-slate-900 dark:text-white">Estimated schedule</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                  {new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <div className="flex items-end gap-1 px-2 sm:px-4 overflow-x-auto">
                {DAYS.map((label, i) => {
                  const today = new Date().getDay()
                  const on = day === i
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setDay(i)}
                      className={`flex-1 min-w-[3.1rem] min-h-12 pb-2 pt-3 text-center border-b-2 transition-colors snap-start ${
                        on
                          ? 'border-lantern-400 text-slate-900 dark:text-white'
                          : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-white/70'
                      }`}
                    >
                      <span className="block text-[10px] font-bold uppercase tracking-widest opacity-70">
                        {i === today ? 'Today' : label}
                      </span>
                      <span className={`block text-lg sm:text-xl font-display font-extrabold ${on ? '' : 'opacity-70'}`}>
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
              <ul className="divide-y divide-slate-200/70 dark:divide-white/[0.06]">
                {(airingByDay[day] ?? []).slice(0, 12).map((slot) => {
                  const owned = shelfMatch(items, slot.media.id)
                  return (
                    <li key={`${slot.media.id}-${slot.episode}`} className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-5 py-2.5">
                      <span className="w-11 sm:w-12 shrink-0 text-[11px] sm:text-xs font-bold tabular-nums text-lantern-500">{clock(slot.airingAt)}</span>
                      <button type="button" onClick={() => openCatalog(slot.media)} className="flex-1 min-w-0 text-left text-sm font-medium truncate hover:text-lantern-400">
                        {slot.media.title}
                      </button>
                      {owned && <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider text-jade-400">On shelf</span>}
                      <button
                        type="button"
                        onClick={() => openCatalog(slot.media)}
                        className="shrink-0 h-9 min-h-9 px-2.5 sm:px-3 rounded-full text-[11px] font-semibold bg-white/5 border border-slate-200 dark:border-white/10 hover:border-lantern-400/50"
                      >
                        <span className="sm:hidden">Ep {slot.episode}</span>
                        <span className="hidden sm:inline">▶ Episode {slot.episode}</span>
                      </button>
                    </li>
                  )
                })}
                {(airingByDay[day] ?? []).length === 0 && (
                  <li className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400 text-center">Nothing airing this day.</li>
                )}
              </ul>
            </section>
          </>
        )}

        <section>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 min-w-0">
            <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900 dark:text-white mr-auto">Your collection</h2>
            <div className="seg overflow-x-auto w-full sm:w-auto">
              {STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => onStatus(s)} className={`seg-btn gap-1.5 ${status === s ? 'seg-on' : ''}`}>
                  {s === 'all' ? 'All' : STATUS_LABELS[s]}
                  <span className="text-[10px] opacity-60 tabular-nums">{counts[s]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="seg">
                <button type="button" onClick={() => onView('grid')} className={`seg-btn !px-2.5 ${view === 'grid' ? 'seg-on' : ''}`} aria-label="Grid">
                  ▦
                </button>
                <button type="button" onClick={() => onView('list')} className={`seg-btn !px-2.5 ${view === 'list' ? 'seg-on' : ''}`} aria-label="List">
                  ☰
                </button>
              </div>
              <button type="button" onClick={onCinema} disabled={!filtered.length} className="cinema-btn disabled:opacity-40">
                🎞️ Cinema
              </button>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-10 text-center">
              {items.length === 0 ? 'Your anime shelf is empty — add a title from Spotlight or search.' : 'No titles match that filter.'}
            </p>
          ) : view === 'list' ? (
            <div className="stagger space-y-4">
              {shown.map((item) => (
                <MediaRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
              {shown.map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
          )}
          {shown.length < filtered.length && (
            <div ref={sentinelRef} className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Showing {shown.length} of {filtered.length}…
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
