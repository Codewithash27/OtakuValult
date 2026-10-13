import { useEffect, useState, type CSSProperties } from 'react'
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { ThemeToggle } from './ThemeToggle'
import { LibraryAssistant } from './LibraryAssistant'
import { InstallAppButton } from './InstallAppButton'
import { useContentMode } from '../hooks/useAdultFilter'
import { ModeEffects, triggerPanic } from './ModeEffects'

const NAV_ITEMS: { label: string; icon: string; href: string; disabled?: boolean; creamyOnly?: boolean; cleanOnly?: boolean }[] = [
  { label: 'Library', icon: '📚', href: '/' },
  { label: 'Anime', icon: '⛩️', href: '/anime', cleanOnly: true },
  { label: 'Manhwa', icon: '✨', href: '/manhwa', creamyOnly: true },
  { label: 'Gallery', icon: '🖼️', href: '/gallery' },
  { label: 'Top rated', icon: '⭐', href: '/community-lists', creamyOnly: true },
  { label: 'Stats', icon: '📊', href: '#', disabled: true },
  { label: 'Import', icon: '⬆️', href: '/import' },
]

const FIREFLIES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  top: `${(i * 53 + 23) % 100}%`,
  '--d': `${12 + (i % 5) * 3}s`,
  '--delay': `${(i * 1.7) % 9}s`,
  '--x': `${((i % 4) - 1.5) * 50}px`,
  '--y': `${-60 - (i % 3) * 40}px`,
})) as CSSProperties[]

let lastLogoTap = 0
const onLogoTap = () => {
  const now = Date.now()
  if (now - lastLogoTap < 400 && document.documentElement.dataset.mode === 'creamy') triggerPanic()
  lastLogoTap = now
}

function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 select-none min-w-0" onClick={onLogoTap}>
      <div className="relative w-9 h-9 sm:w-10 sm:h-10 shrink-0" style={{ perspective: 400 }}>
        <div className="absolute inset-0 rounded-[14px] bg-gradient-to-br from-lantern-400 via-vermilion-500 to-jade-400 animate-[spin_10s_linear_infinite] blur-md opacity-60" />
        <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-[14px] bg-gradient-to-b from-lantern-400 to-vermilion-600 grid place-items-center font-jp font-bold text-lg text-white shadow-lg ring-1 ring-white/30">
          <span className="absolute inset-x-1.5 top-1 h-px bg-white/40" />
          <span className="absolute inset-x-1.5 bottom-1 h-px bg-black/20" />
          宝
        </div>
      </div>
      <h1 className={`font-display font-bold truncate ${size === 'lg' ? 'text-2xl' : 'text-lg sm:text-xl'}`}>
        Otaku<span className="text-gradient">Vault</span>
      </h1>
    </div>
  )
}

