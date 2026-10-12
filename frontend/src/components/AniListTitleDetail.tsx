import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { anilist } from '../lib/importers'
import { cleanMediaDescription } from '../lib/mediaDescription'
import { useMediaItems } from '../hooks/useMediaItems'
import { useAddItem } from '../hooks/useMediaMutations'
import { STATUS_LABELS, anilistId, type MediaType } from '../types/media'
import { useToast } from './Toast'
import { WatchLinks } from './WatchLinks'
import { MetaPill } from './ManhwaSeriesDetail'

type Kind = 'anime' | 'manga'

interface MediaNode {
  id: number
  type: 'ANIME' | 'MANGA'
  format: string | null
  title: { english: string | null; romaji: string | null }
  coverImage: { extraLarge: string | null; large: string | null }
}

interface AniListMedia extends MediaNode {
  title: { english: string | null; romaji: string | null; native: string | null }
  synonyms: string[]
  bannerImage: string | null
  status: string | null
  episodes: number | null
  chapters: number | null
  duration: number | null
  seasonYear: number | null
  startDate: { year: number | null }
  averageScore: number | null
  popularity: number | null
  countryOfOrigin: string | null
  isAdult: boolean
  genres: string[]
  tags: { name: string; rank: number; isMediaSpoiler: boolean }[]
  description: string | null
  siteUrl: string
  studios: { nodes: { name: string }[] }
  relations: { edges: { relationType: string; node: MediaNode }[] }
  recommendations: { nodes: { mediaRecommendation: MediaNode | null }[] }
}

const NODE = 'id type format title { english romaji } coverImage { extraLarge large }'
const QUERY = `query ($id: Int) { Media(id: $id) {
  ${NODE.replace('title { english romaji }', 'title { english romaji native }')}
  synonyms bannerImage status episodes chapters duration seasonYear startDate { year }
  averageScore popularity countryOfOrigin isAdult genres
  tags { name rank isMediaSpoiler }
  description(asHtml: false) siteUrl
  studios(isMain: true) { nodes { name } }
  relations { edges { relationType node { ${NODE} } } }
  recommendations(sort: RATING_DESC, perPage: 6) { nodes { mediaRecommendation { ${NODE} } } }
} }`

const nice = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : ''
const nodeTitle = (n: MediaNode) => n.title.english || n.title.romaji || 'Untitled'
const nodeHref = (n: MediaNode) => `/title/${n.type === 'ANIME' ? 'anime' : 'manga'}/${n.id}`

