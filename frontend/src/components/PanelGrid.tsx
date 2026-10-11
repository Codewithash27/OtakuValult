import { useEffect, useRef, useState } from 'react'
import { MediaItem } from '../types/media'
import { PANEL_KINDS, Panel } from '../types/panel'
import { THUMB_MAX_RATIO } from '../lib/imageProcess'
import { useSignedUrls } from '../hooks/usePanels'

const PAGE_SIZE = 60

interface Props {
  panels: Panel[]
  itemsById: Map<string, MediaItem>
  isAdultPanel: (p: Panel) => boolean
  blur: boolean
  selecting: boolean
  selected: Set<string>
  onOpen: (p: Panel) => void
  onToggle: (p: Panel) => void
  /** Changing this (e.g. when filters change) starts rendering from the top again. */
  resetKey?: string
}

export function PanelGrid({ panels, itemsById, isAdultPanel, blur, selecting, selected, onOpen, onToggle, resetKey = '' }: Props) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const sentinel = useRef<HTMLDivElement>(null)
  const shown = panels.slice(0, limit)
  const urlOf = useSignedUrls(shown.map((p) => p.thumb_path))

  useEffect(() => setLimit(PAGE_SIZE), [resetKey])

  useEffect(() => {
    const el = sentinel.current
    if (!el || limit >= panels.length) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setLimit((l) => l + PAGE_SIZE)
    }, { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [limit, panels.length])

  return (
    <>
      <div className="columns-2 sm:columns-3 lg:columns-4 2xl:columns-5 gap-3">
        {shown.map((p) => {
          const url = urlOf(p.thumb_path)
          const item = p.media_item_id ? itemsById.get(p.media_item_id) : undefined
          const adult = isAdultPanel(p)
          const hidden = blur && adult
          const isSelected = selected.has(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => (selecting ? onToggle(p) : onOpen(p))}
              className={`group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl bg-slate-200 dark:bg-white/[0.04] transition-all ${
                isSelected ? 'ring-4 ring-violet-500 scale-[0.97]' : 'hover:shadow-[0_18px_40px_-15px_rgba(168,85,247,.6)]'
              }`}
              style={{ aspectRatio: `${p.width} / ${Math.min(p.height, p.width * THUMB_MAX_RATIO)}` }}
            >
              {url ? (
                <img
                  src={url}
                  alt={item?.title ?? ''}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className={`w-full h-full object-cover object-top transition-transform duration-500 ${
                    hidden ? 'blur-2xl scale-110' : 'group-hover:scale-[1.04]'
                  }`}
                />
              ) : (
                <div className="w-full h-full animate-pulse bg-gradient-to-br from-violet-500/10 to-pink-500/10" />
              )}

              {hidden && (
                <span className="absolute inset-0 grid place-items-center text-xs font-bold text-white/90">
                  <span className="px-2 py-1 rounded-lg bg-black/50 backdrop-blur">18+ · tap to view</span>
                </span>
              )}

              <span className="absolute inset-x-0 bottom-0 p-2 pt-8 bg-gradient-to-t from-black/80 to-transparent text-left opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {item && <span className="block text-[11px] font-semibold text-white truncate">{item.title}</span>}
                <span className="flex flex-wrap gap-1 mt-0.5">
                  {p.kind !== 'panel' && (
                    <span className="text-[9px] font-bold uppercase px-1.5 rounded bg-white/20 text-white">
                      {PANEL_KINDS.find((k) => k.id === p.kind)?.label}
                    </span>
                  )}
                  {p.tags.slice(0, 2).map((t) => (
                    <span key={t} className="text-[9px] font-semibold px-1.5 rounded bg-violet-500/60 text-white">
                      {t}
                    </span>
                  ))}
                </span>
              </span>

              {adult && !hidden && (
                <span className="absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-600/90 text-white">18+</span>
              )}

              {selecting && (
                <span
                  className={`absolute top-1.5 left-1.5 w-6 h-6 grid place-items-center rounded-full border-2 text-xs font-bold ${
                    isSelected ? 'bg-violet-500 border-violet-500 text-white' : 'bg-black/40 border-white/80 text-transparent'
                  }`}
                >
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>
      {limit < panels.length && <div ref={sentinel} className="h-10" />}
    </>
  )
}
