import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MediaItem } from '../types/media'
import { PosterImage } from './PosterImage'
import { StatusBadge } from './StatusBadge'

interface PosterWallProps {
  items: MediaItem[]
  onClose: () => void
}

const MIN_PER_COLUMN = 8
// Every poster is rendered twice for the endless scroll, so large shelves are sampled.
const MAX_POSTERS = 160

function columnCount(width: number) {
  return Math.min(9, Math.max(3, Math.floor(width / 190)))
}

function WallPoster({ item, onHover, onOpen }: { item: MediaItem; onHover: (i: MediaItem) => void; onOpen: (i: MediaItem) => void }) {
  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--ry', `${(x - 0.5) * 22}deg`)
    el.style.setProperty('--rx', `${(0.5 - y) * 22}deg`)
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
  }

  const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty('--rx', '0deg')
    e.currentTarget.style.setProperty('--ry', '0deg')
  }

  return (
    <button
      onClick={() => onOpen(item)}
      onMouseEnter={() => onHover(item)}
      onFocus={() => onHover(item)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="wall-poster card-3d group relative block w-full overflow-hidden rounded-xl text-left outline-none focus-visible:ring-4 focus-visible:ring-violet-500"
      aria-label={item.title}
    >
      <PosterImage
        src={item.poster_url}
        alt={item.title}
        mediaType={item.media_type}
        className="w-full aspect-[2/3] transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="glare absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 p-2.5 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
        <p className="text-sm font-display font-semibold text-white leading-tight line-clamp-2 drop-shadow-lg">{item.title}</p>
        {item.rating ? <p className="text-xs font-bold text-amber-300">★ {item.rating}</p> : null}
      </div>
    </button>
  )
}

export function PosterWall({ items, onClose }: PosterWallProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [width, setWidth] = useState(() => window.innerWidth)
  const [focused, setFocused] = useState<MediaItem | null>(null)
  const [tilted, setTilted] = useState(true)

  const drawerOpen = searchParams.has('item')

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    document.body.classList.add('cinema-open')
    return () => document.body.classList.remove('cinema-open')
  }, [])

  const open = (item: MediaItem) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('item', item.id)
      return next
    })

  const shuffle = () => {
    if (!items.length) return
    const pick = items[Math.floor(Math.random() * items.length)]
    setFocused(pick)
    open(pick)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (drawerOpen) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') onClose()
      else if (e.key.toLowerCase() === 's') shuffle()
      else if (e.key.toLowerCase() === 't') setTilted((t) => !t)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const columns = useMemo(() => {
    if (!items.length) return []
    const count = columnCount(width)
    const cols: MediaItem[][] = Array.from({ length: count }, () => [])
    const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, MAX_POSTERS)
    shuffled.forEach((item, i) => cols[i % count].push(item))
    return cols.map((col, c) => {
      let filled = col.length ? col : shuffled.slice(c % shuffled.length, (c % shuffled.length) + 1)
      while (filled.length < MIN_PER_COLUMN) filled = [...filled, ...filled]
      return filled
    })
  }, [items, width])

  const hero = focused || items[0] || null

  return (
    <div className="fixed inset-0 z-[45] overflow-hidden bg-[#05040b] text-white animate-[fadeIn_.4s_ease]">
      {hero?.poster_url && (
        <img
          key={hero.id}
          src={hero.poster_url}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-40 animate-[fadeIn_.6s_ease]"
        />
      )}

      {columns.length ? (
        <div className="wall-stage absolute inset-0">
          <div className={`wall-plane flex gap-4 px-4 ${tilted ? 'wall-plane-tilted' : ''}`}>
            {columns.map((col, c) => (
              <div
                key={c}
                className={`wall-col flex-1 min-w-0 ${c % 2 ? 'wall-col-reverse' : ''}`}
                style={{ ['--dur' as string]: `${70 + (c % 3) * 18 + col.length * 2}s` }}
              >
                {[0, 1].map((rep) =>
                  col.map((item, i) => (
                    <div key={`${rep}-${i}-${item.id}`} className="pb-4">
                      <WallPoster item={item} onHover={setFocused} onOpen={open} />
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center text-center px-6">
          <div>
            <p className="text-5xl mb-4">🎞️</p>
            <p className="text-xl font-display font-semibold">Nothing to project yet</p>
            <p className="text-white/60 mt-1">Add titles or clear your filters to fill the wall.</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(5,4,11,.9)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#05040b] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#05040b] via-[#05040b]/80 to-transparent" />

      <header className="absolute top-0 inset-x-0 p-4 lg:p-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-violet-300">Now showing</p>
          <h2 className="text-2xl lg:text-3xl font-bold">
            Cinematic <span className="text-gradient">Vault</span>
          </h2>
          <p className="text-xs text-white/50">{items.length} titles on the wall</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTilted((t) => !t)}
            className="hidden sm:inline-flex h-10 px-3 items-center rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-sm font-semibold transition-colors"
            title="Toggle tilt (T)"
          >
            {tilted ? '▦ Flat' : '◢ Tilt'}
          </button>
          <button onClick={shuffle} disabled={!items.length} className="btn-glow !py-2 text-sm" title="Surprise me (S)">
            🎲 Surprise me
          </button>
          <button
            onClick={onClose}
            className="w-10 h-10 grid place-items-center rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 transition-colors"
            aria-label="Close poster wall"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </header>

      {hero && (
        <footer key={hero.id} className="pointer-events-none absolute bottom-0 left-0 p-4 lg:p-8 max-w-xl animate-fade-up">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-widest text-white/60">
            <span>{hero.media_type}</span>
            {hero.year && <span>· {hero.year}</span>}
          </div>
          <h3 className="text-3xl lg:text-5xl font-display font-bold leading-tight drop-shadow-2xl line-clamp-2">{hero.title}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={hero.status} size="sm" />
            {hero.rating ? <span className="font-bold text-amber-300">★ {hero.rating}/10</span> : null}
            {hero.total ? (
              <span className="text-white/70">
                {hero.progress}/{hero.total} {hero.media_type === 'manga' || hero.media_type === 'manhwa' ? 'ch' : 'ep'}
              </span>
            ) : null}
          </div>
          {hero.total ? (
            <div className="mt-3 h-1.5 w-64 max-w-full rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400"
                style={{ width: `${Math.min(100, (hero.progress / hero.total) * 100)}%` }}
              />
            </div>
          ) : null}
          <p className="mt-3 text-xs text-white/40 hidden sm:block">
            Click a poster to open · S surprise · T tilt · Esc close
          </p>
        </footer>
      )}
    </div>
  )
}
