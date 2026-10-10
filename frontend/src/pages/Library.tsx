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

const MEDIA_TYPES: (MediaType | 'all')[] = ['all', 'anime', 'manga', 'manhwa', 'movie', 'tv']

export default function Library() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<SortOption>('recent')
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: items = [], isLoading, error, refetch } = useMediaItems()

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

  const selectedItem = items.find((i) => i.id === itemId) || null

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

        {/* Media type filter */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Type
          </h2>
          <div className="flex gap-2 flex-wrap">
            {MEDIA_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => handleMediaTypeChange(type)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  mediaType === type
                    ? 'bg-sky-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Status filter */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Status
          </h2>
          <FilterChips
            selectedStatus={status as Status | 'all'}
            onStatusChange={handleStatusChange}
            counts={counts}
          />
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
          <div className="flex gap-2 items-center flex-wrap">
            <ViewToggle onChange={setView} />
            <SortSelect value={sort} onChange={setSort} />
          </div>
          {(mediaType !== 'all' || status !== 'all' || searchQ) && (
            <button
              onClick={handleClearFilters}
              className="text-sm text-sky-600 dark:text-sky-400 hover:underline font-semibold"
            >
              Clear filters
            </button>
          )}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sorted.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {sorted.map((item) => (
              <MediaRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Floating action button (mobile) */}
      <button
        onClick={() => setShowAddModal(true)}
        className="lg:hidden fixed bottom-24 right-4 w-14 h-14 bg-sky-600 hover:bg-sky-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-colors"
        aria-label="Add item"
      >
        +
      </button>

      {/* Modals */}
      <AddItemModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
      <ItemDrawer item={selectedItem} />
    </>
  )
}
