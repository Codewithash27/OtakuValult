import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SearchResponse, SearchResult } from '../types/search'
import { SearchResultCard } from './SearchResultCard'
import { ErrorBanner } from './ErrorBanner'

interface SearchResultsModalProps {
  query: string
  type: string
  data: SearchResponse | null
  isLoading: boolean
  error: Error | null
  onClose: () => void
  onAdd: (result: SearchResult) => void
  onRetry: () => void
  existingItems: Set<string>
  addingId: string | null
}

export function SearchResultsModal({
  query,
  type,
  data,
  isLoading,
  error,
  onClose,
  onAdd,
  onRetry,
  existingItems,
  addingId,
}: SearchResultsModalProps) {
  const [selectedType, setSelectedType] = useState(type)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const filteredResults = data?.results.filter((r) => {
    if (selectedType === 'all') return true
    if (selectedType === 'manga') return r.media_type === 'manga' || r.media_type === 'manhwa'
    return r.media_type === selectedType
  }) || []

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-[fadeIn_.25s_ease]"
        onClick={onClose}
        role="presentation"
      />
      <div
        ref={modalRef}
        className="fixed inset-0 z-50 lg:inset-auto lg:right-3 lg:top-3 lg:bottom-3 lg:w-[420px] lg:rounded-3xl glass-strong shadow-[0_30px_80px_-20px_rgba(124,58,237,.5)] flex flex-col overflow-hidden animate-[slideIn_.35s_cubic-bezier(.22,1,.36,1)]"
        role="dialog"
        aria-labelledby="search-results-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="search-results-title" className="font-semibold text-gray-900 dark:text-white">
            Results for "{query}"
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Type tabs */}
        <div className="px-4 pt-3 pb-2 flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {(['all', 'anime', 'manga', 'manhwa'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedType === t
                  ? 'bg-sky-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && <ErrorBanner error={error} onRetry={onRetry} />}

          {data?.errors && Object.keys(data.errors).length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">
                Some providers unavailable:
              </p>
              <div className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
                {Object.entries(data.errors).map(([provider, msg]) => (
                  <p key={provider}>{provider}: {msg}</p>
                ))}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse"
                >
                  <div className="w-16 h-24 bg-gray-200 dark:bg-gray-600 rounded flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredResults.length === 0 ? (
            <p className="text-center py-8 text-gray-600 dark:text-gray-400 text-sm">
              No results found
            </p>
          ) : (
            filteredResults.map((result) => (
              <SearchResultCard
                key={result.external_id}
                result={result}
                onAdd={onAdd}
                isOnShelf={existingItems.has(`${result.source}:${result.external_id}`)}
                isAdding={addingId === result.external_id}
              />
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
