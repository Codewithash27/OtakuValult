/** Backend base URL. `localhost` is rewritten to IPv4 so Windows does not hang on ::1. */
export function getApiBase(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  const raw = env || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
  return raw.replace('://localhost', '://127.0.0.1').replace(/\/$/, '')
}

/** False on Vercel/production builds when VITE_API_URL was not set at build time. */
export function isBackendConfigured(): boolean {
  return Boolean((import.meta.env.VITE_API_URL as string | undefined)?.trim()) || import.meta.env.DEV
}

const apiUrl = getApiBase()

export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  if (!apiUrl) {
    throw new Error('MISSING_VITE_API_URL')
  }
  const url = `${apiUrl}${endpoint}`
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
    throw new Error(`NETWORK:${apiUrl}`)
  }

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}
