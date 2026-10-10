interface RatingStarsProps {
  rating: number | null
  size?: 'sm' | 'md'
}

export function RatingStars({ rating, size = 'md' }: RatingStarsProps) {
  if (!rating) return <span className="text-gray-400">No rating</span>

  const stars = Math.round((rating / 10) * 5)
  const sizeClass = size === 'sm' ? 'text-sm' : 'text-base'

  return (
    <span className={`${sizeClass} text-yellow-500`}>
      {'★'.repeat(stars)}
      {'☆'.repeat(5 - stars)}
    </span>
  )
}
