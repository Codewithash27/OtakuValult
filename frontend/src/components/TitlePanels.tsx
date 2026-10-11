import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MediaItem } from '../types/media'
import { usePanels, useSignedUrls } from '../hooks/usePanels'
import { useMediaItems } from '../hooks/useMediaItems'
import { useGalleryBlur, usePanelAccess } from '../hooks/usePanelAccess'
import { PanelUploadDialog } from './PanelUploadDialog'

const PREVIEW_LIMIT = 24

/** The "Panels" tab inside a title's drawer. */
export function TitlePanels({ item }: { item: MediaItem }) {
  const { data: allPanels = [], isLoading, error } = usePanels()
  const { data: items = [] } = useMediaItems()
  const { visible, isAdultPanel, isAdultItem } = usePanelAccess(allPanels, items)
  const [blur] = useGalleryBlur()
  const [uploadOpen, setUploadOpen] = useState(false)

  const panels = useMemo(() => visible.filter((p) => p.media_item_id === item.id), [visible, item.id])
  const shown = panels.slice(0, PREVIEW_LIMIT)
  const urlOf = useSignedUrls(shown.map((p) => p.thumb_path))
  const tagSuggestions = useMemo(() => [...new Set(allPanels.flatMap((p) => p.tags))], [allPanels])

  if (error) {
    return <p className="text-sm text-slate-500">Gallery isn't set up yet. Open the Gallery page for the one-time setup.</p>
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setUploadOpen(true)}
          className="aspect-[3/4] rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-violet-400 hover:text-violet-500 grid place-items-center text-center text-xs font-semibold text-slate-500 transition-colors"
        >
          <span>
            <span className="block text-2xl">＋</span>
            Add images
          </span>
        </button>
        {isLoading
          ? Array.from({ length: 5 }, (_, i) => <div key={i} className="aspect-[3/4] rounded-xl bg-white/5 animate-pulse" />)
          : shown.map((p) => {
              const url = urlOf(p.thumb_path)
              const hidden = blur && isAdultPanel(p)
              return (
                <Link
                  key={p.id}
                  to={`/gallery?title=${item.id}&panel=${p.id}`}
                  className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-200 dark:bg-white/5 group"
                >
                  {url && (
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      className={`w-full h-full object-cover object-top transition-transform duration-300 ${hidden ? 'blur-xl scale-110' : 'group-hover:scale-105'}`}
                    />
                  )}
                  {hidden && <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-white">18+</span>}
                </Link>
              )
            })}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {panels.length === 0 ? (
          'No images for this title yet.'
        ) : (
          <>
            {panels.length} image{panels.length === 1 ? '' : 's'} ·{' '}
            <Link to={`/gallery?title=${item.id}`} className="font-semibold text-violet-500 dark:text-violet-300 hover:underline">
              Open in Gallery →
            </Link>
          </>
        )}
      </p>

      <PanelUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        items={items}
        isAdultItem={isAdultItem}
        tagSuggestions={tagSuggestions}
        presetItemId={item.id}
      />
    </div>
  )
}
