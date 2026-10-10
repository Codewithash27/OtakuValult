import { Status, STATUS_LABELS } from '../types/media'

interface FilterChipsProps {
  selectedStatus: Status | 'all'
  onStatusChange: (status: Status | 'all') => void
  counts: Record<Status | 'all', number>
}

const statuses: (Status | 'all')[] = ['all', 'watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch']

export function FilterChips({ selectedStatus, onStatusChange, counts }: FilterChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {statuses.map((status) => (
        <button
          key={status}
          onClick={() => onStatusChange(status)}
          className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-colors ${
            selectedStatus === status
              ? 'bg-sky-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {status === 'all' ? 'All' : STATUS_LABELS[status]} ({counts[status]})
        </button>
      ))}
    </div>
  )
}
