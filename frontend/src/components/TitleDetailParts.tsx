import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChipScroller } from './ChipScroller'

/** Gradient for a 0-100 score badge. */
export function scoreTone(score100: number) {
  if (score100 >= 80) return 'from-emerald-400 to-teal-500'
  if (score100 >= 70) return 'from-amber-300 to-orange-500'
  return 'from-rose-400 to-pink-500'
}

export function BackPill({ to }: { to?: string }) {
  const navigate = useNavigate()
  const cls =
    'absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 pl-2.5 pr-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-black/40 hover:bg-black/60 border border-white/15 backdrop-blur-md transition-colors'
  const icon = (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
      <path fillRule="evenodd" d="M12.7 4.3a1 1 0 010 1.4L8.4 10l4.3 4.3a1 1 0 01-1.4 1.4l-5-5a1 1 0 010-1.4l5-5a1 1 0 011.4 0z" clipRule="evenodd" />
    </svg>
  )
  if (to) {
    return (
      <Link to={to} className={cls}>
        {icon}
        Back
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className={cls}>
      {icon}
      Back
    </button>
  )
}

/** Banner/blurred-cover backdrop with gradients; children render on top. */
export function DetailHero({ backdrop, sharp, children }: { backdrop: string | null; sharp: boolean; children: ReactNode }) {
  return (
    <header className="relative rounded-3xl overflow-hidden ring-1 ring-white/10 shadow-2xl shadow-black/30 bg-slate-950">
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover ${sharp ? 'opacity-60' : 'opacity-40 blur-2xl scale-110'}`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-slate-950/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/40 to-transparent" />
      {children}
    </header>
  )
}

export function HeroBadge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'adult' | 'vault' }) {
  const styles = {
    default: 'uppercase tracking-wider bg-white/10 text-white/90 border border-white/15',
    adult: 'bg-rose-500/90 text-white',
    vault: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40',
  }
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${styles[tone]}`}>{children}</span>
}

export function ScoreTile({ value, outOf, score100 }: { value: string; outOf: string; score100: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid place-items-center w-12 h-12 rounded-xl bg-gradient-to-br ${scoreTone(score100)} text-white text-base font-extrabold shadow-lg`}
      >
        {value}
      </span>
      <Stat label="Score" value={outOf} />
    </div>
  )
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</p>
      <p className="text-sm font-bold text-white truncate">{value}</p>
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-200/70 dark:border-white/[0.06] last:border-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</dt>
      <dd className="text-xs font-semibold text-slate-800 dark:text-slate-100 text-right">{value}</dd>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass-strong rounded-2xl p-5">
      <h2 className="section-title !text-sm mb-3">{title}</h2>
      {children}
    </section>
  )
}

export function CoverRow({ children }: { children: ReactNode }) {
  return (
    <ChipScroller railClassName="!gap-3 !items-start !pt-2 snap-x">
      {children}
    </ChipScroller>
  )
}

export function CoverCard({
  to,
  image,
  title,
  badge,
  subtitle,
}: {
  to: string
  image: string | null
  title: string
  badge?: string
  subtitle?: string
}) {
  return (
    <Link to={to} className="group block w-[118px] shrink-0 snap-start lift">
      <div className="poster-shine relative rounded-xl overflow-hidden ring-1 ring-black/10 dark:ring-white/10 aspect-[2/3] bg-slate-800 group-hover:ring-lantern-400/60 group-hover:shadow-[0_14px_30px_-14px_rgba(249,138,7,.7)] transition-all duration-300">
        {image && (
          <img src={image} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        )}
        {badge && (
          <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide bg-black/70 text-white backdrop-blur-sm">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug group-hover:text-violet-500 transition-colors">
        {title}
      </p>
      {subtitle && <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>}
    </Link>
  )
}

export function TagChips({ tags }: { tags: { name: string; extra?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t.name}
          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/12 text-violet-700 dark:text-violet-200 border border-violet-500/25"
        >
          {t.name} {t.extra && <span className="opacity-60">{t.extra}</span>}
        </span>
      ))}
    </div>
  )
}

export function Synopsis({ text, open, onToggle }: { text: string; open: boolean; onToggle: () => void }) {
  const long = text.length > 480
  return (
    <Section title="Synopsis">
      <p className={`text-sm text-slate-600 dark:text-slate-300 leading-relaxed ${!open && long ? 'line-clamp-6' : ''}`}>{text}</p>
      {long && (
        <button type="button" onClick={onToggle} className="mt-2 text-xs font-semibold text-violet-500 hover:underline">
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </Section>
  )
}
