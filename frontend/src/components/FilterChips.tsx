import { Status, STATUS_LABELS } from '../types/media'

interface FilterChipsProps {
  selectedStatus: Status | 'all'
  onStatusChange: (status: Status | 'all') => void
  counts: Record<Status | 'all', number>
}

const statuses: (Status | 'all')[] = ['all', 'watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch']

export function FilterChips({ selectedStatus, onStatusChange, counts }: FilterChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto p-1">
      {statuses.map((status) => (
        <button
          key={status}
          onClick={() => onStatusChange(status)}
          className={`chip flex items-center gap-2 ${selectedStatus === status ? 'chip-active' : ''}`}
        >
          {status === 'all' ? 'All' : STATUS_LABELS[status]}
          <span className="text-[11px] px-1.5 rounded-md bg-black/10 dark:bg-white/10">{counts[status]}</span>
        </button>
      ))}
    </div>
  )
}
