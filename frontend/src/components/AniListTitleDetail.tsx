import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { anilist } from '../lib/importers'
import { cleanMediaDescription } from '../lib/mediaDescription'
import { useMediaItems } from '../hooks/useMediaItems'
import { useAddItem } from '../hooks/useMediaMutations'
import { STATUS_LABELS, anilistId, type MediaType } from '../types/media'
import { useToast } from './Toast'
import { WatchLinks } from './WatchLinks'
import { CoverCard, InfoRow, Section, Stat, scoreTone } from './TitleDetailParts'

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
  volumes: number | null
  duration: number | null
  season: string | null
  seasonYear: number | null
  source: string | null
  startDate: { year: number | null }
  averageScore: number | null
  popularity: number | null
  favourites: number | null
  countryOfOrigin: string | null
  isAdult: boolean
  genres: string[]
  tags: { name: string; rank: number; isMediaSpoiler: boolean }[]
  description: string | null
  siteUrl: string
  coverImage: { extraLarge: string | null; large: string | null; color: string | null }
  studios: { nodes: { name: string }[] }
  relations: { edges: { relationType: string; node: MediaNode }[] }
  recommendations: { nodes: { mediaRecommendation: MediaNode | null }[] }
}

const NODE = 'id type format title { english romaji } coverImage { extraLarge large }'
const QUERY = `query ($id: Int) { Media(id: $id) {
  id type format title { english romaji native } coverImage { extraLarge large color }
  synonyms bannerImage status episodes chapters volumes duration season seasonYear source startDate { year }
  averageScore popularity favourites countryOfOrigin isAdult genres
  tags { name rank isMediaSpoiler }
  description(asHtml: false) siteUrl
  studios(isMain: true) { nodes { name } }
  relations { edges { relationType node { ${NODE} } } }
  recommendations(sort: RATING_DESC, perPage: 8) { nodes { mediaRecommendation { ${NODE} } } }
} }`

