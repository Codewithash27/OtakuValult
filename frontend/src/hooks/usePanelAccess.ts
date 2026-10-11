import { useCallback, useEffect, useMemo, useState } from 'react'
import { MediaItem } from '../types/media'
import { Panel } from '../types/panel'
import { useContentMode, useIsAdult } from './useAdultFilter'

const BLUR_KEY = 'gallery-blur'
const BLUR_EVENT = 'gallery-blur-changed'

/** A panel counts as 18+ if it was marked so, or its linked title is 18+. */
export function usePanelAccess(panels: Panel[], items: MediaItem[]) {
  const [contentMode] = useContentMode()
  const isAdultItem = useIsAdult(items)
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const isAdultPanel = useCallback(
    (p: Panel) => {
      if (p.adult) return true
      const item = p.media_item_id ? itemsById.get(p.media_item_id) : undefined
      return !!item && isAdultItem(item)
    },
    [itemsById, isAdultItem],
  )

  const visible = useMemo(
    () => (contentMode === 'clean' ? panels.filter((p) => !isAdultPanel(p)) : panels),
    [panels, contentMode, isAdultPanel],
  )

  return { visible, hiddenCount: panels.length - visible.length, isAdultPanel, isAdultItem, itemsById, contentMode }
}

export function useGalleryBlur() {
  const [blur, setBlurState] = useState(() => localStorage.getItem(BLUR_KEY) === '1')
  useEffect(() => {
    const sync = () => setBlurState(localStorage.getItem(BLUR_KEY) === '1')
    window.addEventListener(BLUR_EVENT, sync)
    return () => window.removeEventListener(BLUR_EVENT, sync)
  }, [])
  const setBlur = useCallback((on: boolean) => {
    localStorage.setItem(BLUR_KEY, on ? '1' : '0')
    window.dispatchEvent(new Event(BLUR_EVENT))
  }, [])
  return [blur, setBlur] as const
}
