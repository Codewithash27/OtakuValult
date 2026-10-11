import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useContentMode } from '../hooks/useAdultFilter'
import { isBackendConfigured } from '../lib/api'
import { ManhwaSeriesDetail } from '../components/ManhwaSeriesDetail'
import {
  chartCoverUrl,
  chartSortLabel,
  fetchManhwaChartPage,
  fetchManhwaChartTags,
  formatRatingOutOf5,
  type ManhwaChartSort,
  type RankedManhwa,
} from '../lib/manhwaCharts'
import { pornhwadbStatus } from '../lib/pornhwadb'

const UI_PAGE_SIZE = 24
const TAGS_COLLAPSED = 24

function listBackSearchParams(params: URLSearchParams): string {
  const next = new URLSearchParams()
  const sort = params.get('sort')
  const tag = params.get('tag')
  if (sort) next.set('sort', sort)
  if (tag) next.set('tag', tag)
  const q = next.toString()
  return q ? `?${q}` : ''
}

function RankedCard({ item, listQuery }: { item: RankedManhwa; listQuery: string }) {
  const cover = chartCoverUrl(item.coverImage)
  const ratings =
    item.totalRatings === 1 ? '1 rating' : `${(item.totalRatings ?? 0).toLocaleString()} ratings`

  return (
    <Link
      to={`/community-lists/series/${encodeURIComponent(item.slug)}${listQuery}`}
      className="group block text-left"
    >
      <div className="relative rounded-xl overflow-hidden ring-1 ring-white/10 group-hover:ring-violet-500/50 transition-shadow bg-slate-900">
        <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/75 text-[11px] font-bold text-white tabular-nums">
          #{item.rank}
        </span>
        {cover ? (
          <img
            src={cover}
            alt=""
            className="aspect-[3/4] w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="aspect-[3/4] grid place-items-center text-3xl text-slate-600">📖</div>
        )}
      </div>
      <h3 className="font-bold text-sm mt-2.5 line-clamp-2 leading-snug text-slate-900 dark:text-white">{item.title}</h3>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
        {formatRatingOutOf5(item.averageRating)} · {ratings}
      </p>
    </Link>
  )
}

function ChartHeader({ sort }: { sort: ManhwaChartSort }) {
  const title = sort === 'top-rated' ? 'Top rated pornhwa' : `${chartSortLabel(sort)} manhwa`
  const blurb =
    sort === 'top-rated'
      ? 'Official top 100 from PornhwaDB. Tap a title for info and tags, or add it to your manhwa list.'
      : 'From your export file — tap for details. Yuri / BL excluded from charts.'

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="mr-auto max-w-2xl">
        <h1 className="text-2xl font-bold font-display text-slate-900 dark:text-white">
          {title}{' '}
          <span className="text-xs font-semibold align-middle px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">
            Creamy
          </span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{blurb}</p>
      </div>
    </div>
  )
}

function ExportSetup() {
  return (
    <div className="glass rounded-2xl p-8 max-w-lg mx-auto text-center mt-8">
      <div className="text-4xl mb-3">📦</div>
      <h2 className="font-bold text-lg">Export file required</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
        Copy <code className="px-1 rounded bg-black/10 dark:bg-white/10">pornhwa-export.json</code> to{' '}
        <code className="px-1 rounded bg-black/10 dark:bg-white/10">backend/data/</code> and restart the backend.
      </p>
    </div>
  )
}

