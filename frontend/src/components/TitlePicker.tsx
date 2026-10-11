import { useEffect, useMemo, useRef, useState } from 'react'
import { MediaItem } from '../types/media'

interface Props {
  items: MediaItem[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  /** Optional per-title counts, shown on the right and used to sort titles that have some first. */
  counts?: Map<string, number>
  className?: string
}

const MAX_RESULTS = 40

export function TitlePicker({ items, value, onChange, placeholder = 'Search your shelf…', counts, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const selected = value ? items.find((i) => i.id === value) : undefined

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q ? items.filter((i) => i.title.toLowerCase().includes(q)) : items
    const sorted = counts
      ? [...pool].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
      : pool
    return sorted.slice(0, MAX_RESULTS)
  }, [items, query, counts])

  const pick = (id: string | null) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <div className="relative">
        <input
          value={open ? query : selected?.title ?? ''}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              e.preventDefault()
              pick(results[0].id)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          placeholder={selected ? selected.title : placeholder}
          className="input-premium !py-2 !pl-3 !pr-9 text-sm"
        />
        {selected && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"
            aria-label="Clear title"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-xl glass-strong shadow-2xl p-1">
          {results.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No titles match.</p>}
          {results.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => pick(i.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm hover:bg-violet-500/10 ${
                i.id === value ? 'bg-violet-500/15' : ''
              }`}
            >
              {i.poster_url ? (
                <img src={i.poster_url} alt="" loading="lazy" className="w-7 h-10 shrink-0 rounded object-cover" />
              ) : (
                <span className="w-7 h-10 shrink-0 rounded bg-violet-500/20" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{i.title}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">{i.media_type}</span>
              </span>
              {counts?.get(i.id) ? (
                <span className="text-[11px] font-bold text-violet-500 dark:text-violet-300">{counts.get(i.id)}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
