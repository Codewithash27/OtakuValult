import { useEffect, useRef, useState } from 'react'
import { MediaType, Status } from '../types/media'
import { useAddItem } from '../hooks/useMediaMutations'
import { useToast } from './Toast'
import { SearchModal } from './SearchModal'

interface AddItemModalProps {
  isOpen: boolean
  onClose: () => void
}

const MEDIA_TYPES: MediaType[] = ['anime', 'manga', 'manhwa', 'movie', 'tv']

export function AddItemModal({ isOpen, onClose }: AddItemModalProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const { mutate: addItem, isPending } = useAddItem()
  const { showToast } = useToast()
  const [showSearch, setShowSearch] = useState(false)

  const [mediaType, setMediaType] = useState<MediaType>('anime')
  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [status, setStatus] = useState<Status>('plan_to_watch')
  const [rating, setRating] = useState('')
  const [progress, setProgress] = useState('0')
  const [total, setTotal] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (isOpen && !showSearch) {
      titleRef.current?.focus()
    }
  }, [isOpen, showSearch])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      showToast('Title is required', 'error')
      return
    }

    if (posterUrl && !posterUrl.startsWith('http')) {
      showToast('Poster URL must start with http', 'error')
      return
    }

    const ratingNum = rating ? parseInt(rating) : null
    if (ratingNum && (ratingNum < 1 || ratingNum > 10)) {
      showToast('Rating must be between 1 and 10', 'error')
      return
    }

    const progressNum = parseInt(progress) || 0
    const totalNum = total ? parseInt(total) : null
    if (totalNum && progressNum > totalNum) {
      showToast('Progress cannot exceed total', 'error')
      return
    }

    addItem(
      {
        media_type: mediaType,
        title: trimmedTitle,
        year: year ? parseInt(year) : null,
        poster_url: posterUrl || null,
        status,
        rating: ratingNum,
        progress: progressNum,
        total: totalNum,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          showToast(`Added "${trimmedTitle}" to your shelf!`, 'success')
          resetForm()
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

  const resetForm = () => {
    setMediaType('anime')
    setTitle('')
    setYear('')
    setPosterUrl('')
    setStatus('plan_to_watch')
    setRating('')
    setProgress('0')
    setTotal('')
    setNotes('')
  }

  if (!isOpen) return null

  if (showSearch) {
    return (
      <SearchModal
        isOpen={showSearch}
        onClose={() => {
          setShowSearch(false)
          onClose()
        }}
      />
    )
  }

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
        aria-labelledby="add-item-title"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full p-6 my-8">
          <h2
            id="add-item-title"
            className="text-2xl font-bold text-gray-900 dark:text-white mb-4"
          >
            Add Item
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Media Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Type
              </label>
              <div className="flex gap-2 flex-wrap">
                {MEDIA_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setMediaType(type)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      mediaType === type
                        ? 'bg-sky-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Title *
              </label>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Series name"
              />
            </div>

            {/* Year */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Year
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min="1900"
                max="2100"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="2024"
              />
            </div>

            {/* Poster URL */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Poster URL
              </label>
              <input
                type="text"
                value={posterUrl}
                onChange={(e) => setPosterUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                placeholder="https://..."
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Leave empty for no rating"
              />
            </div>

            {/* Progress */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Progress
              </label>
              <input
                type="number"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Total */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Total Episodes/Chapters
              </label>
              <input
                type="number"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Leave empty if unknown"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                placeholder="Your thoughts..."
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors font-semibold"
              >
                🔍 Search
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold transition-colors disabled:cursor-not-allowed"
              >
                {isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
