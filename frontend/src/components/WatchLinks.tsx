import { useEffect, useState } from 'react'
import { MediaItem } from '../types/media'

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

const storageKey = (id: string) => `watch-link:${id}`

export function WatchLinks({ item }: { item: MediaItem }) {
  const [customLink, setCustomLink] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setCustomLink(localStorage.getItem(storageKey(item.id)) || '')
    setEditing(false)
  }, [item.id])

  const saveLink = () => {
    let url = customLink.trim()
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
    if (url) localStorage.setItem(storageKey(item.id), url)
    else localStorage.removeItem(storageKey(item.id))
    setCustomLink(url)
    setEditing(false)
  }

  const isReadable = item.media_type === 'manga' || item.media_type === 'manhwa'
  const anilistUrl =
    item.source === 'anilist' && item.external_id
      ? `https://anilist.co/${item.media_type === 'anime' ? 'anime' : 'manga'}/${item.external_id}`
      : null

  return (
    <div className="rounded-2xl p-4 border border-slate-200 bg-white/50 dark:border-white/10 dark:bg-white/[0.03] space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {isReadable ? '📖 Where to read' : '▶ Where to watch'}
        </h3>
        {anilistUrl && (
          <a href={anilistUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-violet-500 hover:underline">
            AniList ↗
          </a>
        )}
      </div>

      {customLink && !editing && (
        <a href={customLink} target="_blank" rel="noopener noreferrer" className="btn-glow w-full !py-2.5">
          {isReadable ? '📖 Continue reading' : '▶ Continue watching'}
          {item.progress > 0 && <span className="opacity-80 text-xs">· ep/ch {item.progress + 1}</span>}
        </a>
      )}

      <div className="grid grid-cols-2 gap-2">
        {PLATFORMS[item.media_type].map((p) => (
          <a
            key={p.name}
            href={p.url(item.title)}
            target="_blank"
            rel="noopener noreferrer"
            className={`group relative overflow-hidden rounded-xl px-3 py-2 text-sm font-semibold text-white bg-gradient-to-r ${p.color} hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 flex items-center justify-between`}
          >
            <span className="truncate">{p.name}</span>
            <span className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
          </a>
        ))}
      </div>

      {editing ? (
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
      )}
    </div>
  )
}