function SidebarMenu({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const pathname = from && /^\/(title|community-lists\/series)\//.test(location.pathname) ? from : location.pathname
  const [contentMode] = useContentMode()
  const items = NAV_ITEMS.filter(
    (item) => (!item.creamyOnly || contentMode === 'creamy') && (!item.cleanOnly || contentMode === 'clean')
  )

  return (
    <nav className="space-y-1.5">
      {items.map((item) => {
        const active =
          !item.disabled &&
          (pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`)))
        return (
          <button
            key={item.label}
            onClick={() => {
              if (!item.disabled) {
                navigate(item.href)
                onNavigate?.()
              }
            }}
            disabled={item.disabled}
            className={`group relative w-full text-left px-3 py-2 rounded-xl transition-all duration-300 flex items-center gap-3 text-sm font-medium ${
              item.disabled
                ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                : active
                  ? 'nav-lantern translate-x-1'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/5 hover:translate-x-1'
            }`}
          >
            <span
              className={`text-lg transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-6 ${
                active ? 'scale-110 drop-shadow-[0_0_8px_rgba(249,138,7,.7)]' : ''
              }`}
            >
              {item.icon}
            </span>
            <span>{item.label}</span>
            {item.disabled && (
              <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-current opacity-60">
                Soon
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

export function AppShell() {
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [, setSearchParams] = useSearchParams()
  const { user, signOut } = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [contentMode, setContentMode] = useContentMode()

  useEffect(() => {
    if (pathname === '/manga' || (contentMode === 'clean' && (pathname === '/manhwa' || pathname.startsWith('/community-lists')))) {
      navigate('/', { replace: true })
    } else if (contentMode === 'creamy' && pathname === '/anime') {
      navigate('/', { replace: true })
    }
  }, [contentMode, pathname, navigate])

  const navVisible = NAV_ITEMS.filter(
    (item) => !item.disabled && (!item.creamyOnly || contentMode === 'creamy') && (!item.cleanOnly || contentMode === 'clean')
  )

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const handleAddItem = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('item')
      return next
    })
    window.dispatchEvent(new CustomEvent('openAddModal'))
  }

  const initial = (user?.email?.[0] || '?').toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const GREETING_JP = hour < 12 ? 'おはよう' : hour < 18 ? 'こんにちは' : 'こんばんは'

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="aurora"><span /></div>
      <div className="aurora-grid" />
      <div className="fireflies" aria-hidden>
        {FIREFLIES.map((f, i) => (
          <span key={i} style={f} />
        ))}
      </div>

      {/* Mobile header */}
      <header className="lg:hidden glass-strong border-x-0 border-t-0 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0 shrink">
              <Logo />
            </div>
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setContentMode(contentMode === 'creamy' ? 'clean' : 'creamy')}
                className={`mode-pill !h-8 shrink-0 ${contentMode === 'creamy' ? 'mode-creamy' : 'mode-clean'}`}
                title={contentMode === 'creamy' ? 'Switch to Clean' : 'Switch to Creamy'}
              >
                <span className="mode-knob !w-6 !h-6 text-sm">{contentMode === 'creamy' ? '🔥' : '🍃'}</span>
                <span className="text-[11px] font-bold pr-1">{contentMode === 'creamy' ? 'Creamy' : 'Clean'}</span>
              </button>
              <button onClick={handleAddItem} className="btn-glow !px-2.5 !py-1.5 text-sm" aria-label="Add item">
                + Add
              </button>
              <ThemeToggle />
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="w-9 h-9 grid place-items-center rounded-xl glass shrink-0"
                aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
              >
                {showMobileMenu ? '✕' : '☰'}
              </button>
            </div>
          </div>
        </div>
        {showMobileMenu && (
          <div className="px-4 pb-4 border-t border-slate-200 dark:border-white/10 space-y-4 animate-fade-up">
            <SidebarMenu onNavigate={() => setShowMobileMenu(false)} />
            <InstallAppButton />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-jp text-lantern-500 mr-1.5">{GREETING_JP}</span>
              {greeting}
            </p>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex-1 truncate">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg text-sm font-semibold"
              >
                Logout
              </button>
            </div>
            <a
              href="https://github.com/Codewithash27"
              target="_blank"
              rel="noreferrer"
              className="block text-center text-[11px] text-slate-500 dark:text-slate-400 hover:text-lantern-400"
            >
              Built by Codewithash27
            </a>
          </div>
        )}
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-72 sticky top-0 h-screen p-4">
        <div className="glass rounded-3xl flex flex-col w-full overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <Logo size="lg" />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-jp text-lantern-500 dark:text-lantern-300 mr-1">{GREETING_JP}</span>
              {greeting}
            </p>
          </div>
          <div className="mx-5 h-px bg-gradient-to-r from-transparent via-lantern-500/40 to-transparent" />
          <nav className="flex-1 px-3 py-3">
            <SidebarMenu />
          </nav>
          <div className="px-5 pb-2">
            <button onClick={handleAddItem} className="group btn-glow w-full !rounded-xl !py-2 text-sm">
              <span className="text-lg leading-none transition-transform duration-300 group-hover:rotate-90">+</span> Add item
            </button>
            <InstallAppButton className="!h-auto !border-0 !bg-transparent mt-1.5 !text-xs !font-medium text-slate-500 dark:text-slate-400 hover:!bg-transparent hover:text-lantern-400" />
          </div>
          <div className="px-5 py-4 mt-1 border-t border-slate-200/70 dark:border-white/5 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setContentMode(contentMode === 'creamy' ? 'clean' : 'creamy')}
                className={`mode-pill flex-1 justify-center !h-8 ${contentMode === 'creamy' ? 'mode-creamy' : 'mode-clean'}`}
                title={
                  contentMode === 'creamy'
                    ? 'Creamy: adult manhwa — tap for Clean (anime)'
                    : 'Clean: anime shelf — tap for Creamy (manhwa)'
                }
              >
                <span className="mode-knob !w-6 !h-6 text-sm">{contentMode === 'creamy' ? '🔥' : '🍃'}</span>
                <span className="text-xs font-bold pr-1">{contentMode === 'creamy' ? 'Creamy' : 'Clean'}</span>
              </button>
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-cyan-400 to-violet-600 grid place-items-center text-xs font-bold text-white">
                {initial}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="text-xs font-semibold text-rose-500 hover:text-rose-400 shrink-0"
              >
                Logout
              </button>
            </div>
            <a
              href="https://github.com/Codewithash27"
              target="_blank"
              rel="noreferrer"
              className="block text-[10px] text-slate-500 dark:text-slate-500 hover:text-lantern-400"
            >
              Built by Codewithash27
            </a>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div key={pathname.split('/').slice(0, 3).join('/')} className="page-enter flex-1 p-4 lg:p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed z-40 glass-strong rounded-2xl flex shadow-2xl left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))]">
        {navVisible.map((item) => (
          <Link
            key={item.label}
            to={item.href}
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[11px] font-semibold transition-all duration-300 ${
              pathname === item.href ? 'text-lantern-500 dark:text-lantern-300 -translate-y-0.5' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {pathname === item.href && (
              <span className="absolute top-1 w-8 h-1 rounded-full bg-gradient-to-r from-lantern-400 to-vermilion-500 shadow-[0_0_10px_rgba(249,138,7,.8)]" />
            )}
            <span className={`text-lg transition-transform duration-300 ${pathname === item.href ? 'scale-125' : ''}`}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="lg:hidden h-[calc(6rem+env(safe-area-inset-bottom))]" />

      <LibraryAssistant />
      <ModeEffects />
    </div>
  )
}
