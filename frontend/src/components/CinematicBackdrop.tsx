import { CSSProperties, RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { ShowcasePoster, useShowcase } from '../lib/showcase'

const MIN_PER_COLUMN = 8
const PLACEHOLDER_COLORS = ['#4c1d95', '#831843', '#155e75', '#3730a3', '#701a75', '#1e3a8a', '#9f1239', '#134e4a']

function posterWidth(viewport: number) {
  return Math.min(170, Math.max(92, viewport * 0.24))
}

function useColumnCount() {
  const calc = () => Math.ceil(window.innerWidth / (posterWidth(window.innerWidth) + 16)) + 3
  const [count, setCount] = useState(calc)
  useEffect(() => {
    const onResize = () => setCount(calc())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return count
}

/** Pointer on desktop, phone tilt on Android: both nudge the wall a few degrees. */
function useParallax(target: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = target.current
    if (!el) return
    let frame = 0
    const set = (x: number, y: number) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--px', x.toFixed(2))
        el.style.setProperty('--py', y.toFixed(2))
      })
    }
    const clamp = (v: number) => Math.max(-1, Math.min(1, v))
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      set((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2)
    }
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      set(clamp(e.gamma / 30), clamp((e.beta - 45) / 30))
    }
    window.addEventListener('pointermove', onPointer)
    window.addEventListener('deviceorientation', onTilt)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('deviceorientation', onTilt)
    }
  }, [target])
}

function buildColumns(posters: ShowcasePoster[], count: number): ShowcasePoster[][] {
  const source: ShowcasePoster[] = posters.length
    ? posters
    : PLACEHOLDER_COLORS.flatMap((color, i) => [0, 1, 2].map((k) => ({ id: -(i * 3 + k + 1), title: '', cover: '', color })))
  const columns: ShowcasePoster[][] = Array.from({ length: count }, () => [])
  source.forEach((p, i) => columns[i % count].push(p))
  return columns.map((col, c) => {
    const filled = [...col]
    // Short columns borrow posters from further along the list so every column scrolls seamlessly.
    for (let k = 0; filled.length < MIN_PER_COLUMN; k++) filled.push(source[(c * 5 + k * 7) % source.length])
    return filled
  })
}

export function CinematicBackdrop() {
  const posters = useShowcase()
  const count = useColumnCount()
  const columns = useMemo(() => buildColumns(posters, count), [posters, count])
  const stage = useRef<HTMLDivElement>(null)
  useParallax(stage)

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#07060f]" aria-hidden>
      <div ref={stage} className="backdrop-stage absolute inset-0">
        <div className="backdrop-parallax absolute inset-0">
          <div className="backdrop-plane flex justify-center gap-4">
            {columns.map((col, i) => (
              <div
                key={i}
                className={`wall-col flex flex-col gap-4 shrink-0 ${i % 2 ? 'wall-col-reverse' : ''}`}
                style={{ '--dur': `${70 + (i % 3) * 18}s` } as CSSProperties}
              >
                {[...col, ...col].map((p, j) =>
                  p.cover ? (
                    <img
                      key={j}
                      src={p.cover}
                      alt=""
                      draggable={false}
                      decoding="async"
                      className="backdrop-poster"
                      style={{ backgroundColor: p.color ?? '#1e1b3a' }}
                    />
                  ) : (
                    <div
                      key={j}
                      className="backdrop-poster"
                      style={{ background: `linear-gradient(160deg, ${p.color}, #07060f)` }}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_45%,rgba(124,58,237,.28),transparent_60%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#07060f]/70 via-[#07060f]/30 to-[#07060f]/90" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#07060f]/85 via-[#07060f]/20 to-[#07060f]/50 max-lg:from-[#07060f]/50 max-lg:to-[#07060f]/50" />
    </div>
  )
}
