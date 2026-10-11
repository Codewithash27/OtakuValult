import { useState } from 'react'
import { normalizeTag } from '../types/panel'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
}

export function TagEditor({ value, onChange, suggestions = [] }: Props) {
  const [draft, setDraft] = useState('')

  const add = (raw: string) => {
    const tags = raw.split(',').map(normalizeTag).filter((t) => t && !value.includes(t))
    if (tags.length) onChange([...value, ...new Set(tags)])
    setDraft('')
  }

  const q = normalizeTag(draft)
  const hints = suggestions.filter((s) => !value.includes(s) && (!q || s.includes(q))).slice(0, 8)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 input-premium !p-1.5 min-h-[42px]">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-200 text-xs font-semibold">
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== t))}
              className="w-4 h-4 grid place-items-center rounded hover:bg-rose-500/20 hover:text-rose-500"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            if (e.target.value.endsWith(',')) add(e.target.value)
            else setDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? '' : 'Add tags, press Enter'}
          className="flex-1 min-w-[90px] bg-transparent outline-none text-sm px-1 py-0.5"
        />
      </div>
      {hints.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {hints.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="px-2 py-0.5 rounded-md text-[11px] font-semibold border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-violet-400 hover:text-violet-500"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
