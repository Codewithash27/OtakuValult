import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    window.dispatchEvent(new Event('install-available'))
  })
}

export function InstallAppButton({ className = '' }: { className?: string }) {
  const [available, setAvailable] = useState(!!deferred)

  useEffect(() => {
    const show = () => setAvailable(true)
    const hide = () => setAvailable(false)
    window.addEventListener('install-available', show)
    window.addEventListener('appinstalled', hide)
    return () => {
      window.removeEventListener('install-available', show)
      window.removeEventListener('appinstalled', hide)
    }
  }, [])

  if (!available) return null

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    deferred = null
    setAvailable(false)
  }

  return (
    <button onClick={install} className={`btn-glow w-full !py-2 text-sm ${className}`}>
      📲 Install app
    </button>
  )
}
