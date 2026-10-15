import type { Session } from '@supabase/supabase-js'

const KEY = 'otakuvault_admin_home'

export type AdminHome = {
  access_token: string
  refresh_token: string
  viewing: string
}

export function saveAdminHome(session: Session, viewing: string) {
  const payload: AdminHome = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    viewing,
  }
  sessionStorage.setItem(KEY, JSON.stringify(payload))
}

export function readAdminHome(): AdminHome | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AdminHome
    if (!parsed?.access_token || !parsed?.refresh_token) return null
    return parsed
  } catch {
    return null
  }
}

export function clearAdminHome() {
  sessionStorage.removeItem(KEY)
}
