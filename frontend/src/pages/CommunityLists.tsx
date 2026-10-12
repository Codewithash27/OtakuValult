import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useContentMode } from '../hooks/useAdultFilter'
import { isBackendConfigured } from '../lib/api'
import { ManhwaSeriesDetail } from '../components/ManhwaSeriesDetail'
import { ChipScroller } from '../components/ChipScroller'
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

import { useMediaItems } from '../hooks/useMediaItems'

const UI_PAGE_SIZE = 24
function listBackSearchParams(params: URLSearchParams): string {
  const next = new URLSearchParams()
  const sort = params.get('sort')
  const tag = params.get('tag')
  if (sort) next.set('sort', sort)
  if (tag) next.set('tag', tag)
  const q = next.toString()
  return q ? `?${q}` : ''
}

const RANK_STYLE: Record<number, string> = {
  1: 'bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950 shadow-[0_0_14px_rgba(251,191,36,.7)]',
  2: 'bg-gradient-to-br from-slate-100 to-slate-400 text-slate-900',
  3: 'bg-gradient-to-br from-orange-300 to-orange-700 text-orange-950',
}

function RankedCard({ item, listQuery }: { item: RankedManhwa; listQuery: string }) {
  const { data: shelf = [] } = useMediaItems()
  const inVault = shelf.some(
    (i) => (i.source === 'pornhwadb' && i.external_id === item.slug) || (i.title && i.title.toLowerCase() === item.title.toLowerCase())
  )
  const cover = chartCoverUrl(item.coverImage)
  const ratings =
    item.totalRatings === 1 ? '1 rating' : `${(item.totalRatings ?? 0).toLocaleString()} ratings`

  return (
    <Link
      to={`/community-lists/series/${encodeURIComponent(item.slug)}${listQuery}`}
      className="group block text-left lift"
    >
      <div className="poster-shine relative rounded-2xl overflow-hidden ring-1 ring-white/10 group-hover:ring-lantern-400/60 group-hover:shadow-[0_20px_45px_-18px_rgba(249,138,7,.6)] transition-all duration-300 bg-slate-900">
        <span
          className={`absolute top-2 left-2 z-10 min-w-[30px] h-[26px] px-2 grid place-items-center rounded-lg text-[11px] font-extrabold tabular-nums backdrop-blur-sm ${
            RANK_STYLE[item.rank] ?? 'bg-black/70 text-white'
          }`}
        >
          #{item.rank}
        </span>
        <div className="absolute inset-x-0 bottom-0 z-[1] h-1/3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <span className="absolute bottom-2 left-2 z-[2] text-[11px] font-bold text-lantern-200 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
          ★ {formatRatingOutOf5(item.averageRating)}
        </span>
        {inVault && (
          <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-md bg-emerald-950/85 text-[10px] font-bold text-emerald-300 border border-emerald-500/40 backdrop-blur-sm">
            In Vault
          </span>
        )}
        {cover ? (
          <img
            src={cover}
            alt=""
            className="aspect-[3/4] w-full object-cover group-hover:scale-[1.06] transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="aspect-[3/4] grid place-items-center text-3xl text-slate-600">📖</div>
        )}
      </div>
      <h3 className="font-bold text-sm mt-2.5 line-clamp-2 leading-snug text-slate-900 dark:text-white group-hover:text-lantern-500 dark:group-hover:text-lantern-300 transition-colors">
        {item.title}
      </h3>
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

function ExportSetup({ hint }: { hint?: string }) {
  return (
    <div className="glass rounded-2xl p-8 max-w-xl mx-auto text-center mt-8">
      <div className="text-4xl mb-3">📦</div>
      <h2 className="font-bold text-lg">Export file required on the API</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
        Top rated uses your private <code className="px-1 rounded bg-black/10 dark:bg-white/10">pornhwa-export.json</code>{' '}
        on <strong>Render</strong>, not in git. Local dev: copy it to{' '}
        <code className="px-1 rounded bg-black/10 dark:bg-white/10">backend/data/</code> and restart uvicorn.
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
        Production: run <code className="px-1 rounded bg-black/10 dark:bg-white/10">python scripts/upload_pornhwadb_export.py</code>,
        then set <code className="px-1 rounded bg-black/10 dark:bg-white/10">PORNHWADB_STORAGE_BUCKET</code> on Render and redeploy.
      </p>
      {hint ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-4 leading-relaxed">{hint}</p>
      ) : null}
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
  const listQuery = listBackSearchParams(params)

  const status = useQuery({
    queryKey: ['pornhwadb-status'],
    queryFn: pornhwadbStatus,
    enabled: isBackendConfigured(),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.configured === false ? 8_000 : false),
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

  if (status.isError) {
    return (
      <div className="glass rounded-2xl p-8 max-w-lg mx-auto text-center mt-8">
        <p className="text-sm text-slate-500">Could not reach the API. Check VITE_API_URL and CORS on Render.</p>
      </div>
    )
  }

  if (!status.data?.configured) {
    return <ExportSetup hint={status.data?.hint} />
  }

  return (
    <div className="space-y-5">
      <ChartHeader sort={safeSort} />

      <div className="glass rounded-2xl p-2 flex flex-col md:flex-row md:items-center gap-2 sticky top-[4.5rem] z-20">
        <div className="flex shrink-0 p-1 gap-1 rounded-xl bg-slate-900/[0.04] dark:bg-black/25">
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
              className={`px-3 h-8 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                safeSort === id ? 'chip-active' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="hidden md:block w-px h-6 bg-slate-200 dark:bg-white/10" />
        <ChipScroller label="Tags" className="flex-1">
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
          {(tagCounts.data ?? []).map(({ name, count }) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleTag(name)}
              className={`chip !px-2.5 !py-1 !text-[11px] ${selectedTag === name ? 'chip-active' : ''}`}
            >
              {name} <span className="opacity-65 tabular-nums">{count}</span>
            </button>
          ))}
        </ChipScroller>
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
          <div
            key={`${safeSort}-${page}-${selectedTag ?? ''}`}
            className="stagger-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6"
          >
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
  const [, setContentMode] = useContentMode()
  return (
    <div className="glass rounded-2xl p-8 max-w-lg mx-auto text-center mt-8 space-y-3">
      <div className="text-4xl mb-2">🔞</div>
      <h2 className="font-bold text-lg">Creamy mode only</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Top rated manhwa is 18+. Switch to <strong>Creamy</strong> mode to view full series details and rankings.
      </p>
      <button
        type="button"
        onClick={() => setContentMode('creamy')}
        className="btn-glow !py-2.5 !px-6 text-sm mt-3"
      >
        Switch to Creamy Mode
      </button>
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
      <ManhwaSeriesDetail key={slug} slug={decodeURIComponent(slug)} backHref={`/community-lists${listQuery}`} />
    )
  }

  return <ManhwaTopList />
}
