import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gelbooruTagImages, readGelbooruCredentials, type FoundMedia } from '../lib/imageFinder'
import { foundMediaFromPornhwadb, type PornhwaSeries } from '../lib/pornhwadb'
import { Section } from './TitleDetailParts'

export function ManhwaStills({ series }: { series: PornhwaSeries }) {
  const creds = readGelbooruCredentials()
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<string | null>(null)
  const media: FoundMedia = foundMediaFromPornhwadb(series)

  const stills = useQuery({
    queryKey: ['manhwa-stills', series.slug, creds?.userId],
    queryFn: () => gelbooruTagImages(media, creds!, 'explicit', 1),
    enabled: open && !!creds,
    staleTime: 30 * 60 * 1000,
    retry: 0,
  })

  const images = (stills.data?.images ?? []).slice(0, 12)

  return (
    <Section title="Explicit stills">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Single frames for this title. Chapters stay on the site linked under Where to read.
      </p>
      {!creds ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Add a Gelbooru key in Find Images to load explicit stills here.
        </p>
      ) : (
        <>
          <button type="button" onClick={() => setOpen((value) => !value)} className="chip !text-xs">
            {open ? 'Hide stills' : 'Show stills'}
          </button>
          {open && stills.isLoading && <p className="text-sm text-slate-500 mt-3">Looking for stills…</p>}
          {open && stills.isError && (
            <p className="text-sm text-rose-500 mt-3">
              {(stills.error as Error).message || 'Could not load stills.'}
            </p>
          )}
          {open && !stills.isLoading && !stills.isError && images.length === 0 && (
            <p className="text-sm text-slate-500 mt-3">No explicit stills matched this title.</p>
          )}
          {images.length > 0 && (
            <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {images.map((image) => {
                const revealed = shown === image.sourceUrl
                return (
                  <button
                    key={image.sourceUrl}
                    type="button"
                    onClick={() => setShown(revealed ? null : image.sourceUrl)}
                    className="relative aspect-[3/4] overflow-hidden rounded-xl bg-slate-900 ring-1 ring-white/10"
                  >
                    <img
                      src={image.thumb}
                      alt=""
                      className={`h-full w-full object-cover transition duration-300 ${revealed ? '' : 'blur-md scale-105'}`}
                    />
                    {!revealed && (
                      <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-white">18+</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </Section>
  )
}
