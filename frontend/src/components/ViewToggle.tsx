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
    <div className="flex gap-1 p-1 rounded-xl border border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/[0.04]">
      <button
        onClick={() => handleToggle('grid')}
        className={`w-8 h-8 grid place-items-center rounded-lg text-sm transition-all ${
          view === 'grid' ? 'chip-active !scale-100' : 'text-slate-500 dark:text-slate-400 hover:text-violet-500 dark:hover:text-white'
        }`}
        aria-label="Grid view"
      >
        ⊞
      </button>
      <button
        onClick={() => handleToggle('list')}
        className={`w-8 h-8 grid place-items-center rounded-lg text-sm transition-all ${
          view === 'list' ? 'chip-active !scale-100' : 'text-slate-500 dark:text-slate-400 hover:text-violet-500 dark:hover:text-white'
        }`}
        aria-label="List view"
      >
        ☰
      </button>
    </div>
  )
}
