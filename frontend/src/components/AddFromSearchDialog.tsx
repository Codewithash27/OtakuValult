import { useRef, useEffect, useState } from 'react'
import { SearchResult } from '../types/search'
import { Status } from '../types/media'
import { useAddItem } from '../hooks/useMediaMutations'
import { useToast } from './Toast'
import { PosterImage } from './PosterImage'

interface AddFromSearchDialogProps {
  result: SearchResult | null
  isOpen: boolean
  onClose: () => void
}

export function AddFromSearchDialog({ result, isOpen, onClose }: AddFromSearchDialogProps) {
  const statusRef = useRef<HTMLSelectElement>(null)
  const { mutate: addItem, isPending } = useAddItem()
  const { showToast } = useToast()

  const [status, setStatus] = useState<Status>('plan_to_watch')
  const [rating, setRating] = useState('')

  useEffect(() => {
    if (isOpen) {
      statusRef.current?.focus()
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

  const handleSave = () => {
    if (!result) return

    const ratingNum = rating ? parseInt(rating) : null
    if (ratingNum && (ratingNum < 1 || ratingNum > 10)) {
      showToast('Rating must be between 1 and 10', 'error')
      return
    }

    addItem(
      {
        media_type: result.media_type as any,
        title: result.title,
        year: result.year,
        poster_url: result.poster_url,
        status,
        rating: ratingNum,
        progress: 0,
        total: result.total,
        notes: result.overview || null,
      },
      {
        onSuccess: () => {
          showToast(`Added "${result.title}"`, 'success')
          onClose()
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

  if (!isOpen || !result) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        role="presentation"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-labelledby="add-dialog-title"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-sm w-full p-6">
          <div className="flex gap-4 mb-4">
            <PosterImage
              src={result.poster_url}
              alt={result.title}
              mediaType={result.media_type as any}
              className="w-20 h-32 rounded flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h3 id="add-dialog-title" className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2">
                {result.title}
              </h3>
              {result.alt_title && (
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 mb-2">
                  {result.alt_title}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-500">
                From {result.source}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                ref={statusRef}
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              >
                <option value="plan_to_watch">Plan to Watch</option>
                <option value="watching">Watching</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>

            {/* Rating */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Rating (1-10)
              </label>
              <input
                type="number"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                min="1"
                max="10"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                placeholder="Optional"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold transition-colors disabled:cursor-not-allowed text-sm"
              >
                {isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
