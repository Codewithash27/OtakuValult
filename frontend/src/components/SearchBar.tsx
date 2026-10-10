import { useState, useRef, useEffect } from 'react'
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

export function SearchBar({ onOpenManualAdd }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showFullModal, setShowFullModal] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string>('all')

  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const debouncedQuery = useDebounce(query, 400)
  const { data: mediaItems = [] } = useMediaItems()
  const { data: searchData, isLoading, error, refetch } = useGlobalSearch(
    debouncedQuery,
    selectedType,
    showDropdown || showFullModal
  )

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

  const handleAddResult = async (result: SearchResult) => {
    setAddingId(result.external_id)
    setSelectedResult(result)
    setShowAddDialog(true)
    setAddingId(null)
  }

  const handleAddDialogClose = () => {
    setShowAddDialog(false)
    setSelectedResult(null)
  }

  return (
    <div ref={searchRef} className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        placeholder="Search your library and the web..."
        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
      />

      {/* Dropdown panel */}
      {showDropdown && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg z-40 max-h-96 overflow-y-auto">
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
                      window.location.href = `/?item=${item.id}`
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
                {(['all', 'anime', 'manga', 'movie', 'tv'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                      selectedType === t
                        ? 'bg-sky-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* Results */}
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {isLoading ? (
                  <p className="text-xs text-gray-500 text-center py-4">Searching...</p>
                ) : internetResults.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">No results</p>
                ) : (
                  <>
                    {internetResults.map((result) => (
                      <SearchResultCard
                        key={result.external_id}
                        result={result}
                        onAdd={handleAddResult}
                        isOnShelf={shelfItems.has(`${result.source}:${result.external_id}`)}
                        isAdding={addingId === result.external_id}
                      />
                    ))}
                    {searchData && searchData.results.length > 8 && (
                      <button
                        onClick={() => {
                          setShowDropdown(false)
                          setShowFullModal(true)
                        }}
                        className="w-full text-xs px-3 py-2 text-sky-600 dark:text-sky-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      >
                        See all results ({searchData.results.length})
                      </button>
                    )}
                  </>
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
          addingId={addingId}
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
