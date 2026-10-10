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
      className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
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
