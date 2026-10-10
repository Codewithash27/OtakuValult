type SortOption = 'recent' | 'title-asc' | 'rating-desc'

interface SortSelectProps {
  value: SortOption
  onChange: (sort: SortOption) => void
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'title-asc', label: 'Title (A-Z)' },
  { value: 'rating-desc', label: 'Rating (High-Low)' },
]

export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortOption)}
      className="h-10 pl-3 pr-8 rounded-xl text-sm font-semibold cursor-pointer outline-none transition-all border border-slate-200 bg-white/60 text-slate-700 hover:border-violet-400 focus:ring-4 focus:ring-violet-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:[color-scheme:dark] [&>option]:bg-white dark:[&>option]:bg-[#141126]"
    >
      {sortOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export type { SortOption }
