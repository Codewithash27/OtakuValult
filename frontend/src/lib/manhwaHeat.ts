import { THEMES } from './themes'

/** Heat groups for the Creamy manhwa charts. School, age-gap, and family themes stay out. */
const EXPLICIT_THEME_IDS = new Set(['ntr', 'cuckold', 'swap', 'milf', 'threesome', 'exhib', 'blackmail', 'affair'])
const STEAMY_THEME_IDS = new Set(['married', 'harem', 'office', 'cohab'])

function themeTags(ids: Set<string>): Set<string> {
  return new Set(
    THEMES.filter((theme) => ids.has(theme.id)).flatMap((theme) => theme.tags.map((tag) => tag.toLowerCase())),
  )
}

export const EXPLICIT_TAGS = themeTags(EXPLICIT_THEME_IDS)
export const STEAMY_TAGS = themeTags(STEAMY_THEME_IDS)

for (const tag of ['hardcore', 'uncensored', 'bdsm', 'sex toys', 'vanilla']) EXPLICIT_TAGS.add(tag)

export type ManhwaHeat = 'soft' | 'steamy' | 'explicit'

const YOUTH_TAGS = new Set(['school life', 'teacher', 'high school', 'middle school', 'elementary school'])

export function isYouthTagged(tags: string[]): boolean {
  return tags.some((tag) => YOUTH_TAGS.has(tag.toLowerCase()))
}

export function heatOf(tags: string[]): ManhwaHeat {
  const names = new Set(tags.map((tag) => tag.toLowerCase()))
  if ([...names].some((tag) => YOUTH_TAGS.has(tag))) return 'soft'
  if ([...names].some((tag) => EXPLICIT_TAGS.has(tag))) return 'explicit'
  if ([...names].some((tag) => STEAMY_TAGS.has(tag))) return 'steamy'
  return 'soft'
}

export function spiceRank(tag: string): number {
  const key = tag.toLowerCase()
  if (EXPLICIT_TAGS.has(key)) return 0
  if (STEAMY_TAGS.has(key)) return 1
  return 2
}

export function spiceTags(tags: string[]): string[] {
  const youth = new Set(['school life', 'teacher', 'high school', 'middle school', 'elementary school'])
  if (tags.some((tag) => youth.has(tag.toLowerCase()))) return []
  return [...tags].filter((tag) => spiceRank(tag) < 2).sort((a, b) => spiceRank(a) - spiceRank(b) || a.localeCompare(b))
}

export function sortSpiceFirst<T extends { name: string }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => spiceRank(a.row.name) - spiceRank(b.row.name) || a.index - b.index)
    .map(({ row }) => row)
}

export function teaseLine(raw: string | null | undefined, max = 110): string {
  const text = (raw || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const sentence = text.split(/(?<=[.!?])\s/)[0] || text
  if (sentence.length <= max) return sentence
  return `${sentence.slice(0, max - 1).trimEnd()}…`
}
