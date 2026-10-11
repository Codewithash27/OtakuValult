/** Reader-friendly themes, each mapped to the AniList tags that mean it. */
export interface Theme {
  id: string
  label: string
  tags: string[]
}

export const THEMES: Theme[] = [
  { id: 'married', label: 'Married woman', tags: ['Marriage', 'Arranged Marriage'] },
  { id: 'affair', label: 'Affair / cheating', tags: ['Cheating'] },
  { id: 'ntr', label: 'NTR', tags: ['Netorare', 'Netori'] },
  { id: 'cuckold', label: 'Cuckold / sharing', tags: ['Netorase'] },
  { id: 'swap', label: 'Swapping', tags: ['Swapping'] },
  { id: 'harem', label: 'Harem', tags: ['Female Harem', 'Mixed Gender Harem'] },
  { id: 'milf', label: 'MILF', tags: ['MILF'] },
  { id: 'threesome', label: 'Threesome / group', tags: ['Threesome', 'Group Sex'] },
  { id: 'triangle', label: 'Love triangle', tags: ['Love Triangle'] },
  { id: 'agegap', label: 'Age gap', tags: ['Age Gap'] },
  { id: 'office', label: 'Office', tags: ['Office', 'Office Lady'] },
  { id: 'cohab', label: 'Living together', tags: ['Cohabitation'] },
  { id: 'blackmail', label: 'Blackmail', tags: ['Blackmail'] },
  { id: 'exhib', label: 'Exhibitionism / voyeur', tags: ['Exhibitionism', 'Voyeur', 'Public Sex'] },
  { id: 'revenge', label: 'Revenge', tags: ['Revenge'] },
]

export const THEME_TAGS = new Set(THEMES.flatMap((t) => t.tags))

export const hasTheme = (tags: string[] | undefined, theme: Theme) => !!tags?.some((t) => theme.tags.includes(t))
