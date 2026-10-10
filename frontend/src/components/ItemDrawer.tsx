import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MediaItem, Status } from '../types/media'
import { useUpdateItem, useDeleteItem } from '../hooks/useMediaMutations'
import { useToast } from './Toast'
import { PosterImage } from './PosterImage'
import { ConfirmDialog } from './ConfirmDialog'

interface ItemDrawerProps {
  item: MediaItem | null
}

export function ItemDrawer({ item }: ItemDrawerProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const drawerRef = useRef<HTMLDivElement>(null)
  const { mutate: updateItem, isPending: isUpdating } = useUpdateItem()
  const { mutate: deleteItem, isPending: isDeleting } = useDeleteItem()
  const { showToast } = useToast()

  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false)

  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<Status>('plan_to_watch')
  const [rating, setRating] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState<number | null>(null)
  const [notes, setNotes] = useState('')

  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (item) {
      setTitle(item.title)
      setStatus(item.status)
      setRating(item.rating)
      setProgress(item.progress)
      setTotal(item.total)
      setNotes(item.notes || '')
      setIsDirty(false)
    }
  }, [item])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isDirty) {
          setShowConfirmDiscard(true)
        } else {
          closeDrawer()
        }
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isDirty])

  const isOpen = searchParams.has('item')
  const closeDrawer = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('item')
      return next
    })
  }

  const handleSave = () => {
    if (!item) return

    const updates: Partial<MediaItem> = {}
    let changed = false

    if (title !== item.title) {
      updates.title = title
      changed = true
    }
    if (status !== item.status) {
      updates.status = status
      changed = true
    }
    if (rating !== item.rating) {
      updates.rating = rating
      changed = true
    }
    if (progress !== item.progress) {
      updates.progress = progress
      changed = true
    }
    if (total !== item.total) {
      updates.total = total
      changed = true
    }
    if (notes !== (item.notes || '')) {
      updates.notes = notes || null
      changed = true
    }

    if (!changed) {
      showToast('No changes to save', 'error')
      return
    }

    // Auto-complete: if status set to completed and total exists, set progress = total
    if (status === 'completed' && total && progress !== total) {
      updates.progress = total
    }

    updateItem(
      { id: item.id, data: updates },
      {
        onSuccess: () => {
          showToast('Changes saved', 'success')
          setIsDirty(false)
          closeDrawer()
        },
        onError: (error: any) => {
          showToast(error.message || 'Failed to save changes', 'error')
        },
      }
    )
  }

  const handleDelete = () => {
    if (!item) return
    deleteItem(item.id, {
      onSuccess: () => {
        showToast(`Deleted "${item.title}"`, 'success')
        closeDrawer()
      },
      onError: (error: any) => {
        showToast(error.message || 'Failed to delete', 'error')
      },
    })
  }

  const handleProgressIncrement = () => {
    if (total && progress < total) {
      setProgress(progress + 1)
      setIsDirty(true)
    }
  }

  if (!isOpen || !item) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={closeDrawer}
        role="presentation"
      />
      <div
        ref={drawerRef}
        className="fixed inset-y-0 right-0 w-full lg:w-96 bg-white dark:bg-gray-800 shadow-xl z-50 overflow-y-auto flex flex-col"
        role="dialog"
        aria-labelledby="drawer-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="drawer-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Edit Item
          </h2>
          <button
            onClick={() => {
              if (isDirty) {
                setShowConfirmDiscard(true)
              } else {
                closeDrawer()
              }
            }}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 space-y-6">
          {/* Poster */}
          <div className="flex justify-center">
            <PosterImage
              src={item.poster_url}
              alt={item.title}
              mediaType={item.media_type}
              className="w-32 h-48 rounded-lg shadow"
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setIsDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as Status)
                setIsDirty(true)
              }}
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
              value={rating || ''}
              onChange={(e) => {
                setRating(e.target.value ? parseInt(e.target.value) : null)
                setIsDirty(true)
              }}
              min="1"
              max="10"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Progress
              </label>
              {total && (
                <button
                  onClick={handleProgressIncrement}
                  disabled={progress >= total}
                  className="px-2 py-1 text-xs bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded transition-colors"
                >
                  +1
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={progress}
                onChange={(e) => {
                  setProgress(Math.max(0, parseInt(e.target.value) || 0))
                  setIsDirty(true)
                }}
                min="0"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              {total && (
                <>
                  <span className="flex items-center text-gray-600 dark:text-gray-400">/</span>
                  <input
                    type="number"
                    value={total || ''}
                    onChange={(e) => {
                      setTotal(e.target.value ? parseInt(e.target.value) : null)
                      setIsDirty(true)
                    }}
                    min="0"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                setIsDirty(true)
              }}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <button
            onClick={handleSave}
            disabled={!isDirty || isUpdating}
            className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            {isUpdating ? 'Saving...' : 'Save changes'}
          </button>
          <button
            onClick={() => setShowConfirmDelete(true)}
            disabled={isDeleting}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        title="Delete item?"
        message={`Delete "${item.title}" from your shelf? This can't be undone.`}
        confirmLabel="Delete"
        isDangerous
        isOpen={showConfirmDelete}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirmDelete(false)}
      />

      <ConfirmDialog
        title="Discard changes?"
        message="You have unsaved changes. Are you sure you want to close?"
        confirmLabel="Discard"
        isDangerous
        isOpen={showConfirmDiscard}
        onConfirm={closeDrawer}
        onCancel={() => setShowConfirmDiscard(false)}
      />
    </>
  )
}
