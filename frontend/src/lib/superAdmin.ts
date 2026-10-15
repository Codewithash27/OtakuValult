export function isSuperAdmin(email?: string | null) {
  const allow =
    (import.meta.env.VITE_SUPER_ADMIN_EMAIL as string | undefined)?.trim().toLowerCase() || 'lucifer@gmail.com'
  return (email || '').trim().toLowerCase() === allow
}