function MiniCard({ node, badge }: { node: MediaNode; badge?: string }) {
  return (
    <Link to={nodeHref(node)} className="group block w-[110px] shrink-0">
      <div className="rounded-xl overflow-hidden ring-1 ring-black/10 dark:ring-white/10 aspect-[2/3] bg-slate-800">
        {node.coverImage.large && (
          <img src={node.coverImage.large} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        )}
      </div>
      {badge && <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-500">{badge}</p>}
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">{nodeTitle(node)}</p>
    </Link>
  )
}

export function AniListTitleDetail({ kind, id }: { kind: Kind; id: number }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: shelf = [] } = useMediaItems()
  const addItem = useAddItem()
  const [addedId, setAddedId] = useState<string | null>(null)
  const [synopsisOpen, setSynopsisOpen] = useState(false)

  const media = useQuery({
    queryKey: ['anilist-media', id],
    queryFn: async () => (await anilist<{ Media: AniListMedia | null }>(QUERY, { id })).Media,
    staleTime: 24 * 60 * 60 * 1000,
  })

  const m = media.data
  const title = m ? m.title.english || m.title.romaji || 'Untitled' : ''

  const shelfItem = useMemo(() => {
    if (!m) return null
    const names = [m.title.english, m.title.romaji, ...m.synonyms].filter(Boolean).map((t) => t!.toLowerCase())
    return shelf.find((i) => anilistId(i) === id || names.includes(i.title.toLowerCase())) ?? null
  }, [shelf, m, id])

  const onShelf = shelfItem?.id ?? addedId

  if (media.isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 grid place-items-center">
        <div className="w-48 aspect-[3/4] rounded-2xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
      </div>
    )
  }

  if (media.error || !m) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-rose-500 text-sm">{(media.error as Error)?.message ?? 'Title not found'}</p>
        <button type="button" onClick={() => navigate(-1)} className="text-violet-500 text-sm font-semibold hover:underline">
          ← Back
        </button>
      </div>
    )
  }

  const mediaType: MediaType = kind === 'anime' ? 'anime' : m.countryOfOrigin === 'KR' ? 'manhwa' : 'manga'
  const unit = kind === 'anime' ? 'ep' : 'ch'
  const total = kind === 'anime' ? m.episodes : m.chapters
  const year = m.seasonYear ?? m.startDate.year
  const synopsis = cleanMediaDescription(m.description) || ''
  const longSynopsis = synopsis.length > 420
  const tags = [...m.genres, ...m.tags.filter((t) => !t.isMediaSpoiler && t.rank >= 70).map((t) => t.name)].slice(0, 10)
  const relations = m.relations.edges.filter((e) => ['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'ADAPTATION', 'SOURCE', 'ALTERNATIVE'].includes(e.relationType)).slice(0, 8)
  const recs = m.recommendations.nodes.map((n) => n.mediaRecommendation).filter((n): n is MediaNode => !!n)

  const add = async () => {
    try {
      const newId = await addItem.mutateAsync({
        title,
        media_type: mediaType,
        poster_url: m.coverImage.extraLarge || m.coverImage.large,
        year: year ?? null,
        status: 'plan_to_watch',
        rating: null,
        progress: 0,
        total: total ?? null,
        notes: null,
        source: 'anilist',
        external_id: `${kind}:${id}`,
      })
      setAddedId(newId)
      showToast(`Added to your ${mediaType} list`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not add', 'error')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-up pb-8">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-violet-500 font-semibold hover:underline inline-flex items-center gap-1">
        ← Back
      </button>

      <article className="glass-strong rounded-3xl overflow-hidden">
        {m.bannerImage && <img src={m.bannerImage} alt="" className="w-full h-32 sm:h-44 object-cover opacity-80" />}
        <div className="p-5 sm:p-8">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
            <div className={`w-[200px] sm:w-[220px] mx-auto md:mx-0 shrink-0 ${m.bannerImage ? 'md:-mt-24' : ''}`}>
              <div className="relative rounded-2xl overflow-hidden ring-1 ring-black/10 dark:ring-white/15 shadow-2xl shadow-violet-950/20">
                <img src={m.coverImage.extraLarge || m.coverImage.large || ''} alt="" className="w-full aspect-[2/3] object-cover bg-slate-900" />
                {onShelf && (
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-950/85 text-emerald-300 border border-emerald-500/40 backdrop-blur-md shadow-lg flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    In Vault
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full space-y-4">
              <header>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-400">
                    {mediaType} · {nice(m.format)}{m.isAdult ? ' · 18+' : ''}
                  </p>
                  {shelfItem && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      In Vault · {STATUS_LABELS[shelfItem.status]}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold font-display leading-tight text-slate-900 dark:text-white">{title}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  {[m.title.romaji !== title ? m.title.romaji : null, m.title.native].filter(Boolean).join(' · ')}
                </p>
              </header>

              <div className="flex flex-wrap gap-2">
                {shelfItem && (
                  <MetaPill>
                    <span className="text-emerald-500 font-semibold mr-1">Your Vault:</span>
                    {STATUS_LABELS[shelfItem.status]} ({shelfItem.progress}
                    {total ? `/${total}` : ''} {unit}){shelfItem.rating ? ` · ${shelfItem.rating}/10★` : ''}
                  </MetaPill>
                )}
                {m.averageScore != null && <MetaPill>★ {(m.averageScore / 10).toFixed(1)} / 10</MetaPill>}
                {m.popularity != null && <MetaPill>{m.popularity.toLocaleString()} members</MetaPill>}
                {total != null && <MetaPill>{total} {unit}{m.duration ? ` · ${m.duration} min` : ''}</MetaPill>}
                {year != null && <MetaPill>{year}</MetaPill>}
                {m.status && <MetaPill>{nice(m.status)}</MetaPill>}
                {m.studios.nodes[0] && <MetaPill>{m.studios.nodes[0].name}</MetaPill>}
              </div>

              {tags.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span key={tag} className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/12 text-violet-700 dark:text-violet-200 border border-violet-500/25">
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
                    onClick={() => navigate(`/${mediaType}?item=${onShelf}`)}
                    className="btn-glow !py-2.5 !px-6 text-sm inline-flex items-center gap-1.5"
                  >
                    <span>Open in my list</span>
                    <span className="text-xs opacity-75 font-normal">(Edit progress)</span>
                  </button>
                ) : (
                  <button type="button" disabled={addItem.isPending} onClick={add} className="btn-glow !py-2.5 !px-6 text-sm disabled:opacity-50">
                    {addItem.isPending ? 'Adding…' : '+ Add to my list'}
                  </button>
                )}
                <a href={m.siteUrl} target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 rounded-xl text-sm font-semibold text-violet-500 border border-violet-500/30 hover:bg-violet-500/10">
                  AniList ↗
                </a>
              </div>
            </div>
          </div>

          {synopsis && (
            <section className="mt-8 pt-6 border-t border-slate-200/80 dark:border-white/10">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Synopsis</h2>
              <p className={`text-sm text-slate-600 dark:text-slate-300 leading-relaxed ${!synopsisOpen && longSynopsis ? 'line-clamp-5' : ''}`}>
                {synopsis}
              </p>
              {longSynopsis && (
                <button type="button" onClick={() => setSynopsisOpen((o) => !o)} className="mt-2 text-xs font-semibold text-violet-500 hover:underline">
                  {synopsisOpen ? 'Show less' : 'Read more'}
                </button>
              )}
            </section>
          )}

          {shelfItem && (
            <section className="mt-6">
              <WatchLinks item={shelfItem} />
            </section>
          )}

          {relations.length > 0 && (
            <section className="mt-8 pt-6 border-t border-slate-200/80 dark:border-white/10">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Related</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {relations.map((e) => (
                  <MiniCard key={`${e.relationType}-${e.node.id}`} node={e.node} badge={nice(e.relationType)} />
                ))}
              </div>
            </section>
          )}

          {recs.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">If you like this</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {recs.map((n) => (
                  <MiniCard key={n.id} node={n} />
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </div>
  )
}
