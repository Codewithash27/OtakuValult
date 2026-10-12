import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { MediaItem } from '../types/media'
import type { ContentMode } from '../hooks/useAdultFilter'
import { chartCoverUrl, fetchManhwaChartPage } from '../lib/manhwaCharts'
import { isBackendConfigured } from '../lib/api'

const PLAYED_KEY = 'vault-intro-played'
const OFF_KEY = 'vault-intro-off'
const SHOT_MS = 1300
const SHOTS = 4
const OUTRO_MS = 1700

export const introWanted = () =>
  !sessionStorage.getItem(PLAYED_KEY) &&
  !localStorage.getItem(OFF_KEY) &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Resolves true once the app's logo splash (IntroSplash) has finished, so the two never overlap. */
export function useSplashDone() {
  const [done, setDone] = useState(() => !!sessionStorage.getItem('intro-seen'))
  useEffect(() => {
    if (done) return
    const id = window.setInterval(() => sessionStorage.getItem('intro-seen') && setDone(true), 250)
    return () => window.clearInterval(id)
  }, [done])
  return done
}

type Shot = { key: string; title: string; poster: string }

interface LibraryIntroProps {
  items: MediaItem[]
  mode: ContentMode
  isAdult: (i: MediaItem) => boolean
  onDone: () => void
}

/** Once-per-session cinematic opener: Clean shows safe favourites, Creamy shows 18+ manhwa highlights. */
export function LibraryIntro({ items, mode, isAdult, onDone }: LibraryIntroProps) {
  const creamy = mode === 'creamy'
  const [leaving, setLeaving] = useState(false)
  const chart = useQuery({
    queryKey: ['manhwa-chart', 'top-rated', 1, null, 12],
    queryFn: () => fetchManhwaChartPage(1, 'top-rated', 12),
    enabled: creamy && isBackendConfigured(),
    staleTime: 30 * 60 * 1000,
  })

  const shots = useMemo<Shot[]>(() => {
    const rank = (a: MediaItem, b: MediaItem) =>
      Number(b.status === 'watching') - Number(a.status === 'watching') || (b.rating || 0) - (a.rating || 0)
    const pool = items.filter((i) => i.poster_url && (creamy ? isAdult(i) : !isAdult(i)))
    const fromShelf: Shot[] = [...pool].sort(rank).slice(0, SHOTS).map((i) => ({ key: i.id, title: i.title, poster: i.poster_url! }))
    if (!creamy || fromShelf.length >= SHOTS) return fromShelf
    const seen = new Set(fromShelf.map((s) => s.title.toLowerCase()))
    const extra = (chart.data?.items ?? [])
      .filter((m) => m.coverImage && !seen.has(m.title.toLowerCase()))
      .map((m) => ({ key: m.slug, title: m.title, poster: chartCoverUrl(m.coverImage)! }))
    return [...fromShelf, ...extra].slice(0, SHOTS)
  }, [items, creamy, isAdult, chart.data])

  const finish = () => {
    sessionStorage.setItem(PLAYED_KEY, '1')
    setLeaving(true)
    window.setTimeout(onDone, 450)
  }

  const total = shots.length * SHOT_MS + OUTRO_MS
  const waitingForChart = creamy && shots.length < SHOTS && isBackendConfigured() && !chart.isFetched
  const ready = shots.length > 0 && !waitingForChart
  useEffect(() => {
    if (!ready) return
    const id = window.setTimeout(finish, total)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, total])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') && finish()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (shots.length === 0 && (!creamy || chart.isFetched || !isBackendConfigured())) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots.length, creamy, chart.isFetched])

  if (!ready) return null

  return createPortal(
    <div className={`intro-reel fixed inset-0 z-[90] bg-black text-white overflow-hidden ${leaving ? 'intro-leave' : ''}`}>
      {shots.map((s, i) => (
        <div key={s.key} className="intro-shot absolute inset-0" style={{ ['--d' as string]: `${i * SHOT_MS}ms`, ['--shot' as string]: `${SHOT_MS}ms` }}>
          <img src={s.poster} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-50" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,#000_80%)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
            <img src={s.poster} alt="" className="intro-poster w-40 sm:w-56 aspect-[2/3] object-cover rounded-2xl ring-1 ring-white/20" />
            <p className="intro-name text-xl sm:text-3xl font-display font-bold text-center px-6 line-clamp-2 drop-shadow-2xl">{s.title}</p>
          </div>
        </div>
      ))}

      <div className="intro-outro absolute inset-0 grid place-items-center text-center" style={{ ['--d' as string]: `${shots.length * SHOT_MS}ms` }}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.45em] text-lantern-300">{creamy ? 'Tonight, after dark' : 'Welcome back'}</p>
          <h1 className="mt-3 text-5xl sm:text-7xl font-bold">
            {creamy ? (
              <span className="font-serif italic text-gradient">After Dark</span>
            ) : (
              <>
                Otaku<span className="text-gradient">Vault</span>
              </>
            )}
          </h1>
          <p className="mt-2 text-sm text-white/60">{creamy ? 'Your 18+ manhwa, uncovered.' : 'Your anime & manga, all in one place.'}</p>
        </div>
      </div>

      <div className="reel-grain absolute inset-0 pointer-events-none opacity-70" />
      <div className="letterbox letterbox-top" />
      <div className="letterbox letterbox-bottom" />

      <div className="absolute bottom-0 inset-x-0 z-10 h-[13vh] min-h-[84px] flex items-center justify-between px-5 sm:px-10">
        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
          <input
            type="checkbox"
            className="accent-lantern-500"
            onChange={(e) => (e.target.checked ? localStorage.setItem(OFF_KEY, '1') : localStorage.removeItem(OFF_KEY))}
          />
          Don’t autoplay
        </label>
        <div className="flex-1 mx-5 h-0.5 rounded-full bg-white/15 overflow-hidden max-w-md">
          <div className="h-full bg-gradient-to-r from-lantern-400 to-jade-400 reel-timer" style={{ ['--reel-ms' as string]: `${total}ms` }} />
        </div>
        <button onClick={finish} className="premiere-ctl !px-4">Skip ›</button>
      </div>
    </div>,
    document.body
  )
}
