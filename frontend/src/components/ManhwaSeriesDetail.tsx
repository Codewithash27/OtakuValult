import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addPornhwadbToShelf } from '../lib/addPornhwadbItem'
import { chartCoverUrl } from '../lib/manhwaCharts'
import { getPornhwadbSeries, getPornhwadbSimilar, type PornhwaSeries, type SimilarSeries } from '../lib/pornhwadb'
import { useMediaItems } from '../hooks/useMediaItems'
import { STATUS_LABELS } from '../types/media'
import { useToast } from './Toast'
import {
  BackPill,
  CoverCard,
  CoverRow,
  DetailHero,
  HeroBadge,
  InfoRow,
  ScoreTile,
  Section,
  Stat,
  Synopsis,
  TagChips,
} from './TitleDetailParts'

type Props = {
  slug: string
  backHref: string
}

function cleanSynopsis(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const seriesHref = (slug: string | null | undefined) => `/community-lists/series/${encodeURIComponent(slug || '')}`

function SimilarRow({ title, items }: { title: string; items: SimilarSeries[] }) {
  if (!items.length) return null
  return (
    <Section title={title}>
      <CoverRow>
        {items.map((s) => (
          <CoverCard
            key={s.slug}
            to={seriesHref(s.slug)}
            image={chartCoverUrl(s.coverImage)}
            title={s.title}
            badge={s.averageRating ? `★ ${Number(s.averageRating).toFixed(1)}` : undefined}
            subtitle={s.tags.slice(0, 2).join(' · ')}
          />
        ))}
      </CoverRow>
    </Section>
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

  const similar = useQuery({
    queryKey: ['pornhwadb-similar', slug],
    queryFn: () => getPornhwadbSimilar(slug, 10),
    staleTime: 30 * 60 * 1000,
    enabled: !!series.data,
  })

  const shelfItem = useMemo(() => {
    return (
      shelf.find(
        (i) =>
          (i.source === 'pornhwadb' && i.external_id === slug) ||
          (series.data?.title && i.title.toLowerCase() === series.data.title.toLowerCase())
      ) ?? null
    )
  }, [shelf, slug, series.data?.title])

  const onShelf = shelfItem?.id ?? addedId

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
      <div className="max-w-6xl mx-auto space-y-6 pb-8">
        <div className="h-[340px] rounded-3xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          <div className="h-48 rounded-2xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
          <div className="h-48 rounded-2xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
        </div>
      </div>
    )
  }

  if (series.error || !series.data) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-rose-500 text-sm">{(series.error as Error)?.message ?? 'Not found'}</p>
        <button type="button" onClick={() => navigate(backHref)} className="text-violet-500 text-sm font-semibold hover:underline">
          ← Back to list
        </button>
      </div>
    )
  }

  const row = series.data
  const cover = chartCoverUrl(row.coverImage)
  const synopsis = cleanSynopsis(row.description)
  const rating = row.averageRating != null ? Number(row.averageRating) : null
  const ratingCount = row.totalRatings ?? 0
  const links = row.externalLinks.filter((l) => l.url)

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up pb-10">
      <DetailHero backdrop={cover} sharp={false}>
        <BackPill to={backHref} />

        <div className="relative flex flex-col sm:flex-row gap-6 sm:gap-7 p-5 sm:p-7 pt-16 sm:pt-14">
          <div className="w-36 sm:w-40 lg:w-44 shrink-0 mx-auto sm:mx-0">
            <div className="relative rounded-2xl overflow-hidden ring-2 ring-white/15 shadow-2xl shadow-violet-950/40">
              {cover ? (
                <img src={cover} alt={row.title} className="w-full aspect-[2/3] object-cover bg-slate-900" />
              ) : (
                <div className="aspect-[2/3] grid place-items-center text-4xl bg-slate-800 text-slate-600">📖</div>
              )}
              {onShelf && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-white shadow-lg">
                  ✓ In Vault
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-end gap-4 text-center sm:text-left">
            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                <HeroBadge>Manhwa</HeroBadge>
                <HeroBadge tone="adult">18+</HeroBadge>
                {shelfItem && (
                  <HeroBadge tone="vault">
                    {STATUS_LABELS[shelfItem.status]} · {shelfItem.progress}
                    {row.totalChapters ? `/${row.totalChapters}` : ''} ch
                    {shelfItem.rating ? ` · ★${shelfItem.rating}` : ''}
                  </HeroBadge>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold font-display leading-tight text-white drop-shadow-lg">{row.title}</h1>
              {row.alternativeTitles.length > 0 && (
                <p className="mt-1.5 text-sm text-white/60 truncate">{row.alternativeTitles.slice(0, 3).join(' · ')}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-3">
              {rating != null && ratingCount > 0 && <ScoreTile value={rating.toFixed(1)} outOf="/ 5" score100={rating * 20} />}
              <Stat label="Ratings" value={ratingCount.toLocaleString()} />
              {row.totalChapters != null && <Stat label="Chapters" value={row.totalChapters} />}
              {row.releaseYear != null && <Stat label="Year" value={row.releaseYear} />}
              {row.status && <Stat label="Status" value={row.status} />}
            </div>

            {row.tags.length > 0 && (
              <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
                {row.tags.slice(0, 5).map((g) => (
                  <span key={g} className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-white border border-white/15 backdrop-blur-sm">
                    {g}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-center sm:justify-start gap-2">
              {onShelf ? (
                <button type="button" onClick={() => navigate(`/manhwa?item=${onShelf}`)} className="btn-glow !py-2.5 !px-6 text-sm">
                  ✎ Edit in my list
                </button>
              ) : (
                <button
                  type="button"
                  disabled={add.isPending}
                  onClick={() => add.mutate(row)}
                  className="btn-glow !py-2.5 !px-6 text-sm disabled:opacity-50"
                >
                  {add.isPending ? 'Adding…' : '+ Add to my list'}
                </button>
              )}
              {links[0] && (
                <a
                  href={links[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
                >
                  Read on {links[0].siteName || 'site'} ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </DetailHero>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {synopsis && <Synopsis text={synopsis} open={synopsisOpen} onToggle={() => setSynopsisOpen((o) => !o)} />}

          {similar.isLoading && <div className="h-56 rounded-2xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />}
          <SimilarRow title="Similar storyline" items={similar.data?.storyline ?? []} />
          <SimilarRow title="Shares these tags" items={similar.data?.sharedTags ?? []} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-4">
          <Section title="Details">
            <dl>
              <InfoRow label="Type" value="Manhwa · 18+" />
              <InfoRow label="Chapters" value={row.totalChapters} />
              <InfoRow label="Status" value={row.status} />
              <InfoRow label="Released" value={row.releaseYear} />
              <InfoRow label="Rating" value={rating != null && ratingCount > 0 ? `${rating.toFixed(2)} / 5` : 'Not rated yet'} />
              <InfoRow label="Ratings" value={ratingCount.toLocaleString()} />
              {shelfItem && <InfoRow label="Your status" value={STATUS_LABELS[shelfItem.status]} />}
            </dl>
          </Section>

          {row.tags.length > 0 && (
            <Section title="Tags">
              <TagChips tags={row.tags.map((name) => ({ name }))} />
            </Section>
          )}

          {row.alternativeTitles.length > 0 && (
            <Section title="Also known as">
              <ul className="space-y-1">
                {row.alternativeTitles.map((t) => (
                  <li key={t} className="text-xs text-slate-600 dark:text-slate-300">
                    {t}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {links.length > 0 && (
            <Section title="Where to read">
              <div className="flex flex-col gap-2">
                {links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold bg-violet-500/10 text-violet-700 dark:text-violet-200 border border-violet-500/20 hover:bg-violet-500/20"
                  >
                    {l.siteName || new URL(l.url!).hostname}
                    <span>↗</span>
                  </a>
                ))}
              </div>
            </Section>
          )}
        </aside>
      </div>
    </div>
  )
}
