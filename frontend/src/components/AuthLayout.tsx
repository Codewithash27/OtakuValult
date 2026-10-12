import { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { CinematicBackdrop } from './CinematicBackdrop'

/** Shared by /login and /signup so the poster wall keeps moving when switching between them. */
export function AuthShell() {
  return (
    <div className="dark relative min-h-screen grid lg:grid-cols-2 items-center gap-10 overflow-hidden p-4 lg:p-10 text-slate-100">
      <CinematicBackdrop />

      <div className="hidden lg:flex flex-col items-start self-end pb-16 animate-fade-up">
        <h2 className="text-6xl font-bold text-white leading-[1.05] drop-shadow-[0_6px_40px_rgba(168,85,247,.5)]">
          Your
          <br />
          <span className="text-gradient">anime vault</span>
        </h2>
        <p className="mt-4 text-slate-200/90 max-w-sm drop-shadow">
          Track every series, chapter and episode with a shelf that feels as good as the stories on it.
        </p>
      </div>

      <div className="w-full max-w-md mx-auto">
        <Outlet />
      </div>
    </div>
  )
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="card-ring glass-strong rounded-3xl p-8 max-sm:p-6 animate-fade-up shadow-[0_30px_90px_-25px_rgba(168,85,247,.6)]">
      <div className="flex items-center gap-3 mb-8 max-sm:mb-5">
        <div className="w-11 h-11 rounded-[14px] bg-gradient-to-b from-lantern-400 to-vermilion-600 grid place-items-center font-jp font-bold text-lg text-white shadow-lg ring-1 ring-white/30">
          宝
        </div>
        <span className="font-display font-bold text-xl text-white">
          Otaku<span className="text-gradient">Vault</span>
        </span>
      </div>
      <h1 className="text-3xl font-bold mb-1">{title}</h1>
      <p className="text-slate-400 mb-6 text-sm">{subtitle}</p>
      {children}
    </div>
  )
}

export function AuthLoading() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center py-24">
      <div className="w-12 h-12 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin" />
      <p className="text-gradient font-display font-semibold">Opening your library...</p>
    </div>
  )
}
