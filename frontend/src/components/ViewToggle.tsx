import { useState, useEffect } from 'react'

type ViewMode = 'grid' | 'list'

interface ViewToggleProps {
  onChange: (view: ViewMode) => void
}

export function ViewToggle({ onChange }: ViewToggleProps) {
  const [view, setView] = useState<ViewMode>('grid')

  useEffect(() => {
    const saved = localStorage.getItem('view') as ViewMode | null
    if (saved) {
      setView(saved)
      onChange(saved)
    }
  }, [onChange])

  const handleToggle = (newView: ViewMode) => {
    setView(newView)
    localStorage.setItem('view', newView)
    onChange(newView)
  }

  return (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
      <button
        onClick={() => handleToggle('grid')}
        className={`px-3 py-1 rounded transition-colors ${
          view === 'grid'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
        aria-label="Grid view"
      >
        ⊞
      </button>
      <button
        onClick={() => handleToggle('list')}
        className={`px-3 py-1 rounded transition-colors ${
          view === 'list'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
        aria-label="List view"
      >
        ☰
      </button>
    </div>
  )
}
