import { MediaItem } from '../types/media'
import { PosterImage } from './PosterImage'
import { StatusBadge } from './StatusBadge'
import { RatingStars } from './RatingStars'
import { ProgressBar } from './ProgressBar'

interface MediaRowProps {
  item: MediaItem
}

export function MediaRow({ item }: MediaRowProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow p-4 flex gap-4">
      <div className="flex-shrink-0">
        <PosterImage
          src={item.poster_url}
          alt={item.title}
          mediaType={item.media_type}
          className="w-20 h-32 rounded"
        />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 dark:text-white truncate mb-1">
          {item.title}
        </h3>
        <div className="flex flex-wrap gap-2 items-center mb-3">
          {item.year && (
            <span className="text-sm text-gray-600 dark:text-gray-400">{item.year}</span>
          )}
          <StatusBadge status={item.status} size="sm" />
        </div>
        {item.rating && (
          <div className="mb-2">
            <RatingStars rating={item.rating} size="sm" />
          </div>
        )}
        {item.total && <ProgressBar progress={item.progress} total={item.total} />}
        {item.notes && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
            {item.notes}
          </p>
        )}
      </div>
    </div>
  )
}
