import { useCallback, useEffect, useRef, useState } from 'react'

const SEEN_KEY = 'intro-seen'
const SHOW_MS = 1500
const FADE_MS = 600

function shouldPlay() {
  if (sessionStorage.getItem(SEEN_KEY)) return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function IntroSplash() {
  const [show, setShow] = useState(shouldPlay)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<number>()

  useEffect(() => {
    if (!show) sessionStorage.setItem(SEEN_KEY, '1')
  }, [show])

  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    sessionStorage.setItem(SEEN_KEY, '1')
    setLeaving(true)
    window.setTimeout(() => setShow(false), FADE_MS)
  }, [])

  useEffect(() => {
    if (!show) return
    timer.current = window.setTimeout(close, SHOW_MS)
    document.body.classList.add('cinema-open')
    return () => {
      window.clearTimeout(timer.current)
      document.body.classList.remove('cinema-open')
    }
  }, [show, close])

  if (!show) return null

  return (
    <div
      role="presentation"
      onClick={close}
      className={`fixed inset-0 z-[100] grid place-items-center bg-[#07060f] text-white overflow-hidden transition-all ease-out ${
        leaving ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,.35),transparent_60%)]" />
      <div className="relative flex flex-col items-center text-center px-6">
        <div className="intro-logo relative w-16 h-16 sm:w-20 sm:h-20 mb-4">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-lantern-400 via-vermilion-500 to-jade-400 blur-xl opacity-80 animate-[spin_6s_linear_infinite]" />
          <div className="relative w-full h-full rounded-2xl bg-gradient-to-b from-lantern-400 to-vermilion-600 grid place-items-center font-jp font-bold text-3xl sm:text-4xl shadow-2xl border border-white/30">
            宝
          </div>
        </div>
        <h1 className="intro-title font-display font-bold text-5xl sm:text-7xl tracking-tight drop-shadow-[0_6px_40px_rgba(168,85,247,.6)]">
          Otaku<span className="text-gradient">Vault</span>
        </h1>
        <p className="intro-tagline mt-3 text-xs sm:text-sm font-semibold uppercase tracking-[0.4em] text-white/60">
          Anime · Manga · Manhwa
        </p>
      </div>
    </div>
  )
}
