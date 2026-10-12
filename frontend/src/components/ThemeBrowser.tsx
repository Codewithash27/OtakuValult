import { useMemo, useState } from 'react'
import { MediaItem } from '../types/media'
import { THEMES, THEME_TAGS, hasTheme } from '../lib/themes'
import { PosterImage } from './PosterImage'
import { ChipScroller } from './ChipScroller'

type TagsOf = (item: MediaItem) => string[] | undefined

interface ThemeFilterProps {
  items: MediaItem[]
  tagsOf: TagsOf
  selectedThemes: string[]
  selectedTags: string[]
  onToggleTheme: (id: string) => void
  onToggleTag: (name: string) => void
  pending: number
}

const MORE_TAGS = 60
const TAGS_PREVIEW = 16

/** Fold-out panel: themes and other tags wrap instead of scrolling sideways. */
export function ThemeFilter({ items, tagsOf, selectedThemes, selectedTags, onToggleTheme, onToggleTag, pending }: ThemeFilterProps) {
  const [allTags, setAllTags] = useState(false)

  const themeCounts = useMemo(
    () =>
      THEMES.map((theme) => ({ theme, count: items.filter((i) => hasTheme(tagsOf(i), theme)).length }))
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count),
    [items, tagsOf]
  )

  const otherTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of items) for (const t of tagsOf(i) ?? []) if (!THEME_TAGS.has(t.toLowerCase())) counts.set(t, (counts.get(t) || 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MORE_TAGS)
  }, [items, tagsOf])

  const max = themeCounts[0]?.count || 1
  const tagsShown = allTags ? otherTags : otherTags.slice(0, TAGS_PREVIEW)

  return (
    <div className="glass rounded-2xl p-3 sm:p-4 space-y-4 animate-fade-up [animation-duration:.35s]">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="panel-label">Themes</span>
          {pending > 0 && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              Tagging {pending}…
            </span>
          )}
        </div>
        {themeCounts.length ? (
          <div className="stagger-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-1.5">
            {themeCounts.map(({ theme, count }) => {
              const on = selectedThemes.includes(theme.id)
              return (
                <button
                  key={theme.id}
                  onClick={() => onToggleTheme(theme.id)}
                  className={`theme-tile ${on ? 'theme-tile-on' : ''}`}
                  style={{ ['--w' as string]: `${Math.max(12, (count / max) * 100)}%` }}
                >
                  <span className="truncate">{theme.label}</span>
                  <span className="tabular-nums text-[11px] opacity-70">{count}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">{pending ? 'Fetching tags…' : 'No tags on these titles yet.'}</p>
        )}
      </div>

      {otherTags.length > 0 && (
        <div>
          <span className="panel-label block mb-2">More tags</span>
          <div className="flex flex-wrap gap-1.5">
            {tagsShown.map(([name, count]) => (
              <button
                key={name}
                onClick={() => onToggleTag(name)}
                className={`chip !px-2.5 !py-1 !text-[11px] ${selectedTags.includes(name) ? 'chip-active' : ''}`}
              >
                {name} <span className="opacity-60 tabular-nums">{count}</span>
              </button>
            ))}
            {otherTags.length > TAGS_PREVIEW && (
              <button onClick={() => setAllTags((v) => !v)} className="chip !px-2.5 !py-1 !text-[11px] !border-dashed">
                {allTags ? 'Show less' : `+${otherTags.length - TAGS_PREVIEW} more`}
              </button>
            )}
          </div>
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

  if (!rows.length) {
    return <p className="text-sm text-slate-500 text-center py-12">No themed titles yet — tags are still loading or missing.</p>
  }

  return (
    <div className="space-y-7">
      {rows.map(({ theme, total, top }) => (
        <section key={theme.id} className="animate-fade-up">
          <div className="flex items-end justify-between mb-1">
            <h2 className="section-title">
              {theme.label} <span className="text-sm font-semibold text-slate-400">{total}</span>
            </h2>
            <button onClick={() => onSeeAll(theme.id)} className="text-sm font-semibold text-lantern-400 hover:text-lantern-300 group">
              See all <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </button>
          </div>
          <ChipScroller railClassName="!gap-3 !items-start !pt-2 !pb-2 snap-x">
            {top.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpen(item)}
                className="group relative w-28 sm:w-32 shrink-0 snap-start rounded-xl overflow-hidden text-left lift poster-shine ring-1 ring-white/10 hover:ring-lantern-400/60"
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
          </ChipScroller>
        </section>
      ))}
    </div>
  )
}
