import { Status, STATUS_LABELS } from '../types/media'
import { ChipScroller } from './ChipScroller'

interface FilterChipsProps {
  selectedStatus: Status | 'all'
  onStatusChange: (status: Status | 'all') => void
  counts: Record<Status | 'all', number>
  compact?: boolean
}

const statuses: (Status | 'all')[] = ['all', 'watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch']

export function FilterChips({ selectedStatus, onStatusChange, counts, compact }: FilterChipsProps) {
  return (
    <ChipScroller className={compact ? '' : 'gap-2'}>
      {statuses.map((status) => (
        <button
          key={status}
          onClick={() => onStatusChange(status)}
          className={`chip flex items-center ${compact ? '!px-3 !py-1 !text-xs gap-1.5' : 'gap-2'} ${
            selectedStatus === status ? 'chip-active' : ''
          }`}
        >
          {status === 'all' ? 'All' : STATUS_LABELS[status]}
          <span className="relative text-[11px] px-1.5 rounded-md bg-black/10 dark:bg-white/10 tabular-nums">{counts[status]}</span>
        </button>
      ))}
    </ChipScroller>
  )
}
