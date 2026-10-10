import { useState } from 'react'
import { MediaType, MEDIA_TYPE_EMOJI } from '../types/media'

interface PosterImageProps {
  src: string | null
  alt: string
  mediaType: MediaType
  className?: string
}

export function PosterImage({ src, alt, mediaType, className = '' }: PosterImageProps) {
  const [imgError, setImgError] = useState(false)

  if (!src || imgError) {
    return (
      <div
        className={`${className} bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900 dark:to-blue-900 flex items-center justify-center text-4xl`}
      >
        {MEDIA_TYPE_EMOJI[mediaType]}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setImgError(true)}
      loading="lazy"
      className={`${className} object-cover`}
    />
  )
}
