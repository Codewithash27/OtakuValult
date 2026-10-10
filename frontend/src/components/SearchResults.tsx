import { useState } from 'react'
import { SearchResult } from '../hooks/useSearch'
import { PosterImage } from './PosterImage'
import { RatingStars } from './RatingStars'
import { useToast } from './Toast'

interface SearchResultsProps {
  results: SearchResult[]
  errors: Record<string, string>
  onAddClick: (result: SearchResult) => void
  isLoading?: boolean
}

export function SearchResults({
  results,
  errors,
  onAddClick,
  isLoading = false,
}: SearchResultsProps) {
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const { showToast } = useToast()

  const handleAdd = (result: SearchResult) => {
    if (addedIds.has(result.external_id)) {
      showToast('Already added to shelf', 'error')
      return
    }
    setAddedIds((prev) => new Set([...prev, result.external_id]))
    onAddClick(result)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 bg-white dark:bg-gray-800 rounded-lg p-4 animate-pulse">
            <div className="w-20 h-32 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">No results found</p>
        {Object.keys(errors).length > 0 && (
          <div className="mt-4 text-sm">
            {Object.entries(errors).map(([provider, error]) => (
              <p key={provider} className="text-red-600 dark:text-red-400">
                {provider}: {error}
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {Object.keys(errors).length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
          <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
            Some providers had errors:
          </p>
          <div className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
            {Object.entries(errors).map(([provider, error]) => (
              <p key={provider}>{provider}: {error}</p>
            ))}
          </div>
        </div>
      )}

      {results.map((result) => (
        <div
          key={result.external_id}
          className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow p-4 flex gap-4"
        >
          <div className="flex-shrink-0">
            <PosterImage
              src={result.poster_url}
              alt={result.title}
              mediaType={result.media_type as any}
              className="w-20 h-32 rounded"
            />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                  {result.title}
                </h3>
                <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded whitespace-nowrap">
                  {result.source}
                </span>
              </div>

              {result.alt_title && (
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate mb-1">
                  {result.alt_title}
                </p>
              )}

              <div className="flex flex-wrap gap-2 items-center text-sm text-gray-600 dark:text-gray-400 mb-2">
                {result.year && <span>{result.year}</span>}
                {result.total && <span>•</span>}
                {result.total && (
                  <span>
                    {result.media_type === 'anime' || result.media_type === 'tv'
                      ? `${result.total} eps`
                      : `${result.total} ch`}
                  </span>
                )}
                {result.rating && <span>•</span>}
                {result.rating != null && result.rating > 0 && (
                  <div>
                    <RatingStars rating={result.rating} size="sm" />
                  </div>
                )}
              </div>

              {result.overview && (
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {result.overview}
                </p>
              )}
            </div>

            <button
              onClick={() => handleAdd(result)}
              disabled={addedIds.has(result.external_id)}
              className="mt-3 self-start px-3 py-1 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm font-semibold rounded transition-colors"
            >
              {addedIds.has(result.external_id) ? '✓ Added' : '+ Add'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
