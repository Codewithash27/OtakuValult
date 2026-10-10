import { MediaItem } from '../types/media'
import { PosterImage } from './PosterImage'
import { StatusBadge } from './StatusBadge'
import { RatingStars } from './RatingStars'
import { ProgressBar } from './ProgressBar'

interface MediaCardProps {
  item: MediaItem
}

export function MediaCard({ item }: MediaCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden">
      <PosterImage
        src={item.poster_url}
        alt={item.title}
        mediaType={item.media_type}
        className="w-full aspect-[2/3]"
      />
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white truncate mb-2">
          {item.title}
        </h3>
        {item.year && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{item.year}</p>
        )}
        <div className="mb-3">
          <StatusBadge status={item.status} size="sm" />
        </div>
        {item.rating && (
          <div className="mb-3">
            <RatingStars rating={item.rating} size="sm" />
          </div>
        )}
        {item.total && <ProgressBar progress={item.progress} total={item.total} />}
      </div>
    </div>
  )
}
