import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMediaItems } from '../hooks/useMediaItems'
import { MediaItem, MediaType, Status, detailHref } from '../types/media'
import { MediaCard } from '../components/MediaCard'
import { MediaRow } from '../components/MediaRow'
import { FilterChips } from '../components/FilterChips'
import { ViewToggle } from '../components/ViewToggle'
import { SortSelect, type SortOption } from '../components/SortSelect'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { Skeleton } from '../components/Skeleton'
import { AddItemModal } from '../components/AddItemModal'
import { ItemDrawer } from '../components/ItemDrawer'
import { PosterWall } from '../components/PosterWall'
import { ThemeFilter, ThemeRows } from '../components/ThemeBrowser'
import { useContentMode, useIsAdult, useItemMeta } from '../hooks/useAdultFilter'
import { THEMES, hasTheme } from '../lib/themes'

const MEDIA_TYPES: (MediaType | 'all')[] = ['all', 'anime', 'manga', 'manhwa']
const PAGE_SIZE = 60

const HERO_KANJI: Partial<Record<MediaType | 'all', string>> = {
  all: '宝',
  anime: 'アニメ',
  manga: '漫画',
  manhwa: '만화',
}

const HERO: Record<MediaType | 'all', { title: string; blurb: string }> = {
  all: { title: 'Vault', blurb: 'Every anime, manga and manhwa you love, in one place.' },
  anime: { title: 'Anime', blurb: 'Everything you watch, from airing seasons to all-time classics.' },
  manga: { title: 'Manga', blurb: 'Your reading shelf, chapter by chapter.' },
  manhwa: { title: 'Manhwa', blurb: 'Your webtoons and manhwa, sorted by the themes you like.' },
  movie: { title: 'Vault', blurb: '' },
  tv: { title: 'Vault', blurb: '' },
}

const splitParam = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

