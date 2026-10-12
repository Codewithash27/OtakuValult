import { useCallback, useEffect, useState } from 'react'

/** Auto-advancing index with pause; `tick` changes on every slide so CSS timer bars can restart. */
export function useSlideshow(length: number, intervalMs: number, paused: boolean) {
  const [index, setIndex] = useState(0)
  const [tick, setTick] = useState(0)

  const go = useCallback(
    (i: number) => {
      if (!length) return
      setIndex(((i % length) + length) % length)
      setTick((t) => t + 1)
    },
    [length]
  )
  const next = useCallback(() => go(index + 1), [go, index])
  const prev = useCallback(() => go(index - 1), [go, index])

  useEffect(() => {
    if (index >= length && length) setIndex(0)
  }, [index, length])

  useEffect(() => {
    if (paused || length < 2) return
    const id = window.setTimeout(next, intervalMs)
    return () => window.clearTimeout(id)
  }, [paused, length, intervalMs, next, tick])

  useEffect(() => {
    const onVis = () => setTick((t) => t + 1)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return { index: Math.min(index, Math.max(0, length - 1)), tick, go, next, prev }
}

/** Horizontal swipe handlers for touch devices. */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const [start, setStart] = useState<number | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => setStart(e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (start === null) return
      const dx = e.changedTouches[0].clientX - start
      if (Math.abs(dx) > 40) (dx < 0 ? onLeft : onRight)()
      setStart(null)
    },
  }
}
