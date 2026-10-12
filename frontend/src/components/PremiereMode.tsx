import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MediaItem, STATUS_LABELS } from '../types/media'
import { THEMES, hasTheme } from '../lib/themes'
import { PosterImage } from './PosterImage'
import { useSynopsis } from '../hooks/useSynopsis'
import { useSlideshow, useSwipe } from '../hooks/useSlideshow'
import { useContentMode } from '../hooks/useAdultFilter'

const SPEEDS = [5000, 8000, 12000]

/** Creamy-mode playlist names for each theme. */
const MOOD_NAMES: Record<string, string> = {
  married: 'Married & tempted',
  affair: 'Forbidden affairs',
  ntr: 'NTR marathon',
  cuckold: 'Shared secrets',
  swap: 'Swap club',
  harem: 'Harem party',
  milf: 'MILF night',
  threesome: 'Three’s company',
  triangle: 'Love triangles',
  agegap: 'Older & wiser',
  office: 'Office after hours',
  campus: 'Campus nights',
  family: 'Taboo family',
  cohab: 'Under one roof',
  blackmail: 'Dark desires',
  exhib: 'Watched & wanted',
  revenge: 'Sweet revenge',
  fantasy: 'Fantasy fling',
}

interface PremiereModeProps {
  items: MediaItem[]
  startId?: string
  tagsOf: (i: MediaItem) => string[] | undefined
  onOpen: (i: MediaItem) => void
  onClose: () => void
}

type Playlist = { id: string; label: string; filter: (i: MediaItem) => boolean }

