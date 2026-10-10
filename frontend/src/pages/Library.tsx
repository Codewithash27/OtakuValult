import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMediaItems } from '../hooks/useMediaItems'
import { MediaType, Status } from '../types/media'
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
import { useContentMode, useIsAdult } from '../hooks/useAdultFilter'

const MEDIA_TYPES: (MediaType | 'all')[] = ['all', 'anime', 'manga', 'manhwa', 'movie', 'tv']

export default function Library() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<SortOption>('recent')
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: allItems = [], isLoading, error, refetch } = useMediaItems()
  const [contentMode, setContentMode] = useContentMode()
  const isAdult = useIsAdult(allItems)
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
  const mediaType = (searchParams.get('type') as MediaType | null) || 'all'
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

  // Filter items
  const filtered = useMemo(() => {
    let result = items

    if (mediaType !== 'all') {
      result = result.filter((i) => i.media_type === mediaType)
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
  }, [items, mediaType, status, searchQ])

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

  // Count by status
  const counts = useMemo(() => {
    const result: Record<Status | 'all', number> = {
      all: items.length,
      watching: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
      plan_to_watch: 0,
    }
    items.forEach((i) => {
      result[i.status]++
    })
    return result
  }, [items])

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
        <section className="relative overflow-hidden rounded-3xl glass p-6 lg:p-8 mb-8 animate-fade-up">
          <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-gradient-to-br from-violet-600/40 to-pink-500/30 blur-3xl animate-float" />
          <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-500 dark:text-violet-300 mb-2">
                Your collection
              </p>
              <h1 className="text-4xl lg:text-5xl font-bold">
                The <span className="text-gradient">Vault</span>
              </h1>
              <p className="mt-2 text-slate-500 dark:text-slate-400 max-w-md">
                Every anime, manga, movie and show you love, in one place.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 stagger">
              {[
                { label: 'Total', value: counts.all, color: 'from-violet-500 to-fuchsia-500' },
                { label: 'Watching', value: counts.watching, color: 'from-cyan-400 to-sky-500' },
                { label: 'Completed', value: counts.completed, color: 'from-emerald-400 to-teal-500' },
              ].map((s, i) => (
                <div
                  key={s.label}
                  style={{ animationDelay: `${150 + i * 100}ms` }}
                  className="rounded-2xl px-4 py-3 min-w-[92px] bg-white/60 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 hover:-translate-y-1 transition-transform duration-300"
                >
                  <div className={`text-3xl font-display font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>
                    {s.value}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Filter toolbar */}
        <div className="glass rounded-2xl p-3 mb-6 space-y-3 animate-fade-up">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
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
                  {type === 'all' ? 'All' : type === 'tv' ? 'TV' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 md:ml-auto flex-wrap">
              <div
                role="radiogroup"
                aria-label="Content mode"
                className="relative flex p-1 rounded-xl bg-slate-900/[0.04] dark:bg-black/20"
                title={hiddenCount ? `${hiddenCount} adult item(s) hidden` : 'Creamy shows 18+, Clean hides it'}
              >
                <span
                  className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ${
                    contentMode === 'creamy'
                      ? 'left-1 bg-gradient-to-r from-rose-500 to-pink-600 shadow-[0_4px_16px_-4px_rgba(244,63,94,.7)]'
                      : 'left-[calc(50%)] bg-gradient-to-r from-emerald-400 to-cyan-500 shadow-[0_4px_16px_-4px_rgba(34,211,238,.7)]'
                  }`}
                />
                {(['creamy', 'clean'] as const).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={contentMode === m}
                    onClick={() => setContentMode(m)}
                    className={`relative z-10 w-[92px] py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
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
              {(mediaType !== 'all' || status !== 'all' || searchQ) && (
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
                className="h-10 px-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-slate-900 to-violet-900 border border-violet-500/40 hover:shadow-[0_8px_30px_-8px_rgba(124,58,237,.8)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                title="Fullscreen poster wall"
              >
                🎞️ Cinema
              </button>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-white/10 to-transparent" />
          <FilterChips
            selectedStatus={status as Status | 'all'}
            onStatusChange={handleStatusChange}
            counts={counts}
          />
        </div>

        {/* Items */}
        {sorted.length === 0 ? (
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
            {sorted.map((item, i) => (
              <div key={item.id} style={{ animationDelay: `${Math.min(i, 15) * 45}ms` }}>
                <MediaCard item={item} />
              </div>
            ))}
          </div>
        ) : (
          <div key={`${mediaType}-${status}-${sort}`} className="stagger space-y-4">
            {sorted.map((item, i) => (
              <div key={item.id} style={{ animationDelay: `${Math.min(i, 15) * 40}ms` }}>
                <MediaRow item={item} />
              </div>
            ))}
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
