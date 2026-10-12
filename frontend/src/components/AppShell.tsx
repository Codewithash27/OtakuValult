import { useState, type CSSProperties } from 'react'
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { ThemeToggle } from './ThemeToggle'
import { SearchBar } from './SearchBar'
import { LibraryAssistant } from './LibraryAssistant'
import { InstallAppButton } from './InstallAppButton'
import { useContentMode } from '../hooks/useAdultFilter'

const NAV_ITEMS: { label: string; icon: string; href: string; disabled?: boolean; creamyOnly?: boolean }[] = [
  { label: 'Library', icon: '📚', href: '/' },
  { label: 'Anime', icon: '⛩️', href: '/anime' },
  { label: 'Manga', icon: '📖', href: '/manga' },
  { label: 'Manhwa', icon: '✨', href: '/manhwa' },
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

function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative w-10 h-10 shrink-0" style={{ perspective: 400 }}>
        <div className="absolute inset-0 rounded-[14px] bg-gradient-to-br from-lantern-400 via-vermilion-500 to-jade-400 animate-[spin_10s_linear_infinite] blur-md opacity-60" />
        <div className="relative w-10 h-10 rounded-[14px] bg-gradient-to-b from-lantern-400 to-vermilion-600 grid place-items-center font-jp font-bold text-lg text-white shadow-lg ring-1 ring-white/30">
          <span className="absolute inset-x-1.5 top-1 h-px bg-white/40" />
          <span className="absolute inset-x-1.5 bottom-1 h-px bg-black/20" />
          宝
        </div>
      </div>
      <h1 className={`font-display font-bold ${size === 'lg' ? 'text-2xl' : 'text-xl'}`}>
        Otaku<span className="text-gradient">Vault</span>
      </h1>
    </div>
  )
}

function SidebarMenu({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [contentMode] = useContentMode()
  const items = NAV_ITEMS.filter((item) => !item.creamyOnly || contentMode === 'creamy')

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
            className={`group relative w-full text-left px-4 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-3 font-medium ${
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
  const isDetailPage = pathname.startsWith('/title/') || pathname.startsWith('/community-lists/series/')
  const [contentMode] = useContentMode()
  const navVisible = NAV_ITEMS.filter((item) => !item.disabled && (!item.creamyOnly || contentMode === 'creamy'))

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
      <header className="lg:hidden glass-strong border-x-0 border-t-0 sticky top-0 z-40">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Logo />
            <div className="flex items-center gap-2">
              <button onClick={handleAddItem} className="btn-glow !px-3 !py-1.5 text-sm" aria-label="Add item">
                + Add
              </button>
              <ThemeToggle />
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="w-10 h-10 grid place-items-center rounded-xl glass"
              >
                {showMobileMenu ? '✕' : '☰'}
              </button>
            </div>
          </div>
          <SearchBar onOpenManualAdd={handleAddItem} />
        </div>
        {showMobileMenu && (
          <div className="px-4 pb-4 border-t border-slate-200 dark:border-white/10 space-y-4 animate-fade-up">
            <SidebarMenu onNavigate={() => setShowMobileMenu(false)} />
            <InstallAppButton />
            <div className="flex items-center gap-2 pt-4 border-t border-slate-200 dark:border-white/10">
              <span className="text-sm text-slate-500 dark:text-slate-400 flex-1 truncate">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg text-sm font-semibold"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-72 sticky top-0 h-screen p-4">
        <div className="glass rounded-3xl flex flex-col w-full overflow-hidden">
          <div className="p-6">
            <Logo size="lg" />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-jp text-lantern-600 dark:text-lantern-300 mr-1.5">オタク宝庫</span>your anime vault
            </p>
          </div>
          <div className="mx-6 h-px bg-gradient-to-r from-transparent via-lantern-500/40 to-transparent" />
          <nav className="flex-1 p-4">
            <SidebarMenu />
          </nav>
          <div className="px-4">
            <InstallAppButton />
          </div>
          <div className="p-4 m-3 rounded-2xl bg-slate-900/[0.03] dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-cyan-400 to-violet-600 grid place-items-center font-bold text-white ring-2 ring-violet-500/30">
                {initial}
              </div>
              <span className="text-sm text-slate-600 dark:text-slate-300 truncate flex-1">{user?.email}</span>
              <ThemeToggle />
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-3 py-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors text-sm font-semibold"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="hidden lg:block sticky top-0 z-30 px-6 pt-3">
          <div
            className={`glass rounded-full flex items-center gap-3 p-1.5 pl-2 mx-auto shadow-[0_10px_40px_-20px_rgba(0,0,0,.8)] ${
              isDetailPage ? 'max-w-6xl' : 'max-w-7xl'
            }`}
          >
            <div className="flex-1 max-w-xl">
              <SearchBar onOpenManualAdd={handleAddItem} />
            </div>
            <span className="ml-auto hidden xl:block text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              <span className="font-jp text-lantern-500/80 mr-1">{GREETING_JP}</span>
              {greeting}
            </span>
            <button onClick={handleAddItem} className="group btn-glow !rounded-full !h-10 !py-0 !px-5 text-sm shrink-0 ml-auto xl:ml-0">
              <span className="text-lg leading-none transition-transform duration-300 group-hover:rotate-90">+</span> Add item
            </button>
          </div>
        </header>

        <div key={pathname.split('/').slice(0, 3).join('/')} className="page-enter flex-1 p-4 lg:p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-3 left-3 right-3 z-40 glass-strong rounded-2xl flex shadow-2xl">
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

      <div className="lg:hidden h-24" />

      <LibraryAssistant />
    </div>
  )
}