const RELATION_TYPES = ['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'ADAPTATION', 'SOURCE', 'ALTERNATIVE']

const nice = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : ''
const nodeTitle = (n: MediaNode) => n.title.english || n.title.romaji || 'Untitled'
const nodeHref = (n: MediaNode) => `/title/${n.type === 'ANIME' ? 'anime' : 'manga'}/${n.id}`
const compact = (n: number) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

function MiniCard({ node, badge }: { node: MediaNode; badge?: string }) {
  return <CoverCard to={nodeHref(node)} image={node.coverImage.large} title={nodeTitle(node)} badge={badge} />
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
      <div className="max-w-6xl mx-auto space-y-6 pb-8">
        <div className="h-[340px] rounded-3xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          <div className="h-48 rounded-2xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
          <div className="h-48 rounded-2xl bg-slate-200/50 dark:bg-white/[0.05] animate-pulse" />
        </div>
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
  const cover = m.coverImage.extraLarge || m.coverImage.large || ''
  const backdrop = m.bannerImage || cover
  const accent = m.coverImage.color || '#8b5cf6'
  const synopsis = cleanMediaDescription(m.description) || ''
  const longSynopsis = synopsis.length > 480
  const tags = m.tags.filter((t) => !t.isMediaSpoiler && t.rank >= 60).slice(0, 12)
  const relations = m.relations.edges.filter((e) => RELATION_TYPES.includes(e.relationType)).slice(0, 10)
  const recs = m.recommendations.nodes.map((n) => n.mediaRecommendation).filter((n): n is MediaNode => !!n)
  const altTitles = [m.title.romaji !== title ? m.title.romaji : null, m.title.native].filter(Boolean).join(' · ')

  const add = async () => {
    try {
      const newId = await addItem.mutateAsync({
        title,
        media_type: mediaType,
        poster_url: cover || null,
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
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up pb-10">
      {/* Hero */}
      <header className="relative rounded-3xl overflow-hidden ring-1 ring-white/10 shadow-2xl shadow-black/30 bg-slate-950">
        {backdrop && (
          <img
            src={backdrop}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover ${m.bannerImage ? 'opacity-60' : 'opacity-40 blur-2xl scale-110'}`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-slate-950/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/40 to-transparent" />

        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 pl-2.5 pr-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-black/40 hover:bg-black/60 border border-white/15 backdrop-blur-md transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
            <path fillRule="evenodd" d="M12.7 4.3a1 1 0 010 1.4L8.4 10l4.3 4.3a1 1 0 01-1.4 1.4l-5-5a1 1 0 010-1.4l5-5a1 1 0 011.4 0z" clipRule="evenodd" />
          </svg>
          Back
        </button>

        <div className="relative flex flex-col sm:flex-row gap-6 sm:gap-7 p-5 sm:p-7 pt-16 sm:pt-14">
          <div className="w-36 sm:w-40 lg:w-44 shrink-0 mx-auto sm:mx-0">
            <div
              className="relative rounded-2xl overflow-hidden ring-2 ring-white/15 shadow-2xl"
              style={{ boxShadow: `0 25px 50px -12px ${accent}66` }}
            >
              <img src={cover} alt={title} className="w-full aspect-[2/3] object-cover bg-slate-900" />
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
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white/90 border border-white/15">
                  {mediaType}
                </span>
                {m.format && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white/90 border border-white/15">
                    {nice(m.format)}
                  </span>
                )}
                {m.isAdult && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/90 text-white">18+</span>
                )}
                {shelfItem && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                    {STATUS_LABELS[shelfItem.status]} · {shelfItem.progress}
                    {total ? `/${total}` : ''} {unit}
                    {shelfItem.rating ? ` · ★${shelfItem.rating}` : ''}
                  </span>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold font-display leading-tight text-white drop-shadow-lg">
                {title}
              </h1>
              {altTitles && <p className="mt-1.5 text-sm text-white/60 truncate">{altTitles}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-3">
              {m.averageScore != null && (
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid place-items-center w-12 h-12 rounded-xl bg-gradient-to-br ${scoreTone(m.averageScore)} text-white text-base font-extrabold shadow-lg`}
                  >
                    {(m.averageScore / 10).toFixed(1)}
                  </span>
                  <Stat label="Score" value="/ 10" />
                </div>
              )}
              {m.popularity != null && <Stat label="Members" value={compact(m.popularity)} />}
              {total != null && <Stat label={kind === 'anime' ? 'Episodes' : 'Chapters'} value={total} />}
              {year != null && <Stat label="Year" value={year} />}
              {m.studios.nodes[0] && <Stat label="Studio" value={m.studios.nodes[0].name} />}
            </div>

            {m.genres.length > 0 && (
              <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
                {m.genres.map((g) => (
                  <span key={g} className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-white border border-white/15 backdrop-blur-sm">
                    {g}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-center sm:justify-start gap-2">
              {onShelf ? (
                <button
                  type="button"
                  onClick={() => navigate(`/${mediaType}?item=${onShelf}`)}
                  className="btn-glow !py-2.5 !px-6 text-sm"
                >
                  ✎ Edit in my list
                </button>
              ) : (
                <button type="button" disabled={addItem.isPending} onClick={add} className="btn-glow !py-2.5 !px-6 text-sm disabled:opacity-50">
                  {addItem.isPending ? 'Adding…' : '+ Add to my list'}
                </button>
              )}
              <a
                href={m.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
              >
                AniList ↗
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {synopsis && (
            <Section title="Synopsis">
              <p
                className={`text-sm text-slate-600 dark:text-slate-300 leading-relaxed ${
                  !synopsisOpen && longSynopsis ? 'line-clamp-6' : ''
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
            </Section>
          )}

          {shelfItem && <WatchLinks item={shelfItem} />}

          {relations.length > 0 && (
            <Section title="Related">
              <div className="flex gap-3 overflow-x-auto pb-1 snap-x">
                {relations.map((e) => (
                  <MiniCard key={`${e.relationType}-${e.node.id}`} node={e.node} badge={nice(e.relationType)} />
                ))}
              </div>
            </Section>
          )}

          {recs.length > 0 && (
            <Section title="If you like this">
              <div className="flex gap-3 overflow-x-auto pb-1 snap-x">
                {recs.map((n) => (
                  <MiniCard key={n.id} node={n} />
                ))}
              </div>
            </Section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-4">
          <Section title="Details">
            <dl>
              <InfoRow label="Format" value={nice(m.format)} />
              <InfoRow label={kind === 'anime' ? 'Episodes' : 'Chapters'} value={total} />
              {kind === 'manga' && <InfoRow label="Volumes" value={m.volumes} />}
              {kind === 'anime' && <InfoRow label="Duration" value={m.duration ? `${m.duration} min` : null} />}
              <InfoRow label="Status" value={nice(m.status)} />
              <InfoRow label="Season" value={m.season ? `${nice(m.season)} ${year ?? ''}` : year} />
              <InfoRow label="Studio" value={m.studios.nodes.map((s) => s.name).join(', ')} />
              <InfoRow label="Source" value={nice(m.source)} />
              <InfoRow label="Score" value={m.averageScore != null ? `${(m.averageScore / 10).toFixed(1)} / 10` : null} />
              <InfoRow label="Members" value={m.popularity?.toLocaleString()} />
              <InfoRow label="Favourites" value={m.favourites?.toLocaleString()} />
            </dl>
          </Section>

          {tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t.name}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/12 text-violet-700 dark:text-violet-200 border border-violet-500/25"
                  >
                    {t.name} <span className="opacity-60">{t.rank}%</span>
                  </span>
                ))}
              </div>
            </Section>
          )}
        </aside>
      </div>
    </div>
  )
}
