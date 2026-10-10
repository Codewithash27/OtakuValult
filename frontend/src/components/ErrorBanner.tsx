interface ErrorBannerProps {
  error: Error | null
  onRetry?: () => void
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  if (!error) return null

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-red-800 dark:text-red-200 mb-1">Error loading items</h3>
          <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors flex-shrink-0"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
