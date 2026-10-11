import { useMemo, useState } from 'react'
import { MediaItem } from '../types/media'
import { THEMES, THEME_TAGS, hasTheme } from '../lib/themes'
import { PosterImage } from './PosterImage'

type TagsOf = (item: MediaItem) => string[] | undefined

interface ThemeFilterProps {
  items: MediaItem[]
  tagsOf: TagsOf
  selectedThemes: string[]
  selectedTags: string[]
  onToggleTheme: (id: string) => void
  onToggleTag: (name: string) => void
  onClear: () => void
  pending: number
  byTheme: boolean
  onToggleByTheme: () => void
}

const MORE_TAGS = 40

export function ThemeFilter({
  items,
  tagsOf,
  selectedThemes,
  selectedTags,
  onToggleTheme,
  onToggleTag,
  onClear,
  pending,
  byTheme,
  onToggleByTheme,
}: ThemeFilterProps) {
  const [showMore, setShowMore] = useState(false)

  const themeCounts = useMemo(
    () => THEMES.map((theme) => ({ theme, count: items.filter((i) => hasTheme(tagsOf(i), theme)).length })).filter((t) => t.count > 0),
    [items, tagsOf]
  )

  const otherTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of items) for (const t of tagsOf(i) ?? []) if (!THEME_TAGS.has(t)) counts.set(t, (counts.get(t) || 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MORE_TAGS)
  }, [items, tagsOf])

  const active = selectedThemes.length + selectedTags.length > 0
  const chip = (on: boolean) =>
    `px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-300 border ${
      on
        ? 'text-white border-transparent bg-gradient-to-r from-rose-500 to-fuchsia-600 shadow-[0_6px_20px_-6px_rgba(244,63,94,.7)]'
        : 'border-slate-200 bg-white/60 text-slate-600 hover:border-rose-400 hover:text-rose-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300'
    }`

  return (
    <div className="border-t border-slate-200 dark:border-white/5 pt-2">
      <div className="flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 shrink-0 mr-1">
          Themes
        </span>
        {active && (
          <button onClick={onClear} className={`${chip(false)} !text-rose-500`} aria-label="Clear themes">
            ✕
          </button>
        )}
        {!active && themeCounts.length > 0 && (
          <button onClick={onToggleByTheme} className={chip(byTheme)}>
            🗂 By theme
          </button>
        )}
        {themeCounts.map(({ theme, count }) => (
          <button key={theme.id} onClick={() => onToggleTheme(theme.id)} className={chip(selectedThemes.includes(theme.id))}>
            {theme.label} <span className="opacity-70">{count}</span>
          </button>
        ))}
        {otherTags.length > 0 && (
          <button onClick={() => setShowMore((s) => !s)} className={chip(showMore || selectedTags.length > 0)}>
            {showMore ? '− Fewer tags' : `+ ${otherTags.length} more tags`}
            {selectedTags.length > 0 && !showMore ? ` · ${selectedTags.length}` : ''}
          </button>
        )}
        {pending > 0 && (
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Tagging {pending}…
          </span>
        )}
        {themeCounts.length === 0 && pending === 0 && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
            No AniList tags on these titles yet.
          </span>
        )}
      </div>

      {showMore && (
        <div className="mt-2 flex flex-wrap gap-1.5 px-1 max-h-32 overflow-y-auto">
          {otherTags.map(([name, count]) => (
            <button key={name} onClick={() => onToggleTag(name)} className={chip(selectedTags.includes(name))}>
              {name} <span className="opacity-70">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface ThemeRowsProps {
  items: MediaItem[]
  tagsOf: TagsOf
  onOpen: (item: MediaItem) => void
  onSeeAll: (themeId: string) => void
}

const ROW_SIZE = 20

export function ThemeRows({ items, tagsOf, onOpen, onSeeAll }: ThemeRowsProps) {
  const rows = useMemo(
    () =>
      THEMES.map((theme) => {
        const matches = items.filter((i) => hasTheme(tagsOf(i), theme))
        const top = [...matches].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, ROW_SIZE)
        return { theme, total: matches.length, top }
      })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total),
    [items, tagsOf]
  )

  return (
    <div className="space-y-8">
      {rows.map(({ theme, total, top }) => (
        <section key={theme.id} className="animate-fade-up">
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-xl font-bold">
              {theme.label} <span className="text-sm font-semibold text-slate-400">{total}</span>
            </h2>
            <button onClick={() => onSeeAll(theme.id)} className="text-sm font-semibold text-violet-500 hover:underline">
              See all →
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1">
            {top.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpen(item)}
                className="group relative w-28 sm:w-32 shrink-0 snap-start rounded-xl overflow-hidden text-left card-ring"
              >
                <PosterImage
                  src={item.poster_url}
                  alt={item.title}
                  mediaType={item.media_type}
                  className="w-full aspect-[2/3] transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                {item.rating ? (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-black">
                    ★ {item.rating}
                  </span>
                ) : null}
                <p className="absolute bottom-0 inset-x-0 p-2 text-xs font-semibold text-white line-clamp-2">{item.title}</p>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
