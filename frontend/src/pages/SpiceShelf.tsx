import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useContentMode } from '../hooks/useAdultFilter'
import { useGalleryBlur } from '../hooks/usePanelAccess'
import { isBackendConfigured } from '../lib/api'
import { explicitImageUrl, fetchExplicit, type ExplicitKind, type ExplicitPost } from '../lib/explicitFeed'

const KINDS: { id: ExplicitKind; label: string }[] = [
  { id: 'anime', label: 'Anime' },
  { id: 'manhwa', label: 'Manhwa' },
]

function Gate() {
  const [, setMode] = useContentMode()
  return (
    <div className="glass rounded-3xl p-8 max-w-lg mx-auto text-center mt-10">
      <div className="text-4xl mb-3">🔞</div>
      <h1 className="text-xl font-bold font-display text-slate-900 dark:text-white">18+ pictures</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
        This shelf is adult anime and manhwa stills. Switch to Creamy to open it.
      </p>
      <button type="button" onClick={() => setMode('creamy')} className="btn-glow mt-5 !px-5 !py-2 text-sm">
        Switch to Creamy
      </button>
    </div>
  )
}

function Picture({
  post,
  blur,
  onOpen,
}: {
  post: ExplicitPost
  blur: boolean
  onOpen: (post: ExplicitPost) => void
}) {
  const [src, setSrc] = useState(explicitImageUrl(post.thumb_url))
  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-slate-950 ring-1 ring-rose-200/20 hover:ring-rose-400/70 transition-all duration-300"
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setSrc(explicitImageUrl(post.file_url))}
        className={`w-full h-full object-cover transition duration-500 group-hover:scale-[1.04] ${
          blur ? 'blur-md scale-105 group-hover:blur-0 group-focus-visible:blur-0' : ''
        }`}
      />
      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-rose-600/90 text-[10px] font-bold text-white">
        18+
      </span>
    </button>
  )
}

function Viewer({ post, onClose }: { post: ExplicitPost; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="18+ picture"
      onClick={onClose}
    >
      <div className="flex items-center justify-end gap-2 p-3" onClick={(event) => event.stopPropagation()}>
        <a
          href={post.post_url}
          target="_blank"
          rel="noreferrer"
          className="h-9 px-3 grid place-items-center rounded-lg text-xs font-semibold text-white/80 hover:bg-white/10"
        >
          Source
        </a>
        <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg text-sm font-semibold text-white hover:bg-white/10">
          Close
        </button>
      </div>
      <div className="flex-1 min-h-0 grid place-items-center px-3 pb-6" onClick={(event) => event.stopPropagation()}>
        <img src={explicitImageUrl(post.file_url)} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
      </div>
    </div>
  )
}

function Shelf() {
  const [params, setParams] = useSearchParams()
  const kind: ExplicitKind = params.get('kind') === 'anime' ? 'anime' : 'manhwa'
  const q = params.get('q') || ''
  const [draft, setDraft] = useState(q)
  const [blur, setBlur] = useGalleryBlur()
  const [open, setOpen] = useState<ExplicitPost | null>(null)

  useEffect(() => setDraft(q), [q])

  const feed = useInfiniteQuery({
    queryKey: ['explicit-feed', kind, q],
    queryFn: ({ pageParam }) => fetchExplicit(kind, q, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    retry: false,
  })

  const posts = useMemo(() => feed.data?.pages.flatMap((page) => page.posts) ?? [], [feed.data])
  const note = feed.data?.pages[0]?.message
  const searched = feed.data?.pages[0]?.query

  const setKind = (next: ExplicitKind) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev)
      if (next === 'manhwa') n.delete('kind')
      else n.set('kind', next)
      return n
    })

  const onSearch = (event: FormEvent) => {
    event.preventDefault()
    setParams((prev) => {
      const n = new URLSearchParams(prev)
      const value = draft.trim()
      if (value) n.set('q', value)
      else n.delete('q')
      return n
    })
  }

  return (
    <div className="space-y-5 rounded-3xl bg-gradient-to-b from-rose-950/30 via-transparent to-transparent px-1 py-4 sm:px-2">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold font-display text-slate-900 dark:text-white">
          18+ pictures{' '}
          <span className="text-xs font-semibold align-middle px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">
            Free
          </span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
          Search a series or character and the pictures are for that name. A blank search is just the latest shelf.
          Posts tagged as minors are left out.
        </p>
      </div>

      <div className="glass rounded-2xl p-2 flex flex-col sm:flex-row sm:items-center gap-2 sticky top-[4.5rem] z-20">
        <div className="flex shrink-0 p-1 gap-1 rounded-xl bg-rose-500/10">
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setKind(item.id)}
              className={`px-3 h-8 rounded-lg text-xs font-semibold transition-all duration-300 ${
                kind === item.id ? 'bg-rose-500 text-white' : 'text-rose-700 dark:text-rose-200 hover:bg-rose-500/15'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form onSubmit={onSearch} className="flex-1 flex gap-2 min-w-0">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Any manhwa or character name"
            maxLength={80}
            className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-slate-900/[0.04] dark:bg-black/25 text-sm outline-none ring-1 ring-transparent focus:ring-rose-400/60"
            aria-label="Search pictures by tag"
          />
          <button type="submit" className="h-9 px-3 rounded-xl text-xs font-bold bg-rose-500 text-white">
            Search
          </button>
        </form>
        <button
          type="button"
          onClick={() => setBlur(!blur)}
          className={`chip !px-3 !py-1.5 !text-xs shrink-0 ${blur ? 'chip-active' : ''}`}
        >
          {blur ? '🙈 Blur on' : '👁 Blur'}
        </button>
      </div>

      {searched && !feed.isLoading && !feed.isError && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Pictures for <span className="font-semibold text-slate-800 dark:text-slate-200">{searched}</span>
        </p>
      )}

      {feed.isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="aspect-[3/4] rounded-2xl bg-slate-900/10 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {feed.isError && (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {feed.error instanceof Error ? feed.error.message : 'Could not load pictures'}
          </p>
        </div>
      )}

      {!feed.isLoading && !feed.isError && posts.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {note || 'Nothing matched. Try the series name, or switch between Anime and Manhwa.'}
          </p>
        </div>
      )}

      {posts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {posts.map((post) => (
            <Picture key={`${post.source}-${post.id}`} post={post} blur={blur} onOpen={setOpen} />
          ))}
        </div>
      )}

      {feed.hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            className="h-10 px-5 rounded-xl text-sm font-semibold bg-rose-500 text-white disabled:opacity-60"
          >
            {feed.isFetchingNextPage ? 'Loading…' : 'More pictures'}
          </button>
        </div>
      )}

      {open && <Viewer post={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

export default function SpiceShelf() {
  const [mode] = useContentMode()
  if (!isBackendConfigured()) {
    return (
      <div className="glass rounded-2xl p-8 max-w-lg mx-auto text-center mt-8">
        <p className="text-sm text-slate-500">Set VITE_API_URL to your backend to load 18+ pictures.</p>
      </div>
    )
  }
  if (mode !== 'creamy') return <Gate />
  return <Shelf />
}
