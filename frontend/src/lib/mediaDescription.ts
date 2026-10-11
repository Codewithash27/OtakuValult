import { anilist } from './importers'

/** Strip AniList markup and collapse whitespace. */
export function cleanMediaDescription(raw: string | null | undefined): string | null {
  if (!raw) return null
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text || null
}

export async function fetchAniListDescription(id: number): Promise<string | null> {
  const data = await anilist<{ Media: { description: string | null } | null }>(
    `query ($id: Int) { Media(id: $id) { description(asHtml: false) } }`,
    { id }
  )
  return cleanMediaDescription(data.Media?.description)
}
