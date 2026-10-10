import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MediaItem } from '../types/media'
import { useDeleteItem } from '../hooks/useMediaMutations'
import { useToast } from './Toast'
import { PosterImage } from './PosterImage'
import { StatusBadge } from './StatusBadge'
import { RatingStars } from './RatingStars'
import { ProgressBar } from './ProgressBar'
import { ConfirmDialog } from './ConfirmDialog'

interface MediaCardProps {
  item: MediaItem
}

export function MediaCard({ item }: MediaCardProps) {
  const [, setSearchParams] = useSearchParams()
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const { mutate: deleteItem, isPending: isDeleting } = useDeleteItem()
  const { showToast } = useToast()

  const handleOpenDrawer = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('item', item.id)
      return next
    })
  }

  const handleDelete = () => {
    deleteItem(item.id, {
      onSuccess: () => {
        showToast(`Deleted "${item.title}"`, 'success')
        setShowConfirmDelete(false)
      },
      onError: (error: any) => {
        showToast(error.message || 'Failed to delete', 'error')
      },
    })
  }

  return (
    <>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-all overflow-hidden cursor-pointer group"
        onClick={handleOpenDrawer}
      >
        <div className="relative">
          <PosterImage
            src={item.poster_url}
            alt={item.title}
            mediaType={item.media_type}
            className="w-full aspect-[2/3]"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleOpenDrawer()
              }}
              className="p-2 bg-white hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Edit"
            >
              ✎
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowConfirmDelete(true)
              }}
              className="p-2 bg-white hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Delete"
            >
              🗑
            </button>
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate mb-2">
            {item.title}
          </h3>
          {item.year && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{item.year}</p>
          )}
          <div className="mb-3">
            <StatusBadge status={item.status} size="sm" />
          </div>
          {item.rating && (
            <div className="mb-3">
              <RatingStars rating={item.rating} size="sm" />
            </div>
          )}
          {item.total && <ProgressBar progress={item.progress} total={item.total} />}
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
    </>
  )
}
