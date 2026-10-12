import { ReactNode, useEffect, useRef, useState } from 'react'
import { MediaType, Status, STATUS_LABELS } from '../types/media'
import type { SortOption } from './SortSelect'
import type { ContentMode } from '../hooks/useAdultFilter'
import { ChipScroller } from './ChipScroller'
import { SearchBar } from './SearchBar'
import { MediaItem } from '../types/media'

const STATUS_DOT: Record<Status | 'all', string> = {
  all: 'bg-slate-400',
  watching: 'bg-jade-400',
  completed: 'bg-emerald-400',
  on_hold: 'bg-amber-300',
  dropped: 'bg-vermilion-500',
  plan_to_watch: 'bg-sky-400',
}

export type VaultView = 'grid' | 'list' | 'themes'

const STATUSES: (Status | 'all')[] = ['all', 'watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch']
const SORTS: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title-asc', label: 'Title A–Z' },
  { value: 'rating-desc', label: 'Top rated' },
]

function useCountUp(value: number) {
  const [n, setN] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 700)
      setN(Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return n
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  const n = useCountUp(value)
  return (
    <div className="text-center px-3">
      <div className={`font-display font-extrabold text-xl leading-none tabular-nums ${tone}`}>{n}</div>
      <div className="mt-1 text-[9px] font-bold uppercase tracking-[.18em] text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

function DoneRing({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  const shown = useCountUp(pct)
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <div className="relative w-12 h-12 shrink-0" title={`${pct}% completed`}>
      <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-slate-200 dark:stroke-white/10" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          stroke="url(#ring)"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)' }}
        />
        <defs>
          <linearGradient id="ring" x1="0" x2="1">
            <stop offset="0" stopColor="#ffa21f" />
            <stop offset="1" stopColor="#20e0c0" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-extrabold tabular-nums">{shown}%</span>
    </div>
  )
}

interface Pill {
  key: string
  label: string
  onRemove: () => void
}

interface VaultHeaderProps {
  mediaType: MediaType | 'all'
  fixedType?: MediaType
  title: string
  blurb: string
  kanji: string
  counts: Record<Status | 'all', number>
  resultCount: number
  search: string
  onSearch: (q: string) => void
  status: Status | 'all'
  onStatus: (s: Status | 'all') => void
  onMediaType: (t: MediaType | 'all') => void
  sort: SortOption
  onSort: (s: SortOption) => void
  view: VaultView
  onView: (v: VaultView) => void
  contentMode: ContentMode
  onContentMode: (m: ContentMode) => void
  hiddenCount: number
  themesOpen: boolean
  onToggleThemes: () => void
  themeCount: number
  pills: Pill[]
  onClearAll: () => void
  onCinema: () => void
  cinemaDisabled: boolean
  showThemes?: boolean
  themeRail?: { id: string; label: string; count: number }[]
  selectedThemes?: string[]
  onToggleTheme?: (id: string) => void
  onPickShelf?: (item: MediaItem) => void
  children?: ReactNode
}

export function VaultHeader(p: VaultHeaderProps) {
  const unit = p.mediaType === 'anime' ? 'anime' : p.mediaType === 'all' ? 'titles' : p.mediaType
  const lockType = p.mediaType === 'anime' || p.mediaType === 'manga' || p.mediaType === 'manhwa' ? p.mediaType : 'all'

  return (
    <div className="mb-4 space-y-2.5">
      {/* Hero */}
      <section className="vault-hero relative rounded-3xl glass animate-fade-up">
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          <div className="vault-orb vault-orb-a" />
          <div className="vault-orb vault-orb-b" />
          <span className="vault-kanji select-none absolute right-3 -bottom-5 font-jp font-bold text-[96px] leading-none">
            {p.kanji}
          </span>
        </div>

        <div className="relative flex flex-col md:flex-row md:items-center gap-3 p-4 lg:px-6">
          <div className="min-w-0 md:mr-auto">
            <h1 className="text-2xl lg:text-[1.75rem] font-bold leading-tight">
              The <span className="text-gradient">{p.title}</span>
              {p.fixedType && ' Vault'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{p.blurb}</p>
          </div>

          <div className="w-full md:w-80 lg:w-[22rem] shrink-0 z-30">
            <SearchBar
              value={p.search}
              onValueChange={p.onSearch}
              lockType={lockType}
              placeholder={`Search your ${unit}, or find new ones…`}
              onPickShelf={p.onPickShelf}
              onOpenManualAdd={() => window.dispatchEvent(new CustomEvent('openAddModal'))}
            />
          </div>

          <div className="flex items-center justify-between md:justify-end gap-1 shrink-0 rounded-2xl bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5 px-2 py-1.5">
            <Stat value={p.counts.all} label="Total" tone="text-gradient" />
            <span className="w-px h-7 bg-slate-200 dark:bg-white/10" />
            <Stat value={p.counts.watching} label={p.mediaType === 'anime' ? 'Watching' : 'Reading'} tone="stat-live" />
            <span className="w-px h-7 bg-slate-200 dark:bg-white/10" />
            <DoneRing done={p.counts.completed} total={p.counts.all} />
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="vault-toolbar glass rounded-2xl p-1.5 flex items-center gap-1.5 sticky top-2 z-20">
        {p.showThemes ? (
          <>
            <button
              type="button"
              onClick={p.onToggleThemes}
              className={`ctl gap-1.5 shrink-0 ${p.themesOpen ? '!border-[#ffa21f]/60 !text-[#ffd688] bg-[#f98a07]/10' : ''}`}
              aria-expanded={p.themesOpen}
            >
              <span className={`transition-transform duration-300 ${p.themesOpen ? 'rotate-90' : ''}`}>✦</span>
              Themes
              {p.themeCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full text-[10px] font-bold text-white bg-gradient-to-br from-lantern-500 to-vermilion-600">
                  {p.themeCount}
                </span>
              )}
            </button>
            <ChipScroller className="flex-1 min-w-0">
              {(p.themeRail ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => p.onToggleTheme?.(t.id)}
                  className={`chip !px-2.5 !py-1 !text-[11px] ${p.selectedThemes?.includes(t.id) ? 'chip-active' : ''}`}
                >
                  {t.label} <span className="opacity-60 tabular-nums">{t.count}</span>
                </button>
              ))}
            </ChipScroller>
          </>
        ) : (
          <div className="seg flex-1 min-w-0 overflow-x-auto">
            {STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => p.onStatus(s)} className={`seg-btn gap-1.5 ${p.status === s ? 'seg-on' : ''}`}>
                {s !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />}
                {s === 'all' ? 'All' : STATUS_LABELS[s]}
                <span className="text-[10px] opacity-60 tabular-nums">{p.counts[s]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {p.showThemes && (
            <select
              value={p.status}
              onChange={(e) => p.onStatus(e.target.value as Status | 'all')}
              className="ctl pr-7"
              aria-label="Status"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? `All ${p.counts.all}` : `${STATUS_LABELS[s]} (${p.counts[s]})`}
                </option>
              ))}
            </select>
          )}
          <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortOption)} className="ctl pr-7" aria-label="Sort">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="seg">
            {(
              [
                ['grid', '▦', 'Grid view'],
                ['list', '☰', 'List view'],
                ...(p.showThemes ? ([['themes', '🗂', 'Group by theme']] as const) : []),
              ] as const
            ).map(([v, icon, label]) => (
              <button key={v} onClick={() => p.onView(v)} title={label} aria-label={label} className={`seg-btn !px-2.5 ${p.view === v ? 'seg-on' : ''}`}>
                {icon}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={p.onCinema}
            disabled={p.cinemaDisabled}
            className="cinema-btn disabled:opacity-40"
            title="Fullscreen poster wall"
          >
            🎞️ Cinema
          </button>
        </div>
      </div>

      {p.children}

      {/* Active filters */}
      {p.pills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 animate-fade-up [animation-duration:.3s]">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">
            <b className="text-slate-900 dark:text-white tabular-nums">{p.resultCount}</b> {unit}
          </span>
          {p.pills.map((pill) => (
            <button key={pill.key} onClick={pill.onRemove} className="filter-pill group">
              {pill.label}
              <span className="opacity-60 group-hover:opacity-100 group-hover:rotate-90 transition-transform">✕</span>
            </button>
          ))}
          <button onClick={p.onClearAll} className="text-xs font-semibold text-vermilion-400 hover:text-vermilion-300 ml-1">
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
