import { supabase } from './supabase'
import { saveAdminHome, readAdminHome, clearAdminHome } from './adminSession'

export type AdminUser = {
  id: string
  email: string
  name: string
  created_at: string | null
  last_sign_in_at: string | null
  email_confirmed: boolean
  active: boolean
  password: null
}

function rpcMessage(error: { message?: string; code?: string } | null) {
  const msg = error?.message || 'Admin request failed'
  if (/could not find the function|schema cache|does not exist|404/i.test(msg)) {
    return 'SETUP_SQL'
  }
  return msg
}

export async function fetchAdminUsers() {
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw new Error(rpcMessage(error))
  const users: AdminUser[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    email: String(row.email || ''),
    name: String(row.name || 'User'),
    created_at: (row.created_at as string) || null,
    last_sign_in_at: (row.last_sign_in_at as string) || null,
    email_confirmed: Boolean(row.email_confirmed),
    active: Boolean(row.active),
    password: null,
  }))
  return { users, total: users.length }
}

export async function setAdminUserActive(id: string, active: boolean) {
  const { error } = await supabase.rpc('admin_set_user_active', { p_id: id, p_active: active })
  if (error) throw new Error(rpcMessage(error))
  return { ok: true }
}

export async function loginAsUser(id: string) {
  const { data: home } = await supabase.auth.getSession()
  if (!home.session) throw new Error('Sign in required')

  const { data, error } = await supabase.rpc('admin_prepare_impersonation', { p_id: id })
  if (error) throw new Error(rpcMessage(error))
  const row = Array.isArray(data) ? data[0] : data
  const email = String(row?.email || '')
  const temp_password = String(row?.temp_password || '')
  if (!email || !temp_password) throw new Error('Could not start login-as')

  saveAdminHome(home.session, email)

  const signed = await supabase.auth.signInWithPassword({ email, password: temp_password })
  if (signed.error) {
    await supabase.rpc('admin_abort_impersonation', { p_id: id })
    clearAdminHome()
    throw new Error(signed.error.message)
  }

  const finished = await supabase.rpc('admin_finish_impersonation')
  if (finished.error) {
    await supabase.rpc('admin_abort_impersonation', { p_id: id }).catch(() => undefined)
    throw new Error(rpcMessage(finished.error))
  }
}

export async function returnToAdmin() {
  const home = readAdminHome()
  if (!home) throw new Error('Admin session expired — sign in as Lucifer again')
  const { error } = await supabase.auth.setSession({
    access_token: home.access_token,
    refresh_token: home.refresh_token,
  })
  clearAdminHome()
  if (error) throw new Error(error.message)
}

export async function setAdminUserPassword(id: string, password?: string) {
  const temporaryPassword = password || crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const { error } = await supabase.rpc('admin_set_user_password', {
    p_id: id,
    p_password: temporaryPassword,
  })
  if (error) throw new Error(rpcMessage(error))
  return { ok: true, temporaryPassword }
}
