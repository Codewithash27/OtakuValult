interface ProgressBarProps {
  progress: number
  total: number | null
}

export function ProgressBar({ progress, total }: ProgressBarProps) {
  if (!total || total === 0) return null

  const percentage = Math.round((progress / total) * 100)

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span>Progress</span>
        <span>{progress}/{total}</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-sky-600 h-2 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