function ManhwaTopList() {
  const [params, setParams] = useSearchParams()
  const sort = (params.get('sort') as ManhwaChartSort) || 'top-rated'
  const safeSort: ManhwaChartSort =
    sort === 'trending' || sort === 'recent' ? sort : 'top-rated'
  const selectedTag = params.get('tag')
  const [page, setPage] = useState(1)
  const [showAllTags, setShowAllTags] = useState(false)
  const listQuery = listBackSearchParams(params)

  const status = useQuery({
    queryKey: ['pornhwadb-status'],
    queryFn: pornhwadbStatus,
    enabled: isBackendConfigured(),
    staleTime: 5 * 60 * 1000,
  })

  const tagCounts = useQuery({
    queryKey: ['manhwa-chart-tags', safeSort],
    queryFn: () => fetchManhwaChartTags(safeSort),
    enabled: !!status.data?.configured && isBackendConfigured(),
    staleTime: 10 * 60 * 1000,
  })

  const list = useQuery({
    queryKey: ['manhwa-chart', safeSort, page, selectedTag],
    queryFn: () => fetchManhwaChartPage(page, safeSort, UI_PAGE_SIZE, selectedTag),
    enabled: !!status.data?.configured && isBackendConfigured(),
    staleTime: 10 * 60 * 1000,
  })

  const visibleTags = showAllTags
    ? (tagCounts.data ?? [])
    : (tagCounts.data ?? []).slice(0, TAGS_COLLAPSED)

  const setSort = (next: ManhwaChartSort) => {
    setParams((prev) => {
      const n = new URLSearchParams(prev)
      if (next === 'top-rated') n.delete('sort')
      else n.set('sort', next)
      return n
    })
    setPage(1)
  }

  const toggleTag = (name: string) => {
    setParams((prev) => {
      const n = new URLSearchParams(prev)
      if (selectedTag === name) n.delete('tag')
      else n.set('tag', name)
      return n
    })
    setPage(1)
  }

  if (!isBackendConfigured()) {
    return (
      <div className="glass rounded-2xl p-8 max-w-lg mx-auto text-center mt-8">
        <p className="text-sm text-slate-500">Set VITE_API_URL to your backend to load top rated manhwa.</p>
      </div>
    )
  }

  if (status.isLoading) {
    return <p className="text-sm text-slate-500 py-12 text-center">Checking export…</p>
  }

  if (!status.data?.configured) {
    return <ExportSetup />
  }

  return (
    <div className="space-y-5">
      <ChartHeader sort={safeSort} />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['top-rated', '⭐ Top rated'],
            ['trending', '⚡ Trending'],
            ['recent', '🕐 New'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSort(id)}
            className={`chip !px-3 !py-1.5 !text-xs ${safeSort === id ? 'chip-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Tags in this chart
        </p>
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            type="button"
            onClick={() => {
              setParams((prev) => {
                const n = new URLSearchParams(prev)
                n.delete('tag')
                return n
              })
              setPage(1)
            }}
            className={`chip !px-2.5 !py-1 !text-[11px] ${!selectedTag ? 'chip-active' : ''}`}
          >
            All
          </button>
          {tagCounts.isLoading && <span className="text-xs text-slate-500">Loading tags…</span>}
          {visibleTags.map(({ name, count }) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleTag(name)}
              className={`chip !px-2.5 !py-1 !text-[11px] ${selectedTag === name ? 'chip-active' : ''}`}
            >
              {name} <span className="opacity-65 tabular-nums">{count}</span>
            </button>
          ))}
          {(tagCounts.data?.length ?? 0) > TAGS_COLLAPSED && (
            <button
              type="button"
              onClick={() => setShowAllTags((v) => !v)}
              className="chip !px-2.5 !py-1 !text-[11px] text-violet-500"
            >
              {showAllTags ? 'Less' : `+${(tagCounts.data?.length ?? 0) - TAGS_COLLAPSED} more`}
            </button>
          )}
        </div>
      </div>

      {list.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-6">
          {Array.from({ length: UI_PAGE_SIZE }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[3/4] rounded-xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
            </div>
          ))}
        </div>
      ) : list.error ? (
        <p className="text-rose-500 text-sm">{(list.error as Error).message}</p>
      ) : !list.data?.items.length ? (
        <p className="text-sm text-slate-500 py-12 text-center">No titles match this filter.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-6">
            {list.data.items.map((item) => (
              <RankedCard key={`${item.rank}-${item.slug}`} item={item} listQuery={listQuery} />
            ))}
          </div>

          <div className="flex justify-center items-center gap-2 pt-2 pb-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="chip !px-4 !py-2 !text-xs disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-sm text-slate-500 tabular-nums px-2">
              Page {page}
              {list.data.total ? ` · ${list.data.total.toLocaleString()} titles` : ''}
            </span>
            <button
              type="button"
              disabled={!list.data.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
              className="chip !px-4 !py-2 !text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function CreamyGate() {
  return (
    <div className="glass rounded-2xl p-8 max-w-lg mx-auto text-center mt-8">
      <div className="text-4xl mb-3">🔞</div>
      <h2 className="font-bold text-lg">Creamy mode only</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
        Top rated manhwa is 18+. Switch to <strong>Creamy</strong> on your library to browse.
      </p>
    </div>
  )
}

export default function CommunityLists() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const [contentMode] = useContentMode()
  const listQuery = listBackSearchParams(params)

  if (contentMode !== 'creamy') {
    return <CreamyGate />
  }

  if (slug) {
    return (
      <ManhwaSeriesDetail slug={decodeURIComponent(slug)} backHref={`/community-lists${listQuery}`} />
    )
  }

  return <ManhwaTopList />
}
