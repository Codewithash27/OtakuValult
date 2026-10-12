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
      className={`intro-splash ${leaving ? 'intro-splash-leave' : ''}`}
      style={{ ['--fade' as string]: `${FADE_MS}ms` }}
    >
      <div className="intro-splash-glow" />
      <div className="intro-splash-inner">
        <div className="intro-logo">
          <div className="intro-logo-aura" />
          <div className="intro-logo-mark">宝</div>
        </div>
        <div className="intro-splash-copy">
          <h1 className="intro-title">
            Otaku<span className="text-gradient">Vault</span>
          </h1>
          <p className="intro-tagline">Anime · Manga · Manhwa</p>
        </div>
      </div>
    </div>
  )
}
