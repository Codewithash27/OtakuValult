import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MediaItem, anilistId } from '../types/media'
import { LINK_LIST_PREFIX, WATCH_LINK_PREFIX, WATCH_LINKS_CHANGED_EVENT, schedulePrefsPush } from '../lib/prefsSync'
import { anilist } from '../lib/importers'

interface OfficialLink {
  site: string
  url: string
  language: string | null
  color: string | null
}

/** A button in the box. `color` is a hex colour (AniList) or Tailwind gradient stops. */
interface LinkButton {
  name: string
  url: string
  color: string
}

const MAX_OFFICIAL = 8
const CUSTOM_COLOR = 'from-violet-500 to-fuchsia-600'

/** Official reading/streaming pages AniList lists for a title, English first. */
async function fetchOfficialLinks(id: number): Promise<OfficialLink[]> {
  const data = await anilist<{
    Media: { externalLinks: (OfficialLink & { type: string; isDisabled: boolean | null })[] } | null
  }>(`query ($id: Int) { Media(id: $id) { externalLinks { site url type language color isDisabled } } }`, { id })
  const seen = new Set<string>()
  const rank = (l: OfficialLink) => (l.language === 'English' ? 0 : l.language ? 2 : 1)
  return (data.Media?.externalLinks ?? [])
    .filter((l) => l.type === 'STREAMING' && !l.isDisabled && /^https?:\/\//.test(l.url))
    .sort((a, b) => rank(a) - rank(b))
    .filter((l) => {
      const key = `${l.site}|${l.language ?? ''}`
      return !seen.has(key) && seen.add(key)
    })
    .slice(0, MAX_OFFICIAL)
}

interface Platform {
  name: string
  url: (q: string) => string
  color: string
}

const q = encodeURIComponent

const PLATFORMS: Record<MediaItem['media_type'], Platform[]> = {
  anime: [
    { name: 'Crunchyroll', url: (t) => `https://www.crunchyroll.com/search?q=${q(t)}`, color: 'from-orange-500 to-amber-500' },
    { name: 'Netflix', url: (t) => `https://www.netflix.com/search?q=${q(t)}`, color: 'from-red-600 to-rose-700' },
    { name: 'Prime Video', url: (t) => `https://www.primevideo.com/search?phrase=${q(t)}`, color: 'from-sky-500 to-blue-600' },
    { name: 'Trailer', url: (t) => `https://www.youtube.com/results?search_query=${q(t + ' trailer')}`, color: 'from-red-500 to-pink-600' },
  ],
  manga: [
    { name: 'MANGA Plus', url: (t) => `https://mangaplus.shueisha.co.jp/search_result?keyword=${q(t)}`, color: 'from-rose-500 to-red-600' },
    { name: 'Kindle', url: (t) => `https://www.amazon.com/s?k=${q(t + ' manga')}&i=digital-text`, color: 'from-amber-400 to-orange-500' },
    { name: 'Google', url: (t) => `https://www.google.com/search?q=${q('read ' + t + ' manga official')}`, color: 'from-cyan-500 to-blue-600' },
  ],
  manhwa: [
    { name: 'Webtoon', url: (t) => `https://www.webtoons.com/en/search?keyword=${q(t)}`, color: 'from-emerald-400 to-green-600' },
    { name: 'Tapas', url: (t) => `https://tapas.io/search?q=${q(t)}`, color: 'from-yellow-400 to-amber-500' },
    { name: 'Tappytoon', url: (t) => `https://www.tappytoon.com/en/search?keyword=${q(t)}`, color: 'from-pink-500 to-fuchsia-600' },
    { name: 'Google', url: (t) => `https://www.google.com/search?q=${q('read ' + t + ' manhwa official')}`, color: 'from-cyan-500 to-blue-600' },
  ],
  movie: [
    { name: 'JustWatch', url: (t) => `https://www.justwatch.com/in/search?q=${q(t)}`, color: 'from-yellow-400 to-amber-500' },
    { name: 'Netflix', url: (t) => `https://www.netflix.com/search?q=${q(t)}`, color: 'from-red-600 to-rose-700' },
    { name: 'Prime Video', url: (t) => `https://www.primevideo.com/search?phrase=${q(t)}`, color: 'from-sky-500 to-blue-600' },
    { name: 'Trailer', url: (t) => `https://www.youtube.com/results?search_query=${q(t + ' trailer')}`, color: 'from-red-500 to-pink-600' },
  ],
  tv: [
    { name: 'JustWatch', url: (t) => `https://www.justwatch.com/in/search?q=${q(t)}`, color: 'from-yellow-400 to-amber-500' },
    { name: 'Netflix', url: (t) => `https://www.netflix.com/search?q=${q(t)}`, color: 'from-red-600 to-rose-700' },
    { name: 'Prime Video', url: (t) => `https://www.primevideo.com/search?phrase=${q(t)}`, color: 'from-sky-500 to-blue-600' },
    { name: 'Trailer', url: (t) => `https://www.youtube.com/results?search_query=${q(t + ' trailer')}`, color: 'from-red-500 to-pink-600' },
  ],
}

const storageKey = (id: string) => `${WATCH_LINK_PREFIX}${id}`
const listKey = (id: string) => `${LINK_LIST_PREFIX}${id}`

function readList(id: string): LinkButton[] | null {
  try {
    const raw = localStorage.getItem(listKey(id))
    return raw ? (JSON.parse(raw) as LinkButton[]) : null
  } catch {
    return null
  }
}

const withScheme = (url: string) => (url && !/^https?:\/\//i.test(url) ? `https://${url}` : url)

function LinkChip({ link }: { link: LinkButton }) {
  const hex = link.color.startsWith('#')
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      style={hex ? { backgroundColor: link.color } : undefined}
      className={`group relative overflow-hidden rounded-xl px-3 py-2 text-sm font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 flex items-center justify-between gap-2 ${
        hex ? '' : `bg-gradient-to-r ${link.color}`
      }`}
    >
      <span className="truncate [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]">{link.name}</span>
      <span className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
    </a>
  )
}

export function WatchLinks({ item }: { item: MediaItem }) {
  const [customLink, setCustomLink] = useState('')
  const [editing, setEditing] = useState(false)
  const [savedList, setSavedList] = useState<LinkButton[] | null>(null)
  const [draft, setDraft] = useState<LinkButton[] | null>(null)

  useEffect(() => {
    const load = () => {
      setCustomLink(localStorage.getItem(storageKey(item.id)) || '')
      setSavedList(readList(item.id))
    }
    load()
    setEditing(false)
    setDraft(null)
    window.addEventListener(WATCH_LINKS_CHANGED_EVENT, load)
    return () => window.removeEventListener(WATCH_LINKS_CHANGED_EVENT, load)
  }, [item.id])

  const saveLink = () => {
    const url = withScheme(customLink.trim())
    if (url) localStorage.setItem(storageKey(item.id), url)
    else localStorage.removeItem(storageKey(item.id))
    setCustomLink(url)
    setEditing(false)
    schedulePrefsPush()
  }

  const isReadable = item.media_type === 'manga' || item.media_type === 'manhwa'
  const alId = anilistId(item)
  const anilistUrl = alId !== null ? `https://anilist.co/${item.media_type === 'anime' ? 'anime' : 'manga'}/${alId}` : null
  const { data: official = [] } = useQuery({
    queryKey: ['official-links', alId],
    queryFn: () => fetchOfficialLinks(alId!),
    enabled: alId !== null && !savedList,
    staleTime: 24 * 60 * 60 * 1000,
  })

  const officialButtons: LinkButton[] = official.map((l) => ({
    name: l.language && l.language !== 'English' ? `${l.site} · ${l.language}` : l.site,
    url: l.url,
    color: l.color ?? '#dd6602',
  }))
  const searchButtons: LinkButton[] = PLATFORMS[item.media_type].map((p) => ({ name: p.name, url: p.url(item.title), color: p.color }))

  const startEdit = () => setDraft(savedList ?? [...officialButtons, ...searchButtons])
  const updateDraft = (i: number, patch: Partial<LinkButton>) =>
    setDraft((d) => d && d.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const move = (i: number, by: number) =>
    setDraft((d) => {
      if (!d || i + by < 0 || i + by >= d.length) return d
      const next = [...d]
      ;[next[i], next[i + by]] = [next[i + by], next[i]]
      return next
    })

  const saveList = () => {
    const cleaned = (draft ?? [])
      .map((l) => ({ ...l, name: l.name.trim(), url: withScheme(l.url.trim()) }))
      .filter((l) => l.name && l.url)
    localStorage.setItem(listKey(item.id), JSON.stringify(cleaned))
    setSavedList(cleaned)
    setDraft(null)
    schedulePrefsPush()
  }

  const resetList = () => {
    localStorage.removeItem(listKey(item.id))
    setSavedList(null)
    setDraft(null)
    schedulePrefsPush()
  }

  return (
    <div className="rounded-2xl p-4 border border-slate-200 bg-white/50 dark:border-white/10 dark:bg-white/[0.03] space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {isReadable ? '📖 Where to read' : '▶ Where to watch'}
        </h3>
        <div className="flex items-center gap-3">
          {!draft && (
            <button onClick={startEdit} className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-violet-500">
              ✎ Edit
            </button>
          )}
          {anilistUrl && (
            <a href={anilistUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-violet-500 hover:underline">
              AniList ↗
            </a>
          )}
        </div>
      </div>

      {customLink && !editing && !draft && (
        <a href={customLink} target="_blank" rel="noopener noreferrer" className="btn-glow w-full !py-2.5">
          {isReadable ? '📖 Continue reading' : '▶ Continue watching'}
          {item.progress > 0 && <span className="opacity-80 text-xs">· ep/ch {item.progress + 1}</span>}
        </a>
      )}

      {draft ? (
        <div className="space-y-2">
          {draft.length === 0 && <p className="text-xs text-slate-500">No links. Add one below.</p>}
          {draft.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-8 rounded-full shrink-0 ${l.color.startsWith('#') ? '' : `bg-gradient-to-b ${l.color}`}`}
                style={l.color.startsWith('#') ? { backgroundColor: l.color } : undefined}
              />
              <input
                value={l.name}
                onChange={(e) => updateDraft(i, { name: e.target.value })}
                placeholder="Name"
                className="input-premium !px-2.5 !py-1.5 text-sm !w-28 shrink-0"
              />
              <input
                value={l.url}
                onChange={(e) => updateDraft(i, { url: e.target.value })}
                placeholder="https://…"
                className="input-premium !px-2.5 !py-1.5 text-sm min-w-0"
              />
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-[10px] leading-none px-1 text-slate-500 hover:text-violet-500 disabled:opacity-30"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === draft.length - 1}
                  className="text-[10px] leading-none px-1 text-slate-500 hover:text-violet-500 disabled:opacity-30"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <button
                onClick={() => setDraft((d) => d && d.filter((_, j) => j !== i))}
                className="w-8 h-8 shrink-0 grid place-items-center rounded-lg text-rose-500 hover:bg-rose-500/10"
                aria-label={`Delete ${l.name || 'link'}`}
              >
                🗑
              </button>
            </div>
          ))}
          <button
            onClick={() => setDraft((d) => [...(d ?? []), { name: '', url: '', color: CUSTOM_COLOR }])}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-violet-400 py-1.5 text-xs font-semibold text-slate-500 hover:text-violet-500"
          >
            + Add link
          </button>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={saveList} className="btn-glow !px-4 !py-1.5 text-sm">
              Save
            </button>
            <button onClick={() => setDraft(null)} className="chip !px-3 !py-1.5 !text-xs">
              Cancel
            </button>
            {savedList && (
              <button onClick={resetList} className="ml-auto text-xs font-semibold text-slate-500 hover:text-rose-500">
                ↺ Reset to default
              </button>
            )}
          </div>
        </div>
      ) : savedList ? (
        savedList.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {savedList.map((l, i) => (
              <LinkChip key={i} link={l} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">All links removed. Use ✎ Edit to add some back.</p>
        )
      ) : (
        <>
          {officialButtons.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {officialButtons.map((l) => (
                <LinkChip key={l.name + l.url} link={l} />
              ))}
            </div>
          )}
          {officialButtons.length > 0 && (
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 -mb-1">Search elsewhere</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {searchButtons.map((l) => (
              <LinkChip key={l.name} link={l} />
            ))}
          </div>
        </>
      )}

      {!draft &&
        (editing ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={customLink}
              onChange={(e) => setCustomLink(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveLink()}
              placeholder="Paste your watch/read link"
              className="input-premium !py-2 text-sm"
            />
            <button onClick={saveLink} className="btn-glow !px-3 text-sm shrink-0">
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-full text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-violet-500 transition-colors"
          >
            {customLink ? '✎ Change my link' : '+ Add my own link'}
          </button>
        ))}
    </div>
  )
}
