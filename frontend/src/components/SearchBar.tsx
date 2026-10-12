import { useState, useRef, useEffect, Component, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { useMediaItems } from '../hooks/useMediaItems'
import { useGlobalSearch } from '../hooks/useGlobalSearch'
import { useDebounce } from '../hooks/useDebounce'
import { SearchResult } from '../types/search'
import { MediaItem } from '../types/media'
import { SearchResultCard } from './SearchResultCard'
import { SearchResultsModal } from './SearchResultsModal'
import { AddFromSearchDialog } from './AddFromSearchDialog'

type SearchType = 'all' | 'anime' | 'manga' | 'manhwa'

interface SearchBarProps {
  onOpenManualAdd?: () => void
  /** Keep the vault grid filtered to this query. */
  value?: string
  onValueChange?: (q: string) => void
  /** Limit internet + shelf results to this type (anime vault → anime, etc.). */
  lockType?: SearchType
  placeholder?: string
  onPickShelf?: (item: MediaItem) => void
}

class SearchPanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="text-xs text-red-500 text-center py-4 px-3">
          Could not show these results. Try a different title.
        </p>
      )
    }
    return this.props.children
  }
}

export function SearchBar({
  onOpenManualAdd,
  value,
  onValueChange,
  lockType = 'all',
  placeholder,
  onPickShelf,
}: SearchBarProps) {
  const [query, setQuery] = useState(value ?? '')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showFullModal, setShowFullModal] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [selectedType, setSelectedType] = useState<SearchType>(lockType)

  useEffect(() => {
    if (value !== undefined && value !== query) setQuery(value)
  }, [value])

  useEffect(() => {
    setSelectedType(lockType)
  }, [lockType])

  const setQ = (q: string, filterVault = false) => {
    setQuery(q)
    if (filterVault || q === '') onValueChange?.(q)
  }

  const searchRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [panel, setPanel] = useState({ top: 0, left: 0, width: 400 })
  const [, setSearchParams] = useSearchParams()

  const debouncedQuery = useDebounce(query, 400)
  const { data: mediaItems = [] } = useMediaItems()
  const { data: rawSearchData, isLoading, isFetching, error, refetch } = useGlobalSearch(
    debouncedQuery,
    selectedType === 'manhwa' ? 'manga' : selectedType,
    showDropdown || showFullModal
  )
  const searchData = rawSearchData && {
    ...rawSearchData,
    results: rawSearchData.results.filter((r) =>
      selectedType === 'manhwa' ? r.media_type === 'manhwa' : r.media_type !== 'movie' && r.media_type !== 'tv'
    ),
  }

  // Build set of items on shelf (source:external_id)
  const shelfItems = new Set(
    mediaItems
      .filter((item) => item.source && item.external_id)
      .map((item) => `${item.source}:${item.external_id}`)
  )

  // Local shelf matches
  const localMatches = query.trim()
    ? mediaItems
        .filter((item) => {
          if (lockType !== 'all' && item.media_type !== lockType) return false
          return item.title.toLowerCase().includes(query.toLowerCase())
        })
        .slice(0, 5)
    : []

  // Internet results (first 8)
  const internetResults = searchData?.results.slice(0, 8) || []
  const searchPending =
    query.trim().length >= 2 &&
    (query.trim() !== debouncedQuery.trim() ||
      ((isLoading || isFetching) && internetResults.length === 0))

  useEffect(() => {
    const place = () => {
      const el = searchRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const width = Math.min(Math.max(r.width, 380), window.innerWidth - 24)
      const left = Math.min(Math.max(12, r.right - width), window.innerWidth - width - 12)
      setPanel({ top: r.bottom + 8, left, width })
    }
    if (!showDropdown) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [showDropdown, query])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node
      if (searchRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setShowDropdown(false)
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDropdown(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  useEffect(() => {
    const focusOnSlash = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== '/' || el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (!inputRef.current?.offsetParent) return
      e.preventDefault()
      inputRef.current.focus()
    }
    window.addEventListener('keydown', focusOnSlash)
    return () => window.removeEventListener('keydown', focusOnSlash)
  }, [])

  const handleAddResult = (result: SearchResult) => {
    setSelectedResult(result)
    setShowAddDialog(true)
  }

  const handleAddDialogClose = () => {
    setShowAddDialog(false)
    setSelectedResult(null)
  }

  return (
    <div ref={searchRef} className="relative flex-1">
      <label className="search-pill cursor-text">
        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQ(e.target.value)
            setShowDropdown(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onValueChange?.(query)
              setShowDropdown(false)
            }
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder ?? 'Search your vault, or find new titles…'}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
        {isFetching && query.trim().length >= 2 && (
          <span className="w-3.5 h-3.5 shrink-0 rounded-full border-2 border-lantern-400 border-t-transparent animate-spin" />
        )}
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQ('')
              inputRef.current?.focus()
            }}
            className="w-6 h-6 shrink-0 grid place-items-center rounded-full text-xs text-slate-400 hover:text-white hover:bg-vermilion-500/80 transition-colors"
            aria-label="Clear search"
          >
            ✕
          </button>
        ) : (
          <kbd className="kbd hidden sm:grid">/</kbd>
        )}
      </label>

      {showDropdown &&
        query.trim() &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[80] glass-strong rounded-2xl overflow-hidden animate-fade-up [animation-duration:.2s]"
            style={{
              top: panel.top,
              left: panel.left,
              width: panel.width,
              maxHeight: 'min(70vh, 28rem)',
              boxShadow: '0 24px 60px -20px rgb(0 0 0 / .75)',
            }}
          >
            <div className="overflow-y-auto max-h-[min(70vh,28rem)]">
              {localMatches.length > 0 && (
                <div className="border-b border-white/10">
                  <p className="px-3.5 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500 dark:text-slate-400">
                    On your shelf
                  </p>
                  <div className="px-1.5 pb-2">
                    {localMatches.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setShowDropdown(false)
                          if (onPickShelf) onPickShelf(item)
                          else
                            setSearchParams((prev) => {
                              const next = new URLSearchParams(prev)
                              next.set('item', item.id)
                              return next
                            })
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 transition-colors"
                      >
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{item.media_type}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {query.trim().length >= 2 && (
                <div>
                  <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-500 dark:text-slate-400">
                      From the internet
                    </p>
                    <div className="flex gap-1">
                      {(['anime', 'manga', 'manhwa'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSelectedType(t)}
                          className={`chip !px-2 !py-0.5 !text-[10px] ${selectedType === t ? 'chip-active' : ''}`}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="px-1.5 pb-2 space-y-0.5">
                    {searchPending ? (
                      <p className="text-xs text-slate-500 text-center py-6">Searching…</p>
                    ) : error ? (
                      <div className="text-center py-5 px-2">
                        <p className="text-xs text-rose-400">{error instanceof Error ? error.message : 'Search failed'}</p>
                        <button type="button" onClick={() => refetch()} className="mt-2 text-xs text-lantern-400">
                          Retry
                        </button>
                      </div>
                    ) : internetResults.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">No results</p>
                    ) : (
                      <SearchPanelBoundary>
                        {internetResults.map((result) => (
                          <SearchResultCard
                            key={`${result.source}:${result.external_id}`}
                            result={result}
                            onAdd={handleAddResult}
                            isOnShelf={shelfItems.has(`${result.source}:${result.external_id}`)}
                            isAdding={false}
                            variant="vault"
                          />
                        ))}
                        {searchData && searchData.results.length > 8 && (
                          <button
                            type="button"
                            onClick={() => setShowFullModal(true)}
                            className="w-full text-xs py-2 text-lantern-400 hover:text-lantern-300"
                          >
                            See all results ({searchData.results.length})
                          </button>
                        )}
                      </SearchPanelBoundary>
                    )}
                  </div>

                  <div className="px-3.5 py-2.5 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDropdown(false)
                        onOpenManualAdd?.()
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-200"
                    >
                      Can&apos;t find it? Add manually
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Full results modal */}
      {showFullModal && searchData && (
        <SearchResultsModal
          query={query}
          type={selectedType}
          data={searchData}
          isLoading={isLoading}
          error={error}
          onClose={() => setShowFullModal(false)}
          onAdd={handleAddResult}
          onRetry={() => refetch()}
          existingItems={shelfItems}
          addingId={null}
        />
      )}

      {/* Add from search dialog */}
      <AddFromSearchDialog
        result={selectedResult}
        isOpen={showAddDialog}
        onClose={handleAddDialogClose}
      />
    </div>
  )
}
