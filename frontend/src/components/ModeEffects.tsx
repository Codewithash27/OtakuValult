import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CURTAIN_CLOSE_MS, MODE_CURTAIN_EVENT, useContentMode, type ContentMode } from '../hooks/useAdultFilter'
import { useToast } from './Toast'

/** Event any component can fire to drop straight into Clean mode (panic / boss key). */
export const PANIC_EVENT = 'vault:panic'
export const triggerPanic = () => window.dispatchEvent(new Event(PANIC_EVENT))

const CURTAIN_TOTAL_MS = 1700

const CARD: Record<ContentMode, { kanji: string; title: string; sub: string }> = {
  creamy: { kanji: '夜', title: 'After Dark', sub: '18+ · Creamy mode' },
  clean: { kanji: '灯', title: 'Lantern Night', sub: 'Clean mode · all ages' },
}

/** Applies the mood theme to <html>, plays the curtain on mode switches, and wires the panic key. */
export function ModeEffects() {
  const [mode, setMode] = useContentMode()
  const [curtain, setCurtain] = useState<ContentMode | null>(null)
  const { showToast } = useToast()
  const lastEsc = useRef(0)
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.dataset.mode = mode
  }, [mode])

  useEffect(() => {
    let timer: number | undefined
    const onCurtain = (e: Event) => {
      setCurtain((e as CustomEvent<ContentMode>).detail)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setCurtain(null), CURTAIN_TOTAL_MS)
    }
    window.addEventListener(MODE_CURTAIN_EVENT, onCurtain)
    return () => {
      window.removeEventListener(MODE_CURTAIN_EVENT, onCurtain)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const panic = () => {
      setCurtain(null)
      setMode('clean', { instant: true })
      if (/^\/(title|community-lists|manhwa)/.test(window.location.pathname)) navigate('/', { replace: true })
      showToast('Clean mode on', 'success')
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const now = Date.now()
      if (now - lastEsc.current < 450 && document.documentElement.dataset.mode === 'creamy') panic()
      lastEsc.current = now
    }
    window.addEventListener(PANIC_EVENT, panic)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(PANIC_EVENT, panic)
      window.removeEventListener('keydown', onKey)
    }
  }, [setMode, showToast, navigate])

  if (!curtain) return null
  const card = CARD[curtain]
  return createPortal(
    <div className={`curtain curtain-${curtain}`} style={{ ['--close' as string]: `${CURTAIN_CLOSE_MS}ms` }} aria-hidden>
      <div className="curtain-panel curtain-left" />
      <div className="curtain-panel curtain-right" />
      <div className="curtain-valance" />
      <div className="curtain-card">
        <span className="curtain-kanji">{card.kanji}</span>
        <p className="curtain-title">{card.title}</p>
        <p className="curtain-sub">{card.sub}</p>
      </div>
    </div>,
    document.body
  )
}
