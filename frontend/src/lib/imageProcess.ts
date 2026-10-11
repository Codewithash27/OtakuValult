// Width-bound rather than longest-side-bound so tall webtoon strips stay readable.
const FULL_MAX_W = 1280
// Stays under mobile canvas limits (~16.7M pixels on iOS) at full width.
const FULL_MAX_H = 12000
const THUMB_W = 480
/** Thumbnails of very tall strips keep only the top, at most this many times taller than wide. */
export const THUMB_MAX_RATIO = 2.5

export interface ProcessedImage {
  full: Blob
  thumb: Blob
  width: number
  height: number
  ext: string
}

type Source = ImageBitmap | HTMLImageElement

async function decode(file: Blob): Promise<Source> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Fall through to <img> decoding (older Safari).
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function sizeOf(src: Source) {
  return src instanceof HTMLImageElement ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height }
}

async function encode(src: Source, srcH: number, scale: number, quality: number) {
  const { w } = sizeOf(src)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(srcH * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, srcH, 0, 0, canvas.width, canvas.height)

  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality))
  // Browsers that can't encode WebP silently return PNG; JPEG keeps those files small.
  const webp = await toBlob('image/webp')
  if (webp?.type === 'image/webp') return { blob: webp, ext: 'webp', width: canvas.width, height: canvas.height }
  const jpeg = await toBlob('image/jpeg')
  if (!jpeg) throw new Error('Could not encode image')
  return { blob: jpeg, ext: 'jpg', width: canvas.width, height: canvas.height }
}

/** Shrinks an image for storage and makes a small thumbnail. GIFs keep their animation. */
export async function processImage(file: File): Promise<ProcessedImage> {
  const src = await decode(file)
  const { w, h } = sizeOf(src)
  try {
    const thumbH = Math.min(h, Math.round(w * THUMB_MAX_RATIO))
    const thumb = await encode(src, thumbH, Math.min(1, THUMB_W / w), 0.78)
    if (file.type === 'image/gif') {
      return { full: file, thumb: thumb.blob, width: w, height: h, ext: 'gif' }
    }
    const full = await encode(src, h, Math.min(1, FULL_MAX_W / w, FULL_MAX_H / h), 0.85)
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height, ext: full.ext }
  } finally {
    if ('close' in src) src.close()
  }
}
