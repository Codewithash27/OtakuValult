/** Backend origin only — no /api or /api/images suffix (normalized if pasted wrong). */
export function getApiBase(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  let raw = env || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
  raw = raw.replace('://localhost', '://127.0.0.1').replace(/\/+$/, '')
  // Common Vercel mistake: full path pasted into VITE_API_URL
  raw = raw.replace(/\/api\/images(?:\/.*)?$/i, '')
  raw = raw.replace(/\/api$/i, '')
  return raw
}

/** False on Vercel/production builds when VITE_API_URL was not set at build time. */
export function isBackendConfigured(): boolean {
  return Boolean((import.meta.env.VITE_API_URL as string | undefined)?.trim()) || import.meta.env.DEV
}

export function apiUrl(endpoint: string): string {
  const base = getApiBase()
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${base}${path}`
}

export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const base = getApiBase()
  if (!base) {
    throw new Error('MISSING_VITE_API_URL')
  }
  const url = apiUrl(endpoint)
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
  } catch {
    throw new Error(`NETWORK:${base}`)
  }

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

/** True when Render (or other host) is still on a build without /api/images routes. */
export async function backendHasImagesApi(): Promise<boolean> {
  const base = getApiBase()
  if (!base) return false
  try {
    const health = await apiFetch<{ capabilities?: { images?: boolean } }>('/api/health')
    if (health.capabilities?.images === true) return true
    if (health.capabilities?.images === false) return false
  } catch {
    return false
  }
  try {
    const res = await fetch(apiUrl('/api/images/web-search/config'))
    return res.ok
  } catch {
    return false
  }
}
