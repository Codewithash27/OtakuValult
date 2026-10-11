export type PanelKind = 'panel' | 'sticker' | 'edit'
export type Orientation = 'portrait' | 'landscape' | 'square'

export interface Panel {
  id: string
  user_id: string
  media_item_id: string | null
  storage_path: string
  thumb_path: string
  kind: PanelKind
  width: number
  height: number
  adult: boolean
  tags: string[]
  caption: string | null
  created_at: string
}

export const PANEL_KINDS: { id: PanelKind; label: string; plural: string }[] = [
  { id: 'panel', label: 'Panel', plural: 'Panels' },
  { id: 'sticker', label: 'Sticker', plural: 'Stickers' },
  { id: 'edit', label: 'Edit', plural: 'Edits' },
]

export const ORIENTATIONS: { id: Orientation; label: string }[] = [
  { id: 'portrait', label: 'Portrait' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'square', label: 'Square' },
]

export function orientationOf(p: Pick<Panel, 'width' | 'height'>): Orientation {
  const ratio = p.width / p.height
  if (ratio > 1.1) return 'landscape'
  if (ratio < 0.9) return 'portrait'
  return 'square'
}

export const normalizeTag = (tag: string) => tag.trim().replace(/\s+/g, ' ').toLowerCase()
