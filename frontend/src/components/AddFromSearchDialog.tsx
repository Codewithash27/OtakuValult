import { useRef, useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { SearchResult } from '../types/search'
import { Status } from '../types/media'
import { useAddItem } from '../hooks/useMediaMutations'
import { useToast } from './Toast'
import { PosterImage } from './PosterImage'
import { fetchAniListDescription } from '../lib/mediaDescription'

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
        notes: null,
        source: result.source,
        external_id: result.external_id,
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

  const anilistNumericId = useMemo(() => {
    if (!result || result.source !== 'anilist') return null
    const match = /^(?:anime:|manga:)?(\d+)$/.exec(result.external_id)
    return match ? Number(match[1]) : null
  }, [result])

  const { data: fullSynopsis, isLoading: synopsisLoading } = useQuery({
    queryKey: ['media-description', anilistNumericId],
    queryFn: () => fetchAniListDescription(anilistNumericId!),
    enabled: isOpen && anilistNumericId !== null,
    staleTime: 24 * 60 * 60 * 1000,
  })

  const synopsis = fullSynopsis || result?.overview || null

  if (!isOpen || !result) return null

  const ratingNum = rating ? parseInt(rating) : 0
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5'

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] animate-[fadeIn_.25s_ease]"
        onClick={onClose}
        role="presentation"
      />
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"
        role="dialog"
        aria-labelledby="add-dialog-title"
      >
        <div className="pointer-events-auto card-ring glass-strong rounded-3xl max-w-sm w-full max-h-[calc(100vh-2rem)] overflow-y-auto shadow-[0_30px_80px_-20px_rgba(124,58,237,.6)] animate-fade-up">
          <div className="relative overflow-hidden rounded-t-3xl">
            {result.poster_url && (
              <img src={result.poster_url} alt="" className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-40" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white dark:to-[#0e0c1d]" />
            <div className="relative flex gap-4 p-5">
              <PosterImage
                src={result.poster_url}
                alt={result.title}
                mediaType={result.media_type as any}
                className="w-20 h-28 rounded-xl flex-shrink-0 shadow-[0_12px_30px_-8px_rgba(124,58,237,.7)] ring-1 ring-white/20"
              />
              <div className="flex-1 min-w-0 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-500 dark:text-violet-300">
                  Add · {result.media_type}{result.year ? ` · ${result.year}` : ''}
                </span>
                <h3 id="add-dialog-title" className="font-display font-bold text-lg leading-snug line-clamp-2 mt-1">
                  {result.title}
                </h3>
                {result.alt_title && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{result.alt_title}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4 px-5 pb-5">
            {(synopsisLoading || synopsis) && (
              <div>
                <p className={label}>About</p>
                {synopsisLoading && !synopsis ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">Loading synopsis…</p>
                ) : (
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 max-h-40 overflow-y-auto">
                    {synopsis}
                  </p>
                )}
              </div>
            )}

            {/* Status */}
            <div>
              <label className={label}>Status</label>
              <select
                ref={statusRef}
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="input-premium !py-2 !px-3 text-sm cursor-pointer"
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
              <label className={label}>
                Rating {ratingNum ? <span className="text-amber-400">· {ratingNum}/10</span> : <span className="normal-case font-medium">(optional)</span>}
              </label>
              <div className="flex items-center justify-between px-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(ratingNum === n ? '' : String(n))}
                    className={`text-lg leading-none transition-all hover:scale-150 ${
                      n <= ratingNum ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,.7)]' : 'text-slate-300 dark:text-slate-600'
                    }`}
                    aria-label={`Rate ${n}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50 text-sm font-semibold"
              >
                Cancel
              </button>
              <button onClick={handleSave} disabled={isPending} className="btn-glow flex-1 !py-2.5 text-sm disabled:cursor-not-allowed">
                {isPending ? 'Adding...' : '+ Add to shelf'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
