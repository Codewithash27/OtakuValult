interface SkeletonProps {
  count?: number
  view?: 'grid' | 'list'
  cols?: number
}

export function Skeleton({ count = 8, view = 'grid', cols = 4 }: SkeletonProps) {
  if (view === 'list') {
    return (
      <div className="space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 rounded-lg p-4 flex gap-4 animate-pulse"
          >
            <div className="w-20 h-32 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-${cols} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden animate-pulse">
          <div className="w-full aspect-[2/3] bg-gray-200 dark:bg-gray-700" />
          <div className="p-4 space-y-3">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
