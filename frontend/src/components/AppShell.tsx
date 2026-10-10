import { useState } from 'react'
import { Outlet, useNavigate, Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { ThemeToggle } from './ThemeToggle'

interface SidebarMenuProps {
  onNavigate?: () => void
}

function SidebarMenu({ onNavigate }: SidebarMenuProps) {
  const navigate = useNavigate()
  const items = [
    { label: 'Library', icon: '📚', href: '/' },
    { label: 'Stats', icon: '📊', href: '#', disabled: true },
    { label: 'Import', icon: '⬆️', href: '#', disabled: true },
  ]

  return (
    <nav className="space-y-2">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            if (!item.disabled) {
              navigate(item.href)
              onNavigate?.()
            }
          }}
          disabled={item.disabled}
          className={`w-full text-left px-4 py-2 rounded-lg transition-colors flex items-center gap-3 ${
            item.disabled
              ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
              : 'text-gray-700 dark:text-gray-300 hover:bg-sky-50 dark:hover:bg-sky-900/20'
          }`}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

export function AppShell() {
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [, setSearchParams] = useSearchParams()
  const { user, signOut } = useSession()
  const navigate = useNavigate()

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
    // This signal is used by Library to open the modal
    window.dispatchEvent(new CustomEvent('openAddModal'))
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col lg:flex-row">
      {/* Mobile header */}
      <header className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="flex items-center justify-between p-4 gap-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">MediaShelf</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddItem}
              className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-sm rounded transition-colors"
              aria-label="Add item"
            >
              + Add
            </button>
            <ThemeToggle />
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              ☰
            </button>
          </div>
        </div>
        {showMobileMenu && (
          <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
            <SidebarMenu onNavigate={() => setShowMobileMenu(false)} />
            <div className="flex items-center gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400 flex-1 truncate">
                {user?.email}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MediaShelf</h1>
        </div>
        <nav className="flex-1 p-4">
          <SidebarMenu />
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {user?.email}
            </span>
            <ThemeToggle />
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors text-sm font-semibold"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Top bar (search + add) */}
        <header className="hidden lg:flex bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 gap-4 items-center">
          <input
            type="text"
            placeholder="Search your library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={handleAddItem}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg transition-colors"
          >
            + Add item
          </button>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet context={{ searchQuery, setSearchQuery }} />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex">
        {[
          { label: 'Library', icon: '📚', href: '/' },
          { label: 'Stats', icon: '📊', href: '#', disabled: true },
          { label: 'Import', icon: '⬆️', href: '#', disabled: true },
          { label: 'Me', icon: '👤', href: '#', disabled: true },
        ].map((item) => (
          <Link
            key={item.label}
            to={item.href}
            onClick={(e) => item.disabled && e.preventDefault()}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-semibold transition-colors ${
              item.disabled
                ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Mobile content padding */}
      <div className="lg:hidden h-20" />
    </div>
  )
}
