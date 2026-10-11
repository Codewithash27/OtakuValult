import { ReactNode } from 'react'

const CARDS = [
  { g: 'from-violet-600 via-fuchsia-500 to-pink-500', label: 'Anime', icon: '⛩️' },
  { g: 'from-cyan-500 via-sky-500 to-indigo-600', label: 'Manga', icon: '📖' },
  { g: 'from-amber-400 via-orange-500 to-rose-600', label: 'Webtoons', icon: '📱' },
  { g: 'from-emerald-400 via-teal-500 to-cyan-600', label: 'Your shelf', icon: '📚' },
  { g: 'from-pink-500 via-rose-500 to-violet-600', label: 'Manhwa', icon: '✨' },
]

function PosterCarousel3D() {
  const step = 360 / CARDS.length
  return (
    <div className="relative h-[420px] w-full grid place-items-center" style={{ perspective: 1100 }}>
      <div
        className="relative w-40 h-60 animate-[orbit_18s_linear_infinite]"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {CARDS.map((c, i) => (
          <div
            key={c.label}
            className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${c.g} p-4 flex flex-col justify-between border border-white/20 shadow-[0_20px_60px_-10px_rgba(124,58,237,.6)]`}
            style={{ transform: `rotateY(${i * step}deg) translateZ(230px)`, backfaceVisibility: 'hidden' }}
          >
            <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.45),transparent_55%)]" />
            <span className="relative text-4xl drop-shadow-lg">{c.icon}</span>
            <div className="relative">
              <div className="h-1.5 w-16 rounded-full bg-white/50 mb-2" />
              <div className="font-display font-bold text-white text-xl drop-shadow">{c.label}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-6 w-72 h-10 rounded-[50%] bg-violet-600/40 blur-2xl" />
    </div>
  )
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 items-center p-4 lg:p-10 gap-10 overflow-hidden">
      <div className="aurora"><span /></div>
      <div className="aurora-grid" />

      <div className="hidden lg:flex flex-col items-center text-center animate-fade-up">
        <PosterCarousel3D />
        <h2 className="text-5xl font-bold mt-4">
          Your <span className="text-gradient">anime vault</span>
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 max-w-sm">
          Track every series, chapter and film with a shelf that feels as good as the stories on it.
        </p>
      </div>

      <div className="w-full max-w-md mx-auto animate-fade-up [animation-delay:120ms]">
        <div className="card-ring glass-strong rounded-3xl p-8 shadow-[0_30px_80px_-20px_rgba(124,58,237,.45)]">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 grid place-items-center font-display font-bold text-white shadow-lg">
              M
            </div>
            <span className="font-display font-bold text-xl text-gradient">MediaShelf</span>
          </div>
          <h1 className="text-3xl font-bold mb-1">{title}</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}
