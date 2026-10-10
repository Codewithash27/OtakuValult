interface RatingStarsProps {
  rating: number | null
  size?: 'sm' | 'md'
}

export function RatingStars({ rating, size = 'md' }: RatingStarsProps) {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) {
    return <span className="text-gray-400">No rating</span>
  }

  // Accept either a 1–10 score or a value that was accidentally scaled by 10.
  const normalized = rating > 10 ? rating / 10 : rating
  const stars = Math.min(5, Math.max(0, Math.round((normalized / 10) * 5)))
  const sizeClass = size === 'sm' ? 'text-sm' : 'text-base'

  return (
    <span className={`${sizeClass} text-yellow-500`}>
      {'★'.repeat(stars)}
      {'☆'.repeat(5 - stars)}
    </span>
  )
}
