import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addPornhwadbToShelf } from '../lib/addPornhwadbItem'
import { formatRatingOutOf5, chartCoverUrl } from '../lib/manhwaCharts'
import { getPornhwadbSeries, type PornhwaSeries } from '../lib/pornhwadb'
import { useMediaItems } from '../hooks/useMediaItems'
import { useToast } from './Toast'

type Props = {
  slug: string
  backHref: string
}

function cleanSynopsis(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900/5 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-white/10">
      {children}
    </span>
  )
}

export function ManhwaSeriesDetail({ slug, backHref }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { data: shelf = [] } = useMediaItems()
  const [addedId, setAddedId] = useState<string | null>(null)
  const [synopsisOpen, setSynopsisOpen] = useState(false)

  const series = useQuery({
    queryKey: ['pornhwadb-series', slug],
    queryFn: () => getPornhwadbSeries(slug),
    staleTime: 30 * 60 * 1000,
  })

  const onShelf = useMemo(() => {
    const hit = shelf.find((i) => i.source === 'pornhwadb' && i.external_id === slug)
    return hit?.id ?? addedId
  }, [shelf, slug, addedId])

  const add = useMutation({
    mutationFn: (row: PornhwaSeries) => addPornhwadbToShelf(row),
    onSuccess: (id) => {
      setAddedId(id)
      queryClient.invalidateQueries({ queryKey: ['media-items'] })
      showToast('Added to your manhwa list', 'success')
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Could not add', 'error'),
  })

  if (series.isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 grid place-items-center">
        <div className="w-48 aspect-[3/4] rounded-2xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
      </div>
    )
  }

  if (series.error || !series.data) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-rose-500 text-sm">{(series.error as Error)?.message ?? 'Not found'}</p>
        <Link to={backHref} className="text-violet-500 text-sm font-semibold hover:underline">
          ← Back to list
        </Link>
      </div>
    )
  }

  const row = series.data
  const cover = chartCoverUrl(row.coverImage)
  const ratings =
    row.totalRatings === 1 ? '1 rating' : `${(row.totalRatings ?? 0).toLocaleString()} ratings`
  const synopsis = cleanSynopsis(row.description)
  const longSynopsis = synopsis.length > 420

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-up pb-8">
      <Link to={backHref} className="text-sm text-violet-500 font-semibold hover:underline inline-flex items-center gap-1">
        ← Back to top rated
      </Link>

      <article className="glass-strong rounded-3xl overflow-hidden">
        <div className="p-5 sm:p-8">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
            <div className="w-[200px] sm:w-[220px] mx-auto md:mx-0 shrink-0">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/10 dark:ring-white/15 shadow-2xl shadow-violet-950/20">
                {cover ? (
                  <img src={cover} alt="" className="w-full aspect-[2/3] object-cover bg-slate-900" />
                ) : (
                  <div className="aspect-[2/3] grid place-items-center text-4xl bg-slate-800 text-slate-600">📖</div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full space-y-4">
              <header>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-400 mb-1">
                  Manhwa · 18+
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold font-display leading-tight text-slate-900 dark:text-white">
                  {row.title}
                </h1>
                {row.alternativeTitles.length > 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                    {row.alternativeTitles.slice(0, 4).join(' · ')}
                  </p>
                )}
              </header>

              <div className="flex flex-wrap gap-2">
                <MetaPill>{formatRatingOutOf5(row.averageRating)}</MetaPill>
                <MetaPill>{ratings}</MetaPill>
                {row.totalChapters != null && (
                  <MetaPill>
                    {row.totalChapters} ch
                  </MetaPill>
                )}
                {row.releaseYear != null && <MetaPill>{row.releaseYear}</MetaPill>}
                {row.status && <MetaPill>{row.status}</MetaPill>}
              </div>

              {row.tags.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {row.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/12 text-violet-700 dark:text-violet-200 border border-violet-500/25"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {onShelf ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/manhwa?item=${onShelf}`)}
                    className="btn-glow !py-2.5 !px-6 text-sm"
                  >
                    Open in my list
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={add.isPending}
                    onClick={() => add.mutate(row)}
                    className="btn-glow !py-2.5 !px-6 text-sm disabled:opacity-50"
                  >
                    {add.isPending ? 'Adding…' : 'Add to my list'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {synopsis && (
            <section className="mt-8 pt-6 border-t border-slate-200/80 dark:border-white/10">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Synopsis</h2>
              <p
                className={`text-sm text-slate-600 dark:text-slate-300 leading-relaxed ${
                  !synopsisOpen && longSynopsis ? 'line-clamp-5' : ''
                }`}
              >
                {synopsis}
              </p>
              {longSynopsis && (
                <button
                  type="button"
                  onClick={() => setSynopsisOpen((o) => !o)}
                  className="mt-2 text-xs font-semibold text-violet-500 hover:underline"
                >
                  {synopsisOpen ? 'Show less' : 'Read more'}
                </button>
              )}
            </section>
          )}
        </div>
      </article>
    </div>
  )
}
