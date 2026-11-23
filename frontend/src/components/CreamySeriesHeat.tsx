import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useGalleryBlur } from '../hooks/usePanelAccess'
import { isBackendConfigured } from '../lib/api'
import { explicitImageUrl, fetchExplicit, type ExplicitPost } from '../lib/explicitFeed'
import { useContentMode } from '../hooks/useAdultFilter'
import { isYouthTagged } from '../lib/manhwaHeat'
import {
  fetchPornhwadbExportImages,
  fetchSeriesActs,
  proxiedPornhwaCover,
  searchPornhwadb,
  type ActBeat,
  type InfidelityMark,
  type PornhwaSeries,
} from '../lib/pornhwadb'
import { Section } from './TitleDetailParts'

type Props = {
  slug: string
  title: string
  tags: string[]
}

const MINOR_TITLE = /kindergarten|elementary|toddler|underage|preteen|\bloli\b|\bshota\b|\bchild\b|\bchildren\b/i

const MARK_LABEL: Record<InfidelityMark, string> = {
  ntr: 'NTR',
  cuckold: 'Cuckold',
  swap: 'Swap',
  cheating: 'Cheating',
}

function foldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function pickSeries(hits: PornhwaSeries[], names: string[]): PornhwaSeries | null {
  const keys = new Set(names.map(foldName).filter(Boolean))
  return (
    hits.find(
      (hit) => keys.has(foldName(hit.title)) || hit.alternativeTitles.some((title) => keys.has(foldName(title))),
    ) ?? null
  )
}

