/** Reader-friendly themes, each mapped to the AniList and PornhwaDB tags that mean it. */
export interface Theme {
  id: string
  label: string
  tags: string[]
}

export const THEMES: Theme[] = [
  { id: 'married', label: 'Married woman', tags: ['Marriage', 'Arranged Marriage'] },
  { id: 'affair', label: 'Affair / cheating', tags: ['Cheating', 'Adulterer', 'Betrayal'] },
  { id: 'ntr', label: 'NTR', tags: ['Netorare', 'Netori'] },
  { id: 'cuckold', label: 'Cuckold / sharing', tags: ['Netorase'] },
  { id: 'swap', label: 'Swapping', tags: ['Swapping', 'Multiple Couples'] },
  { id: 'harem', label: 'Harem', tags: ['Female Harem', 'Mixed Gender Harem', 'Harem'] },
  { id: 'milf', label: 'MILF', tags: ['MILF', 'Cougar'] },
  { id: 'threesome', label: 'Threesome / group', tags: ['Threesome', 'Group Sex', 'Oyakodon', 'Shimaidon'] },
  { id: 'triangle', label: 'Love triangle', tags: ['Love Triangle'] },
  { id: 'agegap', label: 'Age gap', tags: ['Age Gap'] },
  { id: 'office', label: 'Office', tags: ['Office', 'Office Lady', 'Workplace'] },
  { id: 'campus', label: 'College / campus', tags: ['College', 'School Life', 'Teacher'] },
  { id: 'family', label: 'Step-family', tags: ['Incest', 'Inseki', 'Step-family'] },
  { id: 'cohab', label: 'Living together', tags: ['Cohabitation'] },
  { id: 'blackmail', label: 'Blackmail', tags: ['Blackmail', 'Mind Control', 'Corruption'] },
  { id: 'exhib', label: 'Exhibitionism / voyeur', tags: ['Exhibitionism', 'Voyeur', 'Voyeurism', 'Public Sex'] },
  { id: 'revenge', label: 'Revenge', tags: ['Revenge'] },
  { id: 'fantasy', label: 'Fantasy / isekai', tags: ['Isekai', 'Fantasy', 'System', 'Reincarnation', 'Supernatural'] },
]

const THEME_KEYS = new Map(THEMES.map((t) => [t.id, new Set(t.tags.map((x) => x.toLowerCase()))]))

/** Lower-cased tag names that belong to a theme (excluded from the "more tags" list). */
export const THEME_TAGS = new Set(THEMES.flatMap((t) => t.tags.map((x) => x.toLowerCase())))

export const hasTheme = (tags: string[] | undefined, theme: Theme) => {
  const keys = THEME_KEYS.get(theme.id)
  return !!keys && !!tags?.some((t) => keys.has(t.toLowerCase()))
}
