import { useState, useRef, useEffect, Component, ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMediaItems } from '../hooks/useMediaItems'
import { useGlobalSearch } from '../hooks/useGlobalSearch'
import { useDebounce } from '../hooks/useDebounce'
import { SearchResult } from '../types/search'
import { SearchResultCard } from './SearchResultCard'
import { SearchResultsModal } from './SearchResultsModal'
import { AddFromSearchDialog } from './AddFromSearchDialog'

interface SearchBarProps {
  onOpenManualAdd?: () => void
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

export function SearchBar({ onOpenManualAdd }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showFullModal, setShowFullModal] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [selectedType, setSelectedType] = useState<string>('all')

  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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
        .filter((item) =>
          item.title.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 5)
    : []

  // Internet results (first 8)
  const internetResults = searchData?.results.slice(0, 8) || []
  const searchPending =
    query.trim().length >= 2 &&
    (query.trim() !== debouncedQuery.trim() ||
      ((isLoading || isFetching) && internetResults.length === 0))

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
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
            setQuery(e.target.value)
            setShowDropdown(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search anime, manga, manhwa…"
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
              setQuery('')
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

      {/* Dropdown panel */}
      {showDropdown && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-strong rounded-2xl shadow-2xl z-40 max-h-[70vh] overflow-y-auto animate-fade-up [animation-duration:.25s]">
          {/* On my shelf section */}
          {localMatches.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700">
                On my shelf
              </div>
              <div className="space-y-2 p-3">
                {localMatches.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setShowDropdown(false)
                      setSearchParams({ item: item.id })
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {item.media_type}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* From the internet section */}
          {query.trim().length >= 2 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700">
                From the internet
              </div>

              {/* Type tabs */}
              <div className="px-3 py-2 flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                {(['all', 'anime', 'manga', 'manhwa'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={`chip !px-3 !py-1 !text-xs ${selectedType === t ? 'chip-active' : ''}`}
                  >
                    {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* Results */}
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {searchPending ? (
                  <p className="text-xs text-gray-500 text-center py-4">Searching...</p>
                ) : error ? (
                  <div className="text-center py-4 px-2">
                    <p className="text-xs text-red-500">
                      {error instanceof Error ? error.message : 'Search failed'}
                    </p>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="mt-2 text-xs text-sky-600 dark:text-sky-400"
                    >
                      Retry
                    </button>
                  </div>
                ) : internetResults.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">No results</p>
                ) : (
                  <SearchPanelBoundary>
                    {internetResults.map((result) => (
                      <SearchResultCard
                        key={`${result.source}:${result.external_id}`}
                        result={result}
                        onAdd={handleAddResult}
                        isOnShelf={shelfItems.has(`${result.source}:${result.external_id}`)}
                        isAdding={false}
                      />
                    ))}
                    {searchData && searchData.results.length > 8 && (
                      <button
                        type="button"
                        onClick={() => setShowFullModal(true)}
                        className="w-full text-xs px-3 py-2 text-sky-600 dark:text-sky-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      >
                        See all results ({searchData.results.length})
                      </button>
                    )}
                  </SearchPanelBoundary>
                )}
              </div>

              {/* Error note */}
              {searchData?.errors && Object.keys(searchData.errors).length > 0 && (
                <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/10">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    {Object.values(searchData.errors)[0]}
                  </p>
                </div>
              )}

              {/* Footer */}
              <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                <button
                  onClick={() => {
                    setShowDropdown(false)
                    onOpenManualAdd?.()
                  }}
                  className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Can't find it? Add manually
                </button>
              </div>
            </div>
          )}
        </div>
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
