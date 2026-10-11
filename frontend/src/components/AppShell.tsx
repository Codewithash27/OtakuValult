import { useState } from 'react'
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { ThemeToggle } from './ThemeToggle'
import { SearchBar } from './SearchBar'
import { LibraryAssistant } from './LibraryAssistant'
import { InstallAppButton } from './InstallAppButton'

const NAV_ITEMS: { label: string; icon: string; href: string; disabled?: boolean }[] = [
  { label: 'Library', icon: '📚', href: '/' },
  { label: 'Anime', icon: '⛩️', href: '/anime' },
  { label: 'Manga', icon: '📖', href: '/manga' },
  { label: 'Manhwa', icon: '✨', href: '/manhwa' },
  { label: 'Stats', icon: '📊', href: '#', disabled: true },
  { label: 'Import', icon: '⬆️', href: '/import' },
]

function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative w-10 h-10 shrink-0" style={{ perspective: 400 }}>
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 animate-[spin_8s_linear_infinite] blur-md opacity-70" />
        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 grid place-items-center font-display font-bold text-white shadow-lg">
          M
        </div>
      </div>
      <h1 className={`font-display font-bold ${size === 'lg' ? 'text-2xl' : 'text-xl'}`}>
        <span className="text-gradient">MediaShelf</span>
      </h1>
    </div>
  )
}

function SidebarMenu({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className="space-y-1.5">
      {NAV_ITEMS.map((item) => {
        const active = !item.disabled && pathname === item.href
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
                  ? 'text-white bg-gradient-to-r from-violet-600/90 to-pink-600/80 shadow-[0_8px_30px_-8px_rgba(219,39,119,.6)]'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/5 hover:translate-x-1'
            }`}
          >
            <span className="text-lg transition-transform duration-300 group-hover:scale-125">{item.icon}</span>
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

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="aurora"><span /></div>
      <div className="aurora-grid" />

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
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Your anime & media vault</p>
          </div>
          <div className="mx-6 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
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
        <header className="hidden lg:flex sticky top-0 z-30 px-6 pt-4">
          <div className="glass rounded-2xl p-3 flex gap-4 items-center w-full">
            <div className="flex-1">
              <SearchBar onOpenManualAdd={handleAddItem} />
            </div>
            <button onClick={handleAddItem} className="btn-glow flex-shrink-0">
              <span className="text-lg leading-none">+</span> Add item
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-3 left-3 right-3 z-40 glass-strong rounded-2xl flex shadow-2xl">
        {NAV_ITEMS.filter((item) => !item.disabled).map((item) => (
          <Link
            key={item.label}
            to={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[11px] font-semibold transition-all ${
              pathname === item.href ? 'text-violet-500 dark:text-violet-300 scale-110' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="lg:hidden h-24" />

      <LibraryAssistant />
    </div>
  )
}