export default function Library({ fixedType }: { fixedType?: MediaType }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<SortOption>('recent')
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: allItems = [], isLoading, error, refetch } = useMediaItems()
  const [contentMode, setContentMode] = useContentMode()
  const isAdult = useIsAdult(allItems)
  const metaOf = useItemMeta(allItems)
  const tagsOf = useCallback((i: MediaItem) => metaOf(i)?.t, [metaOf])
  const [byTheme, setByTheme] = useState(false)
  const items = useMemo(
    () => (contentMode === 'clean' ? allItems.filter((i) => !isAdult(i)) : allItems),
    [allItems, contentMode, isAdult]
  )
  const hiddenCount = allItems.length - items.length

  useEffect(() => {
    const handleOpenAddModal = () => setShowAddModal(true)
    window.addEventListener('openAddModal', handleOpenAddModal)
    return () => window.removeEventListener('openAddModal', handleOpenAddModal)
  }, [])

  // Parse URL params
  const mediaType = fixedType ?? ((searchParams.get('type') as MediaType | null) || 'all')
  const selectedThemes = splitParam(searchParams.get('themes'))
  const selectedTags = splitParam(searchParams.get('tags'))
  const themesKey = searchParams.get('themes') || ''
  const tagsKey = searchParams.get('tags') || ''
  const status = (searchParams.get('status') as Status | null) || 'all'
  const searchQ = searchParams.get('q') || ''
  const itemId = searchParams.get('item')
  const showWall = searchParams.has('wall')

  const setShowWall = (on: boolean) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (on) next.set('wall', '1')
      else next.delete('wall')
      return next
    })

  const selectedItem = allItems.find((i) => i.id === itemId) || null

  const typeItems = useMemo(
    () => (mediaType === 'all' ? items : items.filter((i) => i.media_type === mediaType)),
    [items, mediaType]
  )

  const pendingTags = useMemo(
    () => (fixedType ? typeItems.filter((i) => i.source === 'anilist' && !tagsOf(i)).length : 0),
    [fixedType, typeItems, tagsOf]
  )

  // Filter items
  const filtered = useMemo(() => {
    let result = typeItems

    for (const theme of THEMES.filter((t) => themesKey.split(',').includes(t.id))) {
      result = result.filter((i) => hasTheme(tagsOf(i), theme))
    }
    for (const tag of tagsKey.split(',').filter(Boolean)) {
      result = result.filter((i) => tagsOf(i)?.includes(tag))
    }

    if (status !== 'all') {
      result = result.filter((i) => i.status === status)
    }

    if (searchQ) {
      const q = searchQ.toLowerCase()
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.notes?.toLowerCase().includes(q)
      )
    }

    return result
  }, [typeItems, themesKey, tagsKey, tagsOf, status, searchQ])

  // Sort items
  const sorted = useMemo(() => {
    const copy = [...filtered]
    if (sort === 'title-asc') {
      copy.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sort === 'rating-desc') {
      copy.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    }
    return copy
  }, [filtered, sort])

  const [limit, setLimit] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => setLimit(PAGE_SIZE), [mediaType, status, searchQ, sort, contentMode, themesKey, tagsKey])
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || limit >= sorted.length) return
    const observer = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && setLimit((l) => l + PAGE_SIZE),
      { rootMargin: '800px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [limit, sorted.length])
  const shown = sorted.slice(0, limit)

  // Count by status
  const counts = useMemo(() => {
    const result: Record<Status | 'all', number> = {
      all: typeItems.length,
      watching: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
      plan_to_watch: 0,
    }
    typeItems.forEach((i) => {
      result[i.status]++
    })
    return result
  }, [typeItems])

  const toggleListParam = (name: 'themes' | 'tags', value: string) => {
    setByTheme(false)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const list = splitParam(next.get(name))
      const updated = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
      if (updated.length) next.set(name, updated.join(','))
      else next.delete(name)
      return next
    })
  }

  const clearThemes = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('themes')
      next.delete('tags')
      return next
    })

  const openItem = (item: MediaItem) => {
    const href = detailHref(item)
    if (href) {
      navigate(href, { state: { from: window.location.pathname } })
      return
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('item', item.id)
      return next
    })
  }

  const handleStatusChange = (newStatus: Status | 'all') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (newStatus === 'all') {
        next.delete('status')
      } else {
        next.set('status', newStatus)
      }
      return next
    })
  }

  const handleMediaTypeChange = (newType: MediaType | 'all') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (newType === 'all') {
        next.delete('type')
      } else {
        next.set('type', newType)
      }
      return next
    })
  }

  const handleClearFilters = () => {
    setSearchParams('')
  }

  if (isLoading) {
    return <Skeleton count={8} view={view} />
  }

  return (
    <>
      <div className="max-w-7xl mx-auto">
        {error && <ErrorBanner error={error as Error} onRetry={() => refetch()} />}

        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl glass px-4 py-3 lg:px-5 mb-4 animate-fade-up">
          <div className="absolute -top-20 -right-10 w-48 h-48 rounded-full bg-gradient-to-br from-lantern-500/30 to-jade-500/20 blur-3xl animate-float" />
          <span className="pointer-events-none select-none absolute right-4 -bottom-6 font-jp font-bold text-[88px] leading-none text-white/[0.04]">
            {HERO_KANJI[mediaType] ?? '宝'}
          </span>
          <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h1 className="text-2xl lg:text-3xl font-bold leading-tight">
                The <span className="text-gradient">{HERO[mediaType].title}</span>
                {fixedType && ' Vault'}
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 truncate">{HERO[mediaType].blurb}</p>
            </div>
            <div className="flex gap-2">
              {[
                { label: 'Total', value: counts.all, color: 'from-violet-500 to-fuchsia-500' },
                { label: 'Watching', value: counts.watching, color: 'from-cyan-400 to-sky-500' },
                { label: 'Done', value: counts.completed, color: 'from-emerald-400 to-teal-500' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl px-3 py-1.5 bg-white/60 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 flex items-baseline gap-1.5"
                >
                  <span className={`text-lg font-display font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>
                    {s.value}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Filter toolbar */}
        <div className="glass rounded-2xl p-2.5 mb-4 space-y-2 animate-fade-up">
          <div className="flex flex-col lg:flex-row lg:items-center gap-2">
            {fixedType ? (
              <div className="min-w-0 lg:flex-1">
                <FilterChips compact selectedStatus={status as Status | 'all'} onStatusChange={handleStatusChange} counts={counts} />
              </div>
            ) : (
            <div className="flex gap-1 p-1 rounded-xl bg-slate-900/[0.04] dark:bg-black/20 overflow-x-auto">
              {MEDIA_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => handleMediaTypeChange(type)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-300 ${
                    mediaType === type
                      ? 'chip-active !scale-100'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
            )}
            <div className="flex items-center gap-2 lg:ml-auto flex-wrap shrink-0">
              <div
                role="radiogroup"
                aria-label="Content mode"
                className="relative flex p-1 rounded-xl bg-slate-900/[0.04] dark:bg-black/20"
                title={hiddenCount ? `${hiddenCount} adult item(s) hidden` : 'Creamy shows 18+, Clean hides it'}
              >
                <span
                  className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ${
                    contentMode === 'creamy'
                      ? 'left-1 bg-gradient-to-r from-vermilion-500 to-lantern-500 shadow-[0_4px_16px_-4px_rgba(248,74,37,.7)]'
                      : 'left-[calc(50%)] bg-gradient-to-r from-jade-500 to-cyan-500 shadow-[0_4px_16px_-4px_rgba(7,196,168,.7)]'
                  }`}
                />
                {(['creamy', 'clean'] as const).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={contentMode === m}
                    onClick={() => setContentMode(m)}
                    className={`relative z-10 w-[84px] py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      contentMode === m ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded-full border-2 grid place-items-center ${
                        contentMode === m ? 'border-white' : 'border-current'
                      }`}
                    >
                      {contentMode === m && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    {m === 'creamy' ? 'Creamy' : 'Clean'}
                    {m === 'clean' && hiddenCount > 0 && contentMode === 'clean' && (
                      <span className="text-[10px] px-1 rounded bg-white/25">-{hiddenCount}</span>
                    )}
                  </button>
                ))}
              </div>
              {((!fixedType && mediaType !== 'all') || status !== 'all' || searchQ || themesKey || tagsKey) && (
                <button
                  onClick={handleClearFilters}
                  className="h-10 px-3 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
                >
                  ✕ Clear
                </button>
              )}
              <SortSelect value={sort} onChange={setSort} />
              <ViewToggle onChange={setView} />
              <button
                onClick={() => setShowWall(true)}
                disabled={!sorted.length}
                className="h-10 px-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-slate-900 to-jade-900 border border-jade-500/40 hover:shadow-[0_8px_30px_-8px_rgba(7,196,168,.7)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                title="Fullscreen poster wall"
              >
                🎞️ Cinema
              </button>
            </div>
          </div>
          {!fixedType && (
            <FilterChips compact selectedStatus={status as Status | 'all'} onStatusChange={handleStatusChange} counts={counts} />
          )}
          {fixedType && typeItems.length > 0 && (
          <ThemeFilter
            items={typeItems}
            tagsOf={tagsOf}
            selectedThemes={selectedThemes}
            selectedTags={selectedTags}
            onToggleTheme={(id) => toggleListParam('themes', id)}
            onToggleTag={(name) => toggleListParam('tags', name)}
            onClear={clearThemes}
            pending={pendingTags}
            byTheme={byTheme}
            onToggleByTheme={() => setByTheme((b) => !b)}
          />
          )}
        </div>

        {/* Items */}
        {byTheme && fixedType && !themesKey && !tagsKey ? (
          <ThemeRows
            items={filtered}
            tagsOf={tagsOf}
            onOpen={openItem}
            onSeeAll={(id) => toggleListParam('themes', id)}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            title={
              items.length === 0 ? 'Your shelf is empty' : 'No results found'
            }
            description={
              items.length === 0
                ? 'Start adding items to your library'
                : 'Try adjusting your filters'
            }
            onAddClick={items.length === 0 ? () => setShowAddModal(true) : undefined}
          />
        ) : view === 'grid' ? (
          <div key={`${mediaType}-${status}-${sort}`} className="stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {shown.map((item, i) => (
              <div key={item.id} style={{ animationDelay: `${Math.min(i % PAGE_SIZE, 15) * 45}ms` }}>
                <MediaCard item={item} />
              </div>
            ))}
          </div>
        ) : (
          <div key={`${mediaType}-${status}-${sort}`} className="stagger space-y-4">
            {shown.map((item, i) => (
              <div key={item.id} style={{ animationDelay: `${Math.min(i % PAGE_SIZE, 15) * 40}ms` }}>
                <MediaRow item={item} />
              </div>
            ))}
          </div>
        )}
        {!(byTheme && fixedType && !themesKey && !tagsKey) && shown.length < sorted.length && (
          <div ref={sentinelRef} className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Showing {shown.length} of {sorted.length}…
          </div>
        )}
        {allItems.length === 0 && (
          <div className="-mt-10 pb-12 text-center">
            <Link to="/import" className="text-sm font-semibold text-violet-500 hover:underline">
              or import your list from AniList / MyAnimeList →
            </Link>
          </div>
        )}
      </div>

      {/* Floating action button (mobile) */}
      <button
        onClick={() => setShowAddModal(true)}
        className="lg:hidden fixed bottom-28 right-5 w-14 h-14 btn-glow !rounded-full !p-0 text-2xl animate-float"
        aria-label="Add item"
      >
        +
      </button>

      {/* Modals */}
      <AddItemModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
      {showWall && <PosterWall items={sorted} onClose={() => setShowWall(false)} />}
      <ItemDrawer item={selectedItem} />
    </>
  )
}
