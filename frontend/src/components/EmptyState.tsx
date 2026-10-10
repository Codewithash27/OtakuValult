interface EmptyStateProps {
  title?: string
  description?: string
}

export function EmptyState({
  title = 'Your shelf is empty',
  description = 'Start adding items to your library',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-6xl mb-4">📚</div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">{description}</p>
      <button
        disabled
        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg cursor-not-allowed"
      >
        + Add item (Coming soon)
      </button>
    </div>
  )
}
