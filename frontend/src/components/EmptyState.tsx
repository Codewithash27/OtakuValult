interface EmptyStateProps {
  title?: string
  description?: string
  onAddClick?: () => void
}

export function EmptyState({
  title = 'Your shelf is empty',
  description = 'Start adding items to your library',
  onAddClick,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-6xl mb-4">📚</div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">{description}</p>
      <button
        onClick={onAddClick}
        disabled={!onAddClick}
        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
          onAddClick
            ? 'bg-sky-600 hover:bg-sky-700 text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed'
        }`}
      >
        + Add item
      </button>
    </div>
  )
}
