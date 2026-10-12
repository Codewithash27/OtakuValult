import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MediaItem, detailHref } from '../types/media'
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
  const navigate = useNavigate()
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

  const handleOpen = () => {
    const href = detailHref(item)
    if (href) navigate(href, { state: { from: window.location.pathname } })
    else handleOpenDrawer()
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

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`)
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
  }

  const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty('--rx', '0deg')
    e.currentTarget.style.setProperty('--ry', '0deg')
  }

  const iconBtn =
    'w-10 h-10 grid place-items-center rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white hover:bg-white/30 hover:scale-110 transition-all duration-300'

  return (
    <>
      <div
        className="card-3d card-ring glass rounded-2xl overflow-hidden cursor-pointer group"
        onClick={handleOpen}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <div className="poster-shine relative overflow-hidden">
          <PosterImage
            src={item.poster_url}
            alt={item.title}
            mediaType={item.media_type}
            className="w-full aspect-[2/3] transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
          <div className="glare absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-black/50 backdrop-blur-md text-white border border-white/15">
            {item.media_type}
          </span>
          {item.rating ? (
            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg">
              ★ {item.rating}
            </span>
          ) : null}

          <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 translate-y-3 group-hover:translate-y-0 transition-all duration-300">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleOpenDrawer()
              }}
              className={iconBtn}
              aria-label="Edit"
            >
              ✎
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowConfirmDelete(true)
              }}
              className={`${iconBtn} hover:!bg-rose-500/80`}
              aria-label="Delete"
            >
              🗑
            </button>
          </div>

          <div className="absolute bottom-0 inset-x-0 p-3" style={{ transform: 'translateZ(40px)' }}>
            <h3 className="font-display font-semibold text-white truncate drop-shadow-lg">{item.title}</h3>
            {item.year && <p className="text-xs text-white/70">{item.year}</p>}
          </div>
        </div>
        <div className="p-3 space-y-2.5">
          <StatusBadge status={item.status} size="sm" />
          {item.rating && <RatingStars rating={item.rating} size="sm" />}
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
