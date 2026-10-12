import { SearchResult } from '../types/search'
import { PosterImage } from './PosterImage'
import { RatingStars } from './RatingStars'

interface SearchResultCardProps {
  result: SearchResult
  onAdd: (result: SearchResult) => void
  isOnShelf?: boolean
  isAdding?: boolean
  variant?: 'default' | 'vault'
}

export function SearchResultCard({
  result,
  onAdd,
  isOnShelf = false,
  isAdding = false,
  variant = 'default',
}: SearchResultCardProps) {
  const openAdd = () => {
    if (!isOnShelf && !isAdding) onAdd(result)
  }
  const vault = variant === 'vault'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openAdd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openAdd()
        }
      }}
      className={`flex gap-3 p-2.5 rounded-xl transition-colors ${
        vault
          ? `hover:bg-white/10 ${isOnShelf ? 'cursor-default' : 'cursor-pointer'}`
          : `bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg p-3 ${isOnShelf ? 'cursor-default' : 'cursor-pointer'}`
      }`}
    >
      <div className="flex-shrink-0">
        <PosterImage
          src={result.poster_url}
          alt={result.title}
          mediaType={result.media_type as any}
          className="w-16 h-24 rounded"
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                {result.title}
              </h3>
              {result.alt_title && (
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                  {result.alt_title}
                </p>
              )}
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 uppercase tracking-wide ${
              vault ? 'bg-white/10 text-white/50' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}>
              {result.source}
            </span>
          </div>

          <div className="flex flex-wrap gap-1 text-xs text-gray-600 dark:text-gray-400 mb-1">
            {result.media_type && (
              <span className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                {result.media_type}
              </span>
            )}
            {result.year && <span>•</span>}
            {result.year && <span>{result.year}</span>}
            {result.total && <span>•</span>}
            {result.total && (
              <span>
                {result.media_type === 'anime' || result.media_type === 'tv'
                  ? `${result.total} eps`
                  : `${result.total} ch`}
              </span>
            )}
          </div>

          {result.rating != null && result.rating > 0 && (
            <div className="mb-1">
              <RatingStars rating={result.rating} size="sm" />
            </div>
          )}

          {result.overview && (
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
              {result.overview}
            </p>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onAdd(result)
          }}
          disabled={isOnShelf || isAdding}
          className={
            vault
              ? 'mt-2 self-start h-7 px-2.5 rounded-lg text-[11px] font-bold text-white bg-gradient-to-br from-lantern-500 to-vermilion-600 disabled:opacity-50'
              : 'mt-2 self-start px-2 py-1 text-xs bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-semibold rounded transition-colors'
          }
        >
          {isOnShelf ? '✓ On shelf' : isAdding ? '...' : '+ Add'}
        </button>
      </div>
    </div>
  )
}