export function PremiereMode({ items, startId, tagsOf, onOpen, onClose }: PremiereModeProps) {
  const [mode] = useContentMode()
  const creamy = mode === 'creamy'
  const playlists = useMemo<Playlist[]>(() => {
    const base: Playlist[] = [
      { id: 'all', label: 'Everything', filter: () => true },
      { id: 'reading', label: 'In progress', filter: (i) => i.status === 'watching' },
      { id: 'done', label: 'Completed', filter: (i) => i.status === 'completed' },
      { id: 'plan', label: 'Up next (plan)', filter: (i) => i.status === 'plan_to_watch' },
      { id: 'best', label: 'Rated 8+', filter: (i) => (i.rating || 0) >= 8 },
    ]
    const themed = THEMES.map((t) => ({
      id: `t-${t.id}`,
      label: creamy ? MOOD_NAMES[t.id] ?? `${t.label} night` : t.label,
      filter: (i: MediaItem) => hasTheme(tagsOf(i), t),
    }))
    return [...base, ...themed].filter((p) => items.some((i) => i.poster_url && p.filter(i)))
  }, [items, tagsOf, creamy])

  const [playlistId, setPlaylistId] = useState('all')
  const [shuffled, setShuffled] = useState(false)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)

  const queue = useMemo(() => {
    const p = playlists.find((x) => x.id === playlistId) ?? playlists[0]
    const list = items.filter((i) => i.poster_url && (p?.filter(i) ?? true))
    if (shuffled) return [...list].sort(() => Math.random() - 0.5)
    if (startId && playlistId === 'all') {
      const at = list.findIndex((i) => i.id === startId)
      if (at > 0) return [...list.slice(at), ...list.slice(0, at)]
    }
    return list
  }, [items, playlists, playlistId, shuffled, startId])

  const { index, tick, go, next, prev } = useSlideshow(queue.length, SPEEDS[speed], paused)
  const swipe = useSwipe(next, prev)
  const current = queue[index] ?? null
  const synopsis = useSynopsis(current)
  const upcoming = useMemo(() => Array.from({ length: Math.min(8, queue.length) }, (_, k) => queue[(index + k) % queue.length]), [queue, index])

  useEffect(() => {
    const owned = !document.body.classList.contains('cinema-open')
    document.body.classList.add('cinema-open')
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === ' ') {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (owned) document.body.classList.remove('cinema-open')
    }
  }, [next, prev, onClose])

  const unit = current?.media_type === 'anime' ? 'ep' : 'ch'
  const tags = current ? (tagsOf(current) ?? []).slice(0, 6) : []

  return createPortal(
    <div className="premiere fixed inset-0 z-[60] bg-black text-white overflow-hidden select-none" {...swipe}>
      {current && (
        <>
          <img key={`bg-${current.id}`} src={current.poster_url!} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-3xl scale-125 opacity-45 premiere-fade" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,transparent_20%,rgba(0,0,0,.85)_75%)]" />

          <div key={`${current.id}-${tick}`} className="absolute inset-0 flex items-center overflow-y-auto">
            <div className="premiere-flash absolute inset-0 pointer-events-none" />
            <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-12 py-20 md:py-8 grid md:grid-cols-[1fr_auto] gap-5 sm:gap-8 items-center">
              <div className="min-w-0 order-2 md:order-1">
                <p className="reel-in text-[10px] sm:text-[11px] font-bold uppercase tracking-[.16em] sm:tracking-[.4em] text-lantern-300">
                  Now premiering · {index + 1}/{queue.length}
                </p>
                <h2 className="reel-title mt-2 sm:mt-3 text-[1.75rem] sm:text-6xl lg:text-7xl font-display font-extrabold leading-[1.05] drop-shadow-2xl line-clamp-3">
                  {current.title}
                </h2>
                <div className="reel-in mt-4 flex flex-wrap items-center gap-2 text-sm" style={{ animationDelay: '250ms' }}>
                  <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-[11px] font-bold uppercase tracking-wider">{current.media_type}</span>
                  {current.year && <span className="text-white/60">{current.year}</span>}
                  <span className="font-semibold">{STATUS_LABELS[current.status]}</span>
                  {current.rating ? <span className="font-bold text-amber-300">★ {current.rating}/10</span> : null}
                  {current.total ? (
                    <span className="text-white/60">
                      {current.progress}/{current.total} {unit}
                    </span>
                  ) : null}
                </div>
                {tags.length > 0 && (
                  <div className="reel-in mt-3 flex flex-wrap gap-1.5" style={{ animationDelay: '320ms' }}>
                    {tags.map((t) => (
                      <span key={t} className="px-2.5 py-0.5 rounded-full text-xs bg-lantern-500/15 text-lantern-200 border border-lantern-400/25">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {synopsis && (
                  <p className="reel-in mt-4 max-w-xl text-sm sm:text-base text-white/75 leading-relaxed line-clamp-4" style={{ animationDelay: '400ms' }}>
                    {synopsis}
                  </p>
                )}
                <div className="reel-in mt-6 flex gap-2" style={{ animationDelay: '480ms' }}>
                  <button onClick={() => onOpen(current)} className="btn-glow !py-2.5 !px-6">📖 Open details</button>
                </div>
              </div>
              <div className="order-1 md:order-2 justify-self-center">
                <div className="premiere-poster w-32 sm:w-60 lg:w-72 rounded-2xl overflow-hidden ring-1 ring-white/20">
                  <PosterImage src={current.poster_url} alt={current.title} mediaType={current.media_type} className="w-full aspect-[2/3] kenburns-slow" />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {!current && (
        <div className="absolute inset-0 grid place-items-center text-white/70">Nothing in this playlist.</div>
      )}

      <div className="reel-grain absolute inset-0 pointer-events-none opacity-60" />
      <div className="letterbox letterbox-top" />
      <div className="letterbox letterbox-bottom" />

      {/* Top controls (inside the top bar) */}
      <div className="absolute top-0 inset-x-0 z-10 min-h-[56px] flex items-center justify-between gap-2 px-4 sm:px-8 pt-[max(0.4rem,env(safe-area-inset-top))]">
        <p className="hidden sm:block font-display font-bold tracking-wide">
          Otaku<span className="text-gradient">Vault</span>{' '}
          <span className={`text-white/40 font-normal text-sm ${creamy ? 'font-serif italic' : ''}`}>{creamy ? 'After Dark Premiere' : 'Premiere'}</span>
        </p>
        <div className="flex items-center gap-1.5 ml-auto">
          <select value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} className="premiere-ctl max-w-[46vw]" aria-label="Playlist">
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id.startsWith('t-') && creamy ? '🔥' : '🎞'} {p.label}
              </option>
            ))}
          </select>
          <button onClick={() => setShuffled((s) => !s)} className={`premiere-ctl ${shuffled ? '!bg-lantern-500/30 !border-lantern-400/50' : ''}`} title="Shuffle">
            🔀
          </button>
          <button onClick={() => setSpeed((s) => (s + 1) % SPEEDS.length)} className="premiere-ctl tabular-nums" title="Slide speed">
            {SPEEDS[speed] / 1000}s
          </button>
          <button onClick={onClose} className="premiere-ctl" aria-label="Close (Esc)">✕</button>
        </div>
      </div>

      {/* Bottom: timer + filmstrip (inside the bottom bar) */}
      <div className="absolute bottom-0 inset-x-0 z-10 min-h-[72px] flex items-center gap-2 sm:gap-3 px-3 sm:px-8 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button onClick={prev} className="premiere-ctl !w-10" aria-label="Previous">⏮</button>
        <button onClick={() => setPaused((p) => !p)} className="premiere-ctl !w-12 !h-12 !rounded-full text-lg" aria-label={paused ? 'Play' : 'Pause'}>
          {paused ? '▶' : '❚❚'}
        </button>
        <button onClick={next} className="premiere-ctl !w-10" aria-label="Next">⏭</button>
        <div className="flex-1 min-w-0">
          <div className="h-0.5 rounded-full bg-white/15 overflow-hidden mb-2">
            <div
              key={tick}
              className={`h-full bg-gradient-to-r from-lantern-400 to-jade-400 ${paused ? 'w-0' : 'reel-timer'}`}
              style={{ ['--reel-ms' as string]: `${SPEEDS[speed]}ms` }}
            />
          </div>
          <div className="filmstrip flex gap-2 overflow-hidden">
            {upcoming.map((item, k) => (
              <button
                key={`${item.id}-${k}`}
                onClick={() => go(index + k)}
                className={`shrink-0 w-9 sm:w-11 rounded-md overflow-hidden ring-1 transition-all duration-300 ${k === 0 ? 'ring-lantern-400 scale-110' : 'ring-white/10 opacity-50 hover:opacity-100'}`}
                title={item.title}
              >
                <PosterImage src={item.poster_url} alt="" mediaType={item.media_type} className="w-full aspect-[2/3]" />
              </button>
            ))}
          </div>
        </div>
        <p className="hidden lg:block text-[10px] text-white/40 text-right leading-relaxed">
          ← → skip · Space pause
          <br />
          Esc exit
        </p>
      </div>
    </div>,
    document.body
  )
}
