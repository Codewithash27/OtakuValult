import { useEffect, useRef, useState } from 'react'
import { useSearch, SearchResult } from '../hooks/useSearch'
import { SearchResults } from './SearchResults'
import { useToast } from './Toast'
import { useAddItem } from '../hooks/useMediaMutations'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [mediaType, setMediaType] = useState<'all' | 'anime' | 'manga' | 'movie' | 'tv'>('all')
  const { data: searchData, isLoading } = useSearch(query, mediaType, isOpen && query.length >= 2)
  const { mutate: addItem } = useAddItem()
  const { showToast } = useToast()

  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleAddResult = (result: SearchResult) => {
    const title = result.title
    const mediaTypeMap: Record<string, any> = {
      anime: 'anime',
      manga: 'manga',
      manhwa: 'manhwa',
      movie: 'movie',
      tv: 'tv',
    }

    addItem(
      {
        media_type: mediaTypeMap[result.media_type] || result.media_type,
        title,
        year: result.year,
        poster_url: result.poster_url,
        status: 'plan_to_watch',
        rating: null,
        progress: 0,
        total: result.total,
        notes: result.overview ? `From ${result.source}: ${result.overview}` : null,
      },
      {
        onSuccess: () => {
          showToast(`Added "${title}" from ${result.source}`, 'success')
        },
        onError: (error: any) => {
          if (error.code === '23505') {
            showToast('Already on your shelf', 'error')
          } else {
            showToast(error.message || 'Failed to add item', 'error')
          }
        },
      }
    )
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        role="presentation"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
        role="dialog"
        aria-labelledby="search-title"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-2xl w-full p-6 my-8">
          <h2
            id="search-title"
            className="text-2xl font-bold text-gray-900 dark:text-white mb-4"
          >
            Search & Add
          </h2>

          {/* Search box */}
          <div className="mb-4">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search AniList, TMDB... (min 2 chars)"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Type filter */}
          <div className="mb-6">
            <div className="flex gap-2 flex-wrap">
              {(['all', 'anime', 'manga', 'movie', 'tv'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setMediaType(type)}
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

          {/* Results */}
          <div className="mb-6 max-h-96 overflow-y-auto">
            <SearchResults
              results={searchData?.results || []}
              errors={searchData?.errors || {}}
              onAddClick={handleAddResult}
              isLoading={isLoading}
            />
          </div>

          {/* Close button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
