import { useState, useEffect } from 'react'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const shouldBeDark = localStorage.getItem('theme') !== 'light'
    setIsDark(shouldBeDark)
    document.documentElement.classList.toggle('dark', shouldBeDark)
  }, [])

  const toggle = () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', newIsDark)
  }

  return (
    <button
      onClick={toggle}
      className="relative w-10 h-10 grid place-items-center rounded-xl glass hover:scale-110 transition-transform duration-300 overflow-hidden"
      aria-label="Toggle theme"
    >
      <span
        className={`absolute transition-all duration-500 ${isDark ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0 scale-50'}`}
      >
        ☀️
      </span>
      <span
        className={`absolute transition-all duration-500 ${isDark ? 'rotate-90 opacity-0 scale-50' : 'rotate-0 opacity-100'}`}
      >
        🌙
      </span>
    </button>
  )
}
