import { getApiBase } from './api'

export type ExplicitKind = 'anime' | 'manhwa'

export interface ExplicitPost {
  id: number
  source: string
  width: number | null
  height: number | null
  file_url: string
  thumb_url: string
  post_url: string
}

export interface ExplicitPage {
  kind: ExplicitKind
  query: string | null
  matched: string[]
  message: string | null
  page: number
  has_more: boolean
  posts: ExplicitPost[]
}

export function explicitImageUrl(url: string): string {
  return `${getApiBase()}/api/images/proxy?url=${encodeURIComponent(url)}`
}

export async function fetchExplicit(kind: ExplicitKind, q: string, page: number): Promise<ExplicitPage> {
  const params = new URLSearchParams({ kind, page: String(page) })
  if (q.trim()) params.set('q', q.trim())
  const res = await fetch(`${getApiBase()}/api/images/explicit?${params}`)
  if (res.status === 422) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null
    throw new Error(body?.detail || 'That search is not available on this shelf')
  }
  if (!res.ok) throw new Error('The picture source is not responding')
  return res.json() as Promise<ExplicitPage>
}
