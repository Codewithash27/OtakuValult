import { MediaItem } from '../types/media'
import { useAdultOverride, useIsAdult } from '../hooks/useAdultFilter'

export function AdultToggle({ item }: { item: MediaItem }) {
  const [override, setOverride] = useAdultOverride(item.id)
  const isAdult = useIsAdult([item])(item)

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border border-slate-200 bg-white/50 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500">18+</span>
          Adult content
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {override === undefined ? 'Auto-detected from AniList' : 'Set by you'} · hidden in Clean mode
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {override !== undefined && (
          <button onClick={() => setOverride(null)} className="text-[11px] text-slate-400 hover:text-violet-500" title="Back to auto">
            Reset
          </button>
        )}
        <button
          role="switch"
          aria-checked={isAdult}
          onClick={() => setOverride(!isAdult)}
          className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${
            isAdult ? 'bg-gradient-to-r from-rose-500 to-pink-600' : 'bg-slate-300 dark:bg-white/15'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${
              isAdult ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>
    </div>
  )
}
