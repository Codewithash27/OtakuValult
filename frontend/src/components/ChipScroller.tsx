import { ReactNode, useEffect, useRef, useState } from 'react'

interface ChipScrollerProps {
  children: ReactNode
  label?: string
  className?: string
  railClassName?: string
}

/** One-line horizontal chip rail with edge fades, arrow buttons and wheel scrolling. */
export function ChipScroller({ children, label, className = '', railClassName = '' }: ChipScrollerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const update = () => {
    const el = ref.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollBy({ left: e.deltaY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [children])

  const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: 'smooth' })

  return (
    <div className={`group/rail relative flex items-center gap-2 min-w-0 ${className}`}>
      {label && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {label}
        </span>
      )}
      <div className="relative min-w-0 flex-1">
        <div
          ref={ref}
          onScroll={update}
          className={`chip-rail ${railClassName} ${edges.left ? 'fade-l' : ''} ${edges.right ? 'fade-r' : ''}`}
        >
          {children}
        </div>
        {edges.left && (
          <button type="button" aria-label="Scroll left" onClick={() => nudge(-1)} className="rail-arrow left-0">
            ‹
          </button>
        )}
        {edges.right && (
          <button type="button" aria-label="Scroll right" onClick={() => nudge(1)} className="rail-arrow right-0">
            ›
          </button>
        )}
      </div>
    </div>
  )
}
