/** Backend base URL. `localhost` is rewritten to IPv4 so Windows does not hang on ::1. */
export function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined) || 'http://127.0.0.1:8000'
  return raw.replace('://localhost', '://127.0.0.1').replace(/\/$/, '')
}

const apiUrl = getApiBase()

export async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${apiUrl}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}