function chapterOf(url: string): number | null {
  const match = url.match(/\/(?:chapters|uploads)\/\d+\/(\d+)\//i)
  if (!match) return null
  const chapter = Number(match[1])
  return Number.isFinite(chapter) ? chapter : null
}

function inBeat(beat: ActBeat, chapter: number | null): boolean {
  if (chapter == null) return false
  const end = beat.end ?? beat.start
  return chapter >= Math.min(beat.start, end) && chapter <= Math.max(beat.start, end)
}

function marksFor(beats: ActBeat[], chapter: number | null): InfidelityMark[] {
  const found: InfidelityMark[] = []
  for (const beat of beats) {
    if (!inBeat(beat, chapter)) continue
    for (const mark of beat.marks ?? []) {
      if (!found.includes(mark)) found.push(mark)
    }
  }
  return found
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
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" role="dialog" aria-modal="true" aria-label="Chapter panel" onClick={onClose}>
      <div className="flex justify-end p-3">
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

function MarkPills({ marks, line }: { marks: InfidelityMark[]; line?: string }) {
  const tied = /mom's friend|\bson\b|married to someone else|not his wife/i.test(line || '')
  if (!marks.length) {
    if (tied) return null
    return (
      <span className="mt-1 inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-white/10 text-slate-300">
        Clean
      </span>
    )
  }
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {marks.map((mark) => (
        <span
          key={mark}
          className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide text-amber-950 bg-gradient-to-r from-amber-200 via-rose-300 to-amber-400"
          style={{ animation: 'cuckold-spark 1.4s ease-in-out infinite' }}
        >
          ✦ {MARK_LABEL[mark]}
        </span>
      ))}
    </span>
  )
}

function Panel({
  post,
  blur,
  marks,
  onOpen,
}: {
  post: ExplicitPost
  blur: boolean
  marks: InfidelityMark[]
  onOpen: (post: ExplicitPost) => void
}) {
  const [src, setSrc] = useState(explicitImageUrl(post.thumb_url))
  const chapter = chapterOf(post.file_url)
  return (
    <button type="button" onClick={() => onOpen(post)} className="w-[132px] shrink-0 text-left">
      <span className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-slate-950 ring-1 ring-rose-400/25">
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setSrc(explicitImageUrl(post.file_url))}
          className={`h-full w-full object-cover ${blur ? 'blur-md scale-105 hover:blur-0 focus-visible:blur-0' : ''}`}
        />
        {chapter != null && (
          <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-bold text-white">
            Ch {chapter}
          </span>
        )}
        {marks.length > 0 && (
          <span className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
            {marks.map((mark) => (
              <span
                key={mark}
                className="px-1 py-0.5 rounded text-[9px] font-extrabold text-amber-950 bg-gradient-to-r from-amber-200 via-rose-300 to-amber-400"
                style={{ animation: 'cuckold-spark 1.4s ease-in-out infinite' }}
              >
                ✦ {MARK_LABEL[mark]}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  )
}

export function CreamySeriesHeat({ slug, title, tags }: Props) {
  const [blur] = useGalleryBlur()
  const [picked, setPicked] = useState<number | null>(null)
  const [focus, setFocus] = useState('all')
  const [open, setOpen] = useState<ExplicitPost | null>(null)
  const youth = isYouthTagged(tags) || MINOR_TITLE.test(title)
  const ready = isBackendConfigured() && !youth

  const acts = useQuery({
    queryKey: ['series-acts', 'who8', slug],
    queryFn: () => fetchSeriesActs(slug),
    enabled: ready,
    staleTime: 30 * 60 * 1000,
  })

  const blocked = acts.data?.blocked === true
  const reel = useQuery({
    queryKey: ['series-reel', title],
    queryFn: () => fetchExplicit('manhwa', title, 1),
    enabled: ready && !blocked && title.trim().length > 1,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const beats = blocked ? [] : (acts.data?.beats ?? [])
  const focusChoices = useMemo(() => {
    const found: { id: string; label: string }[] = []
    const seen = new Set<string>()
    const add = (id: string, label: string) => {
      if (seen.has(id)) return
      seen.add(id)
      found.push({ id, label })
    }
    for (const beat of beats) {
      for (const mark of beat.marks ?? []) add(mark, MARK_LABEL[mark])
      for (const act of beat.acts) {
        const key = act.toLowerCase()
        if (['gangbang', 'milf', 'threesome', 'creampie', 'blowjob', 'bondage', 'mmf'].includes(key)) add(key, act)
      }
    }
    return found
  }, [beats])
  const shownBeats = beats.filter((beat) => {
    if (focus === 'all') return true
    if ((beat.marks ?? []).includes(focus as InfidelityMark)) return true
    return beat.acts.some((act) => act.toLowerCase() === focus)
  })
  const posts = blocked ? [] : (reel.data?.posts ?? [])
  const beat = picked != null ? shownBeats[picked] : undefined
  const shown = useMemo(() => (beat ? posts.filter((post) => inBeat(beat, chapterOf(post.file_url))) : posts), [beat, posts])
  const panels = shown.length > 0 ? shown : focus === 'all' ? posts : []

  if (!ready) return null
  if (acts.isLoading && reel.isLoading) {
    return <div className="h-40 rounded-2xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
  }
  if (!beats.length && !posts.length) return null

  return (
    <div className="space-y-6">
      {beats.length > 0 && (
        <Section title="Where it happens">
          {focusChoices.length > 0 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => {
                  setFocus('all')
                  setPicked(null)
                }}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                  focus === 'all' ? 'bg-rose-500 text-white ring-rose-300' : 'text-rose-700 ring-rose-400/30 dark:text-rose-100'
                }`}
              >
                All chapters
              </button>
              {focusChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => {
                    setFocus(choice.id)
                    setPicked(null)
                  }}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                    focus === choice.id
                      ? 'bg-amber-300 text-amber-950 ring-amber-200'
                      : 'text-rose-700 ring-rose-400/30 dark:text-rose-100'
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {shownBeats.map((item, index) => {
              const on = picked === index
              return (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  onClick={() => setPicked(on ? null : index)}
                  className={`w-[240px] shrink-0 rounded-xl px-3 py-2 text-left ring-1 transition ${
                    (item.marks ?? []).length
                      ? on
                        ? 'bg-rose-950 text-white ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,.35)]'
                        : 'bg-rose-950/80 text-rose-50 ring-amber-400/70'
                      : on
                        ? 'bg-rose-500 text-white ring-rose-400'
                        : 'bg-rose-500/10 text-rose-800 dark:text-rose-100 ring-rose-400/20'
                  }`}
                >
                  <span className="block text-[11px] font-bold">{item.label}</span>
                  <MarkPills marks={item.marks ?? []} line={item.line} />
                  {item.acts.length > 0 && (
                    <span className={`mt-1 block text-xs leading-snug ${on ? 'text-white' : 'text-rose-700 dark:text-rose-200'}`}>
                      {item.acts.join(' · ')}
                    </span>
                  )}
                  {item.line && (
                    <span className={`mt-1 block text-[11px] line-clamp-6 leading-snug ${on ? 'text-white/90' : 'text-rose-100/90'}`}>
                      {item.line}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {!reel.isLoading && !reel.isFetching && posts.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">No chapter panels turned up for this name yet.</p>
          )}
        </Section>
      )}

      {posts.length > 0 && (
        <Section title="The reel">
          {beat && shown.length === 0 && (
            <p className="text-xs text-slate-500 mb-2">No panel saved for {beat.label}. Showing the rest of this series.</p>
          )}
          <div className="flex gap-3 overflow-x-auto pb-1">
            {panels.map((post) => (
              <Panel
                key={`${post.source}-${post.id}`}
                post={post}
                blur={blur}
                marks={marksFor(beats, chapterOf(post.file_url))}
                onOpen={setOpen}
              />
            ))}
          </div>
          <Link to={`/stats?q=${encodeURIComponent(title)}`} className="mt-3 inline-block text-xs font-semibold text-rose-500 hover:underline">
            More pictures of {title}
          </Link>
        </Section>
      )}

      {open && <Viewer post={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function StoryFaces({ slug }: { slug: string }) {
  const faces = useQuery({
    queryKey: ['pornhwadb-portraits', slug],
    queryFn: () => fetchPornhwadbExportImages(slug),
    enabled: isBackendConfigured(),
    staleTime: 30 * 60 * 1000,
  })
  const people = (faces.data?.items ?? []).filter((item) => item.kind === 'character').slice(0, 16)
  if (!people.length) return null
  return (
    <Section title="Faces in this story">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {people.map((person) => (
          <figure key={person.id} className="w-[118px] shrink-0">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-slate-900 ring-1 ring-rose-400/20">
              <img src={proxiedPornhwaCover(person.url)} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <figcaption className="mt-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2">
              {person.label}
            </figcaption>
            {person.caption && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">{person.caption}</p>
            )}
          </figure>
        ))}
      </div>
    </Section>
  )
}

/** Catalogue match for a vault or AniList manhwa, then the same chapter map. */
export function VaultManhwaHeat({
  title,
  slug,
  extraTitles = [],
}: {
  title: string
  slug?: string | null
  extraTitles?: string[]
}) {
  const [mode] = useContentMode()
  const names = [title, ...extraTitles].map((name) => name.trim()).filter(Boolean)
  const knownSlug = slug?.trim() || ''
  const lookup = useQuery({
    queryKey: ['pornhwa-match', names],
    queryFn: async () => {
      for (const name of names.slice(0, 3)) {
        const hits = await searchPornhwadb(name)
        const hit = pickSeries(hits, names)
        if (hit) return hit
      }
      return null
    },
    enabled: mode === 'creamy' && !knownSlug && names.length > 0 && isBackendConfigured(),
    staleTime: 30 * 60 * 1000,
  })

  if (mode !== 'creamy') return null
  const resolved = knownSlug || lookup.data?.slug
  if (!resolved) return null
  return (
    <>
      <CreamySeriesHeat slug={resolved} title={lookup.data?.title || title} tags={lookup.data?.tags ?? []} />
      <StoryFaces slug={resolved} />
    </>
  )
}
