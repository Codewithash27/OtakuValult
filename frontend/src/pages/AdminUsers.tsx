import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../hooks/useSession'
import { useToast } from '../components/Toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { isSuperAdmin } from '../lib/superAdmin'
import { fetchAdminUsers, loginAsUser, setAdminUserActive, setAdminUserPassword, type AdminUser } from '../lib/adminApi'
import { ADMIN_SETUP_SQL } from '../lib/adminSetup'

function when(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AdminUsers() {
  const { user } = useSession()
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const [pending, setPending] = useState<AdminUser | null>(null)
  const [loginAs, setLoginAs] = useState<AdminUser | null>(null)
  const [resetFor, setResetFor] = useState<AdminUser | null>(null)
  const [newPass, setNewPass] = useState('')
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null)

  const list = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
    enabled: isSuperAdmin(user?.email),
  })

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setAdminUserActive(id, active),
    onSuccess: (_, vars) => {
      showToast(vars.active ? 'User activated' : 'User deactivated', 'success')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setPending(null)
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const enter = useMutation({
    mutationFn: (row: AdminUser) => loginAsUser(row.id),
    onSuccess: () => {
      setLoginAs(null)
      showToast('Opened their vault', 'success')
      navigate('/', { replace: true })
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })
  const entering = enter.isPending

  const reset = useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) => setAdminUserPassword(id, password),
    onSuccess: (data, vars) => {
      const row = list.data?.users.find((u) => u.id === vars.id)
      setRevealed({ email: row?.email || 'user', password: data.temporaryPassword })
      setResetFor(null)
      setNewPass('')
      showToast('New password set — copy it now', 'success')
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const users = list.data?.users ?? []
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter((u) => u.email.toLowerCase().includes(s) || u.name.toLowerCase().includes(s))
  }, [users, q])

  if (!isSuperAdmin(user?.email)) return <Navigate to="/" replace />

  return (
    <div className="max-w-5xl mx-auto pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5">
        <div className="min-w-0 mr-auto">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-lantern-500">Super admin</p>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 dark:text-white">Users</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {list.data?.total ?? '—'} accounts. Passwords cannot be viewed. Use Login as to open someone’s vault.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="input-premium sm:w-64"
        />
      </div>

      {revealed && (
        <div className="glass rounded-2xl p-4 mb-4 border border-lantern-400/30">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Temporary password for {revealed.email}</p>
          <p className="mt-2 font-mono text-lg break-all text-lantern-500">{revealed.password}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="h-9 px-3 rounded-xl text-xs font-semibold bg-white/10 border border-white/10"
              onClick={() => navigator.clipboard.writeText(revealed.password).then(() => showToast('Copied', 'success'))}
            >
              Copy
            </button>
            <button type="button" className="h-9 px-3 rounded-xl text-xs font-semibold text-slate-500" onClick={() => setRevealed(null)}>
              Hide
            </button>
          </div>
        </div>
      )}

      {list.isError && (list.error instanceof Error ? list.error.message : '') === 'SETUP_SQL' && (
        <div className="glass rounded-2xl p-4 mb-4 border border-lantern-400/30 space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">One-time setup</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Open your Supabase project → SQL Editor → paste this → Run. Then refresh this page. Only Lucifer can call it.
          </p>
          <pre className="text-[11px] max-h-48 overflow-auto rounded-xl bg-black/40 p-3 text-slate-200 whitespace-pre-wrap">
            {ADMIN_SETUP_SQL}
          </pre>
          <button
            type="button"
            className="btn-glow !py-2 !px-4 text-sm"
            onClick={() => navigator.clipboard.writeText(ADMIN_SETUP_SQL).then(() => showToast('SQL copied', 'success'))}
          >
            Copy SQL
          </button>
        </div>
      )}
      {list.isError && (list.error instanceof Error ? list.error.message : '') !== 'SETUP_SQL' && (
        <p className="text-sm text-rose-500 mb-4">{list.error instanceof Error ? list.error.message : 'Could not load users'}</p>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.2fr_1.4fr_1fr_1fr_auto] gap-3 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-white/40 border-b border-slate-200/60 dark:border-white/10">
          <span>Name</span>
          <span>Email</span>
          <span>Joined</span>
          <span>Last login</span>
          <span className="text-right">Status</span>
        </div>
        <ul className="divide-y divide-slate-200/70 dark:divide-white/[0.06]">
          {filtered.map((u) => (
            <li key={u.id} className="px-4 py-3 md:grid md:grid-cols-[1.2fr_1.4fr_1fr_1fr_auto] md:gap-3 md:items-center">
              <p className="font-semibold text-slate-900 dark:text-white truncate">{u.name}</p>
              <p className="text-sm text-slate-500 dark:text-white/60 truncate">{u.email}</p>
              <p className="text-xs text-slate-500 mt-1 md:mt-0">{when(u.created_at)}</p>
              <p className="text-xs text-slate-500">{when(u.last_sign_in_at)}</p>
              <div className="mt-2 md:mt-0 flex flex-wrap items-center justify-end gap-2">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    u.active ? 'bg-jade-500/15 text-jade-500' : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {u.active ? 'Active' : 'Off'}
                </span>
                <button
                  type="button"
                  disabled={u.id === user?.id || !u.active}
                  onClick={() => setLoginAs(u)}
                  className="h-8 px-2.5 rounded-lg text-[11px] font-semibold bg-lantern-500/15 text-lantern-500 border border-lantern-500/30 disabled:opacity-40"
                >
                  Login as
                </button>
                <button
                  type="button"
                  disabled={u.id === user?.id}
                  onClick={() => setPending(u)}
                  className="h-8 px-2.5 rounded-lg text-[11px] font-semibold bg-white/5 border border-slate-200 dark:border-white/10 disabled:opacity-40"
                >
                  {u.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetFor(u)
                    setNewPass('')
                  }}
                  className="h-8 px-2.5 rounded-lg text-[11px] font-semibold bg-white/5 border border-slate-200 dark:border-white/10"
                >
                  New password
                </button>
              </div>
            </li>
          ))}
          {list.isLoading && <li className="px-4 py-10 text-center text-sm text-slate-500">Loading users…</li>}
          {!list.isLoading && filtered.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-slate-500">No users match that search.</li>
          )}
        </ul>
      </div>

      <ConfirmDialog
        isOpen={!!loginAs}
        title="Login as this user?"
        message={`Open ${loginAs?.email}'s vault. Their password stays the same. Use “Back to admin” when you’re done.`}
        confirmLabel="Login as"
        isLoading={entering}
        onCancel={() => setLoginAs(null)}
        onConfirm={() => loginAs && enter.mutate(loginAs)}
      />

      <ConfirmDialog
        isOpen={!!pending}
        title={pending?.active ? 'Deactivate user?' : 'Activate user?'}
        message={
          pending?.active
            ? `${pending.email} will not be able to sign in until you activate them again.`
            : `${pending?.email} will be able to sign in again.`
        }
        confirmLabel={pending?.active ? 'Deactivate' : 'Activate'}
        isDangerous={!!pending?.active}
        isLoading={toggle.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && toggle.mutate({ id: pending.id, active: !pending.active })}
      />

      {resetFor && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setResetFor(null)}>
          <div className="glass-strong rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">Set new password</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{resetFor.email}</p>
            <p className="text-xs text-slate-500 mt-2">
              Their current password cannot be shown. Set a new one, or generate a temporary password.
            </p>
            <input
              type="text"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="New password (min 6) — or leave blank to generate"
              className="input-premium mt-4"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-9 px-3 rounded-xl text-sm" onClick={() => setResetFor(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={reset.isPending || (newPass.length > 0 && newPass.length < 6)}
                className="btn-glow !py-2 !px-4 text-sm disabled:opacity-50"
                onClick={() => reset.mutate({ id: resetFor.id, password: newPass || undefined })}
              >
                {reset.isPending ? 'Saving…' : newPass ? 'Save password' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
