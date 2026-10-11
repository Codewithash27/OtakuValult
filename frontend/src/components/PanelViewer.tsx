import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MediaItem } from '../types/media'
import { PANEL_KINDS, Panel } from '../types/panel'
import { signedUrl, useDeletePanels, useSignedUrls, useUpdatePanels } from '../hooks/usePanels'
import { useToast } from './Toast'
import { ConfirmDialog } from './ConfirmDialog'
import { TitlePicker } from './TitlePicker'
import { TagEditor } from './TagEditor'

interface Props {
  panels: Panel[]
  currentId: string
  items: MediaItem[]
  itemsById: Map<string, MediaItem>
  isAdultPanel: (p: Panel) => boolean
  tagSuggestions: string[]
  onNavigate: (id: string) => void
  onClose: () => void
}

const TALL_RATIO = 2

export function PanelViewer({ panels, currentId, items, itemsById, isAdultPanel, tagSuggestions, onNavigate, onClose }: Props) {
  const { showToast } = useToast()
  const update = useUpdatePanels()
  const remove = useDeletePanels()
  const [showInfo, setShowInfo] = useState(() => window.innerWidth >= 1024)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [caption, setCaption] = useState('')
  const [fullLoaded, setFullLoaded] = useState(false)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const index = panels.findIndex((p) => p.id === currentId)
  const panel = index >= 0 ? panels[index] : undefined
  const prev = index > 0 ? panels[index - 1] : undefined
  const next = index >= 0 && index < panels.length - 1 ? panels[index + 1] : undefined

  // Neighbours are signed too so moving between panels feels instant.
  const paths = [panel, prev, next].filter(Boolean).flatMap((p) => [p!.storage_path, p!.thumb_path])
  const urlOf = useSignedUrls(paths)

  useEffect(() => {
    setCaption(panel?.caption ?? '')
    setFullLoaded(false)
    scroller.current?.scrollTo({ top: 0 })
  }, [panel?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && prev) onNavigate(prev.id)
      else if (e.key === 'ArrowRight' && next) onNavigate(next.id)
      else if (e.key === 'i') setShowInfo((s) => !s)
    }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('cinema-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('cinema-open')
    }
  }, [prev, next, onNavigate, onClose])

  useEffect(() => {
    if (!panel && panels.length === 0) onClose()
  }, [panel, panels.length, onClose])

  if (!panel) return null

  const item = panel.media_item_id ? itemsById.get(panel.media_item_id) : undefined
  const tall = panel.height / panel.width > TALL_RATIO
  const fullUrl = urlOf(panel.storage_path)
  const thumbUrl = urlOf(panel.thumb_path)
  const adult = isAdultPanel(panel)

  const save = (data: Parameters<typeof update.mutate>[0]['data']) =>
    update.mutate({ ids: [panel.id], data }, { onError: (e) => showToast(e instanceof Error ? e.message : 'Save failed', 'error') })

  const download = async () => {
    const url = await signedUrl(panel.storage_path)
    if (!url) return
    const blob = await fetch(url).then((r) => r.blob())
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(item?.title ?? 'panel').replace(/[^\w\- ]+/g, '').trim() || 'panel'}-${panel.id.slice(0, 6)}.${panel.storage_path.split('.').pop()}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const doDelete = () => {
    const goTo = next ?? prev
    remove.mutate([panel], {
      onSuccess: () => {
        showToast('Deleted from gallery', 'success')
        setConfirmDelete(false)
        if (goTo) onNavigate(goTo.id)
        else onClose()
      },
      onError: (e) => showToast(e instanceof Error ? e.message : 'Delete failed', 'error'),
    })
  }

  const iconBtn = 'w-10 h-10 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white transition'
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5'

  return (
    <div className="dark fixed inset-0 z-[55] flex flex-col lg:flex-row bg-black/95 text-slate-100 animate-[fadeIn_.2s_ease]">
      <div className="relative flex-1 min-h-0 flex flex-col">
        <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-2 p-3 bg-gradient-to-b from-black/80 to-transparent">
          <span className="text-sm font-semibold text-white/80 px-2">
            {index + 1} / {panels.length}
          </span>
          <span className="flex-1" />
          <button onClick={download} className={iconBtn} title="Download" aria-label="Download">
            ⬇
          </button>
          <button onClick={() => setConfirmDelete(true)} className={iconBtn} title="Delete" aria-label="Delete">
            🗑
          </button>
          <button onClick={() => setShowInfo((s) => !s)} className={`${iconBtn} ${showInfo ? '!bg-violet-600' : ''}`} title="Details (i)" aria-label="Details">
            ℹ
          </button>
          <button onClick={onClose} className={iconBtn} title="Close (Esc)" aria-label="Close">
            ✕
          </button>
        </div>

        <div
          ref={scroller}
          className={`flex-1 min-h-0 ${tall ? 'overflow-y-auto' : 'grid place-items-center'} touch-pan-y`}
          onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => {
            const s = swipe.current
            swipe.current = null
            if (!s) return
            const dx = e.clientX - s.x
            if (Math.abs(dx) > 60 && Math.abs(e.clientY - s.y) < 60) {
              if (dx < 0 && next) onNavigate(next.id)
              else if (dx > 0 && prev) onNavigate(prev.id)
            }
          }}
        >
          <div className={`relative ${tall ? 'mx-auto w-full max-w-3xl pt-16 pb-6' : 'w-full h-full p-3 pt-16 grid place-items-center'}`}>
            {thumbUrl && !fullLoaded && (
              <img
                src={thumbUrl}
                alt=""
                className={`${tall ? 'w-full' : 'max-w-full max-h-full object-contain'} blur-sm`}
                style={tall ? undefined : { aspectRatio: `${panel.width} / ${panel.height}` }}
              />
            )}
            {fullUrl && (
              <img
                key={panel.id}
                src={fullUrl}
                alt={item?.title ?? ''}
                draggable={false}
                onLoad={() => setFullLoaded(true)}
                className={`${tall ? 'w-full' : 'max-w-full max-h-full object-contain'} select-none ${fullLoaded ? '' : 'absolute opacity-0'}`}
              />
            )}
          </div>
        </div>

        {prev && (
          <button
            onClick={() => onNavigate(prev.id)}
            className="hidden sm:grid absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 place-items-center rounded-full bg-black/50 hover:bg-violet-600 text-2xl text-white transition"
            aria-label="Previous"
          >
            ‹
          </button>
        )}
        {next && (
          <button
            onClick={() => onNavigate(next.id)}
            className="hidden sm:grid absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 place-items-center rounded-full bg-black/50 hover:bg-violet-600 text-2xl text-white transition"
            aria-label="Next"
          >
            ›
          </button>
        )}
      </div>

      {showInfo && (
        <aside className="shrink-0 max-h-[55vh] lg:max-h-none lg:w-[340px] overflow-y-auto border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0e0c1d] p-4 space-y-4">
          <div>
            <label className={label}>Title</label>
            <TitlePicker items={items} value={panel.media_item_id} onChange={(id) => save({ media_item_id: id })} placeholder="Link to a title" />
            {item && (
              <Link
                to={`/${item.media_type}?item=${item.id}`}
                onClick={onClose}
                className="inline-block mt-1.5 text-xs font-semibold text-violet-300 hover:underline"
              >
                Open {item.title} →
              </Link>
            )}
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              <label className={label}>Type</label>
              <div className="flex gap-1.5">
                {PANEL_KINDS.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => save({ kind: k.id })}
                    className={`chip !px-3 !py-1 !text-xs ${panel.kind === k.id ? 'chip-active' : ''}`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm pb-1">
              <input
                type="checkbox"
                checked={panel.adult}
                onChange={(e) => save({ adult: e.target.checked })}
                className="accent-rose-500 w-4 h-4"
              />
              18+
            </label>
          </div>
          {adult && !panel.adult && <p className="-mt-2 text-[11px] text-slate-400">Counted as 18+ because its title is.</p>}

          <div>
            <label className={label}>Tags</label>
            <TagEditor value={panel.tags} onChange={(tags) => save({ tags })} suggestions={tagSuggestions} />
          </div>

          <div>
            <label className={label}>Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={() => caption !== (panel.caption ?? '') && save({ caption: caption.trim() || null })}
              rows={2}
              placeholder="Chapter, scene, why you saved it…"
              className="input-premium !py-2 !px-3 text-sm resize-none"
            />
          </div>

          <p className="text-[11px] text-slate-500">
            {panel.width}×{panel.height} · added {new Date(panel.created_at).toLocaleDateString()}
          </p>
        </aside>
      )}

      <ConfirmDialog
        title="Delete image?"
        message="Remove this image from your gallery? This can't be undone."
        confirmLabel="Delete"
        isDangerous
        isOpen={confirmDelete}
        isLoading={remove.isPending}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
