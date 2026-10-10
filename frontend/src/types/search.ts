export interface SearchResult {
  source: string
  external_id: string
  media_type: string
  title: string
  alt_title: string | null
  year: number | null
  poster_url: string | null
  overview: string | null
  total: number | null
  rating: number | null
}

export interface SearchResponse {
  results: SearchResult[]
  errors: Record<string, string>
}
