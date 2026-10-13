import { ChipScroller } from './ChipScroller'

export interface PosterTile {
  key: string
  title: string
  cover: string | null
  subtitle?: string
  badge?: string
  onClick: () => void
}

export function AnimePosterRow({
  title,
  action,
  items,
}: {
  title: string
  action?: { label: string; onClick: () => void }
  items: PosterTile[]
}) {
  if (!items.length) return null
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900 dark:text-white">{title}</h2>
        {action && (
          <button type="button" onClick={action.onClick} className="text-xs font-semibold text-lantern-500 hover:text-lantern-400">
            {action.label} →
          </button>
        )}
      </div>
      <ChipScroller railClassName="!gap-3 !items-start !py-1">
        {items.map((item) => (
          <button key={item.key} type="button" onClick={item.onClick} className="anime-tile group snap-start w-[6.75rem] sm:w-[9rem] shrink-0 text-left">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 bg-slate-900">
              {item.cover ? (
                <img src={item.cover} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-2xl opacity-40">⛩️</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-80" />
              {item.badge && (
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white bg-black/65 backdrop-blur-sm">
                  {item.badge}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[12px] sm:text-[13px] font-semibold leading-snug line-clamp-2 text-slate-800 dark:text-white/90">
              {item.title}
            </p>
            {item.subtitle && <p className="mt-0.5 text-[10px] text-slate-500 dark:text-white/40">{item.subtitle}</p>}
          </button>
        ))}
      </ChipScroller>
    </section>
  )
}
