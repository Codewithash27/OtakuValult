import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MediaItem, Status } from '../types/media'
import { useUpdateItem, useDeleteItem } from '../hooks/useMediaMutations'
import { useToast } from './Toast'
import { PosterImage } from './PosterImage'
import { ConfirmDialog } from './ConfirmDialog'
import { WatchLinks } from './WatchLinks'
import { AdultToggle } from './AdultToggle'
import { TitlePanels } from './TitlePanels'
import { useMediaDescription } from '../hooks/useMediaDescription'
import { anilistId } from '../types/media'

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
  const [tab, setTab] = useState<'details' | 'panels'>('details')

  useEffect(() => setTab('details'), [item?.id])

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

  const handleProgressDecrement = () => {
    if (progress > 0) {
      setProgress(progress - 1)
      setIsDirty(true)
    }
  }

  const requestClose = () => (isDirty ? setShowConfirmDiscard(true) : closeDrawer())

  const { data: fetchedSynopsis, isLoading: synopsisLoading } = useMediaDescription(item, isOpen)
  const hasAnilist = item ? anilistId(item) !== null : false
  const synopsis =
    fetchedSynopsis ?? (!hasAnilist && item?.notes?.trim() ? item.notes.trim() : null)

  if (!isOpen || !item) return null

  const label = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5'
  const field = 'input-premium !py-2 !px-3 text-sm'
  const stepBtn =
    'w-9 h-9 shrink-0 grid place-items-center rounded-lg border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] font-bold text-slate-600 dark:text-slate-300 hover:border-violet-400 hover:text-violet-500 disabled:opacity-40 transition-all'
  const pct = total ? Math.min(100, Math.round((progress / total) * 100)) : 0

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-[fadeIn_.25s_ease]"
        onClick={requestClose}
        role="presentation"
      />
      <div
        ref={drawerRef}
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] sm:inset-y-3 sm:right-3 sm:rounded-3xl glass-strong shadow-[0_30px_80px_-20px_rgba(124,58,237,.5)] flex flex-col overflow-hidden animate-[slideIn_.35s_cubic-bezier(.22,1,.36,1)]"
        role="dialog"
        aria-labelledby="drawer-title"
      >
        {/* Header */}
        <div className="relative shrink-0 overflow-hidden">
          {item.poster_url && (
            <img src={item.poster_url} alt="" className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-40" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white dark:to-[#0e0c1d]" />
          <div className="relative flex gap-4 p-4">
            <PosterImage
              src={item.poster_url}
              alt={item.title}
              mediaType={item.media_type}
              className="w-20 h-28 shrink-0 rounded-xl shadow-[0_12px_30px_-8px_rgba(124,58,237,.7)] ring-1 ring-white/20"
            />
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-start justify-between gap-2">
                <span id="drawer-title" className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-500 dark:text-violet-300">
                  Edit · {item.media_type}{item.year ? ` · ${item.year}` : ''}
                </span>
                <button
                  onClick={requestClose}
                  className="w-8 h-8 -mt-1 -mr-1 shrink-0 grid place-items-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 hover:rotate-90 transition-all duration-300"
                  aria-label="Close drawer"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setIsDirty(true)
                }}
                rows={2}
                className="mt-1 w-full resize-none bg-transparent font-display font-bold text-lg leading-snug text-slate-900 dark:text-white outline-none rounded-lg px-1 -mx-1 hover:bg-black/5 dark:hover:bg-white/5 focus:bg-black/5 dark:focus:bg-white/5 transition-colors"
                aria-label="Title"
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 flex gap-1 px-4 pb-3">
          {(['details', 'panels'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`chip !px-3 !py-1 !text-xs ${tab === t ? 'chip-active' : ''}`}
            >
              {t === 'details' ? 'Details' : '🖼️ Panels'}
            </button>
          ))}
        </div>

        {tab === 'panels' ? (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <TitlePanels item={item} />
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {(synopsisLoading || synopsis) && (
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/50 dark:bg-white/[0.03] p-3.5">
              <p className={label}>About</p>
              {synopsisLoading && !synopsis ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">Loading synopsis…</p>
              ) : (
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{synopsis}</p>
              )}
              {(item.media_type === 'manga' || item.media_type === 'manhwa') && (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Use the read links below to open this title on Webtoon, Tapas, or other sites.
                </p>
              )}
            </div>
          )}

          <WatchLinks item={item} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Status</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as Status)
                  setIsDirty(true)
                }}
                className={`${field} cursor-pointer dark:[color-scheme:dark]`}
              >
                <option value="plan_to_watch">Plan to Watch</option>
                <option value="watching">Watching</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>
            <div>
              <label className={label}>Rating {rating ? <span className="text-amber-400">· {rating}/10</span> : null}</label>
              <div className="flex h-[38px] items-center justify-between px-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setRating(rating === n ? null : n)
                      setIsDirty(true)
                    }}
                    className={`text-sm leading-none transition-all hover:scale-150 ${
                      rating && n <= rating ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,.7)]' : 'text-slate-300 dark:text-slate-600'
                    }`}
                    aria-label={`Rate ${n}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={label}>Progress</label>
              {total ? <span className="text-[11px] font-bold text-violet-500 dark:text-violet-300">{pct}%</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleProgressDecrement} disabled={progress <= 0} className={stepBtn}>
                −
              </button>
              <input
                type="number"
                value={progress}
                onChange={(e) => {
                  setProgress(Math.max(0, parseInt(e.target.value) || 0))
                  setIsDirty(true)
                }}
                min="0"
                className={`${field} text-center`}
              />
              <span className="text-slate-400">/</span>
              <input
                type="number"
                value={total || ''}
                placeholder="?"
                onChange={(e) => {
                  setTotal(e.target.value ? parseInt(e.target.value) : null)
                  setIsDirty(true)
                }}
                min="0"
                className={`${field} text-center`}
              />
              <button
                type="button"
                onClick={total ? handleProgressIncrement : () => { setProgress(progress + 1); setIsDirty(true) }}
                disabled={!!total && progress >= total}
                className={stepBtn}
              >
                +
              </button>
            </div>
            {total ? (
              <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                setIsDirty(true)
              }}
              rows={3}
              placeholder="Thoughts, favourite arc, where you left off..."
              className={`${field} resize-none`}
            />
          </div>

          <AdultToggle item={item} />
        </div>
        )}

        {/* Footer */}
        <div className="shrink-0 p-4 flex gap-2 border-t border-slate-200 dark:border-white/10">
          <button
            onClick={() => setShowConfirmDelete(true)}
            disabled={isDeleting}
            className="w-11 h-11 shrink-0 grid place-items-center rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50"
            aria-label="Delete"
            title="Delete"
          >
            {isDeleting ? '…' : '🗑'}
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || isUpdating}
            className="btn-glow flex-1 !py-2.5 disabled:cursor-not-allowed disabled:!shadow-none"
          >
            {isUpdating ? 'Saving...' : isDirty ? 'Save changes' : 'No changes'}
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
