import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import { useMediaItems } from '../hooks/useMediaItems'
import { setAdultOverrides, useContentMode } from '../hooks/useAdultFilter'
import { useToast } from '../components/Toast'
import { PosterImage } from '../components/PosterImage'
import { StatusBadge } from '../components/StatusBadge'
import { ImportEntry, fetchAniListUser, importMalFiles, parsePastedTitles, searchPastedTitles } from '../lib/importers'
import { MediaItem, Status, STATUS_LABELS } from '../types/media'

type Source = 'anilist' | 'mal' | 'paste'
type Mode = 'skip' | 'update'
type Phase = 'pick' | 'loading' | 'preview' | 'saving' | 'done'
type PasteType = 'MANGA' | 'ANIME' | 'BOTH'

interface Row extends ImportEntry {
  existing: MediaItem | null
  titleMatch: boolean
}

const BATCH = 100
const MAX_PASTE = 300

const SOURCES: { id: Source; label: string }[] = [
  { id: 'anilist', label: 'AniList' },
  { id: 'mal', label: 'MyAnimeList' },
  { id: 'paste', label: 'Paste titles' },
]

const AdultBadge = () => (
  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-rose-500 to-pink-600 text-white shrink-0">18+</span>
)

export default function Import() {
  const { user } = useSession()
  const { data: shelf = [] } = useMediaItems()
  const [contentMode] = useContentMode()
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const [source, setSource] = useState<Source>('anilist')
  const [username, setUsername] = useState('')
  const [kinds, setKinds] = useState({ ANIME: true, MANGA: true })
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteType, setPasteType] = useState<PasteType>('MANGA')
  const [pasteStatus, setPasteStatus] = useState<Status>('plan_to_watch')
  const [markMissingAdult, setMarkMissingAdult] = useState(false)

  const [phase, setPhase] = useState<Phase>('pick')
  const [error, setError] = useState<string | null>(null)
  const [loadingText, setLoadingText] = useState('')
  const [entries, setEntries] = useState<ImportEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>('skip')
  const [includeAdult, setIncludeAdult] = useState(contentMode === 'creamy')
  const [hideSameSex, setHideSameSex] = useState(false)
  const [saved, setSaved] = useState(0)
  const [result, setResult] = useState({ added: 0, updated: 0, skipped: 0 })

  const pastedTitles = useMemo(() => parsePastedTitles(pasteText), [pasteText])

  const rows: Row[] = useMemo(() => {
    const byKey = new Map(shelf.filter((i) => i.external_id).map((i) => [`${i.source}:${i.external_id}`, i]))
    const byTitle = new Set(shelf.map((i) => `${i.media_type}:${i.title.toLowerCase()}`))
    return entries.map((e) => {
      const existing = (e.external_id && byKey.get(`${e.source}:${e.external_id}`)) || null
      return { ...e, existing, titleMatch: !existing && byTitle.has(`${e.media_type}:${e.title.toLowerCase()}`) }
    })
  }, [entries, shelf])

  const isNew = (r: Row) => !r.existing && !r.titleMatch
  const importable = (r: Row) =>
    (includeAdult || !r.adult) && !(hideSameSex && r.sameSex) && (isNew(r) || (mode === 'update' && !!r.existing))
  const chosen = rows.filter((r) => selected.has(r.key) && importable(r))

  const counts = {
    total: rows.length,
    fresh: rows.filter(isNew).length,
    onShelf: rows.filter((r) => !isNew(r)).length,
    adult: rows.filter((r) => r.adult).length,
    sameSex: rows.filter((r) => r.sameSex).length,
    missing: rows.filter((r) => r.source === 'manual').length,
    anime: rows.filter((r) => r.media_type === 'anime').length,
    reading: rows.filter((r) => r.media_type !== 'anime').length,
  }

  const showPreview = (list: ImportEntry[]) => {
    if (!list.length) throw new Error('That list is empty. Nothing to import.')
    setEntries(list)
    setSelected(new Set(list.map((e) => e.key)))
    setPhase('preview')
  }

  const fetchList = async () => {
    setError(null)
    setPhase('loading')
    try {
      if (source === 'anilist') {
        const types = (Object.keys(kinds) as ('ANIME' | 'MANGA')[]).filter((k) => kinds[k])
        setLoadingText(`Fetching ${username.trim()}'s list from AniList…`)
        showPreview(await fetchAniListUser(username, types))
      } else if (source === 'mal') {
        setLoadingText('Reading your MAL export…')
        showPreview(
          await importMalFiles(files, (done, total) => setLoadingText(`Matching titles with AniList for posters… ${done}/${total}`))
        )
      } else {
        const titles = pastedTitles.slice(0, MAX_PASTE)
        setLoadingText(`Searching AniList… 0/${titles.length}`)
        showPreview(
          await searchPastedTitles(
            titles,
            { type: pasteType === 'BOTH' ? null : pasteType, status: pasteStatus, markMissingAdult },
            (done, total) => setLoadingText(`Searching AniList… ${done}/${total}`)
          )
        )
      }
    } catch (e) {
      setError((e as Error).message)
      setPhase('pick')
    }
  }

  const toPayload = ({ key: _k, query: _q, alternatives: _a, adult: _ad, existing, titleMatch: _t, ...e }: Row) => ({
    ...e,
    notes: e.notes ?? existing?.notes ?? null,
    user_id: user!.id,
  })

  const runImport = async () => {
    if (!user || !chosen.length) return
    setPhase('saving')
    setSaved(0)
    setError(null)
    let added = 0
    let updated = 0
    const linked = chosen.filter((r) => r.source !== 'manual')
    const manual = chosen.filter((r) => r.source === 'manual')
    try {
      for (let i = 0; i < linked.length; i += BATCH) {
        const batch = linked.slice(i, i + BATCH)
        const { error } = await supabase
          .from('media_items')
          .upsert(batch.map(toPayload), { onConflict: 'user_id,source,external_id', ignoreDuplicates: mode === 'skip' })
        if (error) throw error
        batch.forEach((r) => (r.existing ? updated++ : added++))
        setSaved(added + updated)
      }
      for (let i = 0; i < manual.length; i += BATCH) {
        const batch = manual.slice(i, i + BATCH)
        const { data, error } = await supabase.from('media_items').insert(batch.map(toPayload)).select('id, title')
        if (error) throw error
        const adultTitles = new Set(batch.filter((r) => r.adult).map((r) => r.title))
        setAdultOverrides((data ?? []).filter((d) => adultTitles.has(d.title)).map((d) => d.id), true)
        added += batch.length
        setSaved(added + updated)
      }
      setResult({ added, updated, skipped: rows.length - added - updated })
      setPhase('done')
      showToast(`Imported ${added + updated} titles`, 'success')
    } catch (e) {
      setError(`Saved ${added + updated} before an error: ${(e as Error).message}`)
      setPhase('preview')
    } finally {
      queryClient.invalidateQueries({ queryKey: ['media-items'] })
    }
  }

  const reset = () => {
    setPhase('pick')
    setEntries([])
    setFiles([])
    setError(null)
  }

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleAdult = (key: string) => setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, adult: !e.adult } : e)))

  const pickAlternative = (oldKey: string, newKey: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.key !== oldKey) return e
        const alt = e.alternatives?.find((a) => a.key === newKey)
        return alt ? { ...alt, alternatives: e.alternatives, query: e.query } : e
      })
    )
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.delete(oldKey)) next.add(newKey)
      return next
    })
  }

  const addFiles = (list: FileList | null) => {
    if (!list) return
    setFiles([...list].filter((f) => /\.xml(\.gz)?$/i.test(f.name) || f.type.includes('xml') || f.type.includes('gzip')))
  }

  const canFetch =
    source === 'anilist'
      ? username.trim().length > 1 && (kinds.ANIME || kinds.MANGA)
      : source === 'mal'
        ? files.length > 0
        : pastedTitles.length > 0

  const usedKeys = new Set(entries.map((e) => e.key))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="relative overflow-hidden rounded-3xl glass p-6 lg:p-8 animate-fade-up">
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-600/40 blur-3xl animate-float" />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-500 dark:text-violet-300 mb-2">Bring your history</p>
          <h1 className="text-4xl lg:text-5xl font-bold">
            Import your <span className="text-gradient">list</span>
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 max-w-xl">
            Pull your AniList or MyAnimeList history into the Vault, or paste a list of titles, with posters, scores, status and
            progress.
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl p-4 border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300 text-sm font-medium animate-fade-up">
          {error}
        </div>
      )}

      {(phase === 'pick' || phase === 'loading') && (
        <section className="glass rounded-3xl p-6 space-y-5 animate-fade-up">
          <div className="flex gap-1 p-1 rounded-xl bg-slate-900/[0.04] dark:bg-black/20 w-fit max-w-full overflow-x-auto">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                disabled={phase === 'loading'}
                className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                  source === s.id ? 'chip-active !scale-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {source === 'anilist' && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">AniList username</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canFetch && phase === 'pick' && fetchList()}
                  placeholder="e.g. Josh"
                  className="input-premium mt-1.5"
                  disabled={phase === 'loading'}
                />
              </label>
              <div className="flex gap-2">
                {(['ANIME', 'MANGA'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKinds((p) => ({ ...p, [k]: !p[k] }))}
                    disabled={phase === 'loading'}
                    className={`chip ${kinds[k] ? 'chip-active !scale-100' : ''}`}
                  >
                    {kinds[k] ? '✓ ' : ''}
                    {k === 'ANIME' ? 'Anime' : 'Manga & manhwa'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">No password needed. Your list must be public on AniList.</p>
            </div>
          )}

          {source === 'mal' && (
            <div className="space-y-3">
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  addFiles(e.dataTransfer.files)
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                  dragging
                    ? 'border-violet-500 bg-violet-500/10 scale-[1.01]'
                    : 'border-slate-300 dark:border-white/15 hover:border-violet-400 hover:bg-violet-500/5'
                }`}
              >
                <span className="text-4xl">📦</span>
                <span className="font-semibold">
                  {files.length ? files.map((f) => f.name).join(', ') : 'Drop your MAL export here or click to choose'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">.xml or .xml.gz · anime and manga files can go together</span>
                <input
                  type="file"
                  accept=".xml,.gz,application/xml,text/xml,application/gzip"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                  disabled={phase === 'loading'}
                />
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Get it from{' '}
                <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline">
                  myanimelist.net → Export
                </a>
                . Titles are matched with AniList to get posters.
              </p>
            </div>
          )}

          {source === 'paste' && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">One title per line</span>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  placeholder={'Infidelity 101\nNo, I Want HER!\nSecret Class'}
                  className="input-premium mt-1.5 font-mono text-sm resize-y"
                  disabled={phase === 'loading'}
                />
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  {pastedTitles.length} title{pastedTitles.length === 1 ? '' : 's'}
                  {pastedTitles.length > MAX_PASTE ? ` · only the first ${MAX_PASTE} will be searched` : ''} · bullets and numbering are
                  ignored
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {(['MANGA', 'ANIME', 'BOTH'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPasteType(t)}
                    disabled={phase === 'loading'}
                    className={`chip ${pasteType === t ? 'chip-active !scale-100' : ''}`}
                  >
                    {t === 'MANGA' ? 'Manga & manhwa' : t === 'ANIME' ? 'Anime' : 'Both'}
                  </button>
                ))}
                <select
                  value={pasteStatus}
                  onChange={(e) => setPasteStatus(e.target.value as Status)}
                  disabled={phase === 'loading'}
                  className="h-9 px-3 rounded-xl text-sm font-semibold border border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/[0.04]"
                  aria-label="Status for pasted titles"
                >
                  {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                    <option key={s} value={s}>
                      Add as: {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={markMissingAdult}
                  onChange={(e) => setMarkMissingAdult(e.target.checked)}
                  disabled={phase === 'loading'}
                  className="w-4 h-4 accent-rose-500"
                />
                Mark titles AniList can't find as 18+
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Each line is matched on AniList. Titles it can't find are added with just the name, so you can fill in the rest later.
              </p>
            </div>
          )}

          <button onClick={fetchList} disabled={!canFetch || phase === 'loading'} className="btn-glow">
            {phase === 'loading' ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                {loadingText}
              </>
            ) : source === 'paste' ? (
              'Find titles →'
            ) : (
              'Preview import →'
            )}
          </button>
        </section>
      )}

      {(phase === 'preview' || phase === 'saving') && (
        <section className="glass rounded-3xl p-4 lg:p-6 space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Found', value: counts.total, color: 'from-violet-500 to-fuchsia-500' },
              { label: 'New', value: counts.fresh, color: 'from-emerald-400 to-teal-500' },
              { label: 'On shelf', value: counts.onShelf, color: 'from-amber-400 to-orange-500' },
              { label: '18+', value: counts.adult, color: 'from-rose-500 to-pink-600' },
              { label: 'Selected', value: chosen.length, color: 'from-cyan-400 to-sky-500' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl px-4 py-3 bg-white/60 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
                <div className={`text-3xl font-display font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setSelected(new Set(rows.map((r) => r.key)))} className="chip" disabled={phase === 'saving'}>
              Select all
            </button>
            <button onClick={() => setSelected(new Set())} className="chip" disabled={phase === 'saving'}>
              Select none
            </button>
            {counts.adult > 0 && (
              <button
                onClick={() => {
                  setIncludeAdult(true)
                  setSelected(new Set(rows.filter((r) => r.adult).map((r) => r.key)))
                }}
                className="chip"
                disabled={phase === 'saving'}
              >
                Only 18+
              </button>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {counts.anime} anime · {counts.reading} manga/manhwa
              {counts.missing ? ` · ${counts.missing} not found on AniList` : ''}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAdult}
                onChange={(e) => setIncludeAdult(e.target.checked)}
                disabled={phase === 'saving'}
                className="w-4 h-4 accent-rose-500"
              />
              Include 18+ titles
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={mode === 'update'}
                onChange={(e) => setMode(e.target.checked ? 'update' : 'skip')}
                disabled={phase === 'saving'}
                className="w-4 h-4 accent-violet-600"
              />
              Update titles already on my shelf
            </label>
            {counts.sameSex > 0 && (
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideSameSex}
                  onChange={(e) => setHideSameSex(e.target.checked)}
                  disabled={phase === 'saving'}
                  className="w-4 h-4 accent-violet-600"
                />
                Hide BL & yuri ({counts.sameSex})
              </label>
            )}
          </div>

          <div className="max-h-[52vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
            {rows.map((r) => {
              const can = importable(r)
              const alternatives = r.alternatives ?? []
              return (
                <div
                  key={r.key}
                  className={`flex items-center gap-3 p-2.5 transition-colors ${can ? 'hover:bg-violet-500/5' : 'opacity-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={can && selected.has(r.key)}
                    disabled={!can || phase === 'saving'}
                    onChange={() => toggle(r.key)}
                    className="w-4 h-4 accent-violet-600 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    aria-label={`Import ${r.title}`}
                  />
                  <PosterImage src={r.poster_url} alt={r.title} mediaType={r.media_type} className="w-9 h-12 rounded-md shrink-0 text-base" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {r.adult && <AdultBadge />}
                      {r.sameSex && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-500/15 text-slate-500 shrink-0">BL/Yuri</span>
                      )}
                      <p className="font-semibold truncate">{r.title}</p>
                    </div>
                    {alternatives.length > 1 && phase !== 'saving' ? (
                      <select
                        value={r.key}
                        onChange={(e) => pickAlternative(r.key, e.target.value)}
                        className="mt-0.5 max-w-full text-xs rounded-md px-1.5 py-0.5 border border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300"
                        aria-label={`Other matches for ${r.query}`}
                      >
                        {alternatives.map((a) => (
                          <option key={a.key} value={a.key} disabled={a.key !== r.key && usedKeys.has(a.key)}>
                            {a.adult ? '18+ · ' : ''}
                            {a.title} · {a.media_type}
                            {a.year ? ` · ${a.year}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {r.source === 'manual' ? 'Not found on AniList · added by name' : r.media_type}
                        {r.year ? ` · ${r.year}` : ''}
                        {r.total ? ` · ${r.progress}/${r.total}` : r.progress ? ` · ${r.progress}` : ''}
                        {r.rating ? ` · ★ ${r.rating}` : ''}
                        {r.query && r.query.toLowerCase() !== r.title.toLowerCase() && r.source !== 'manual' ? ` · for "${r.query}"` : ''}
                      </p>
                    )}
                  </div>
                  {r.source === 'manual' && phase !== 'saving' && (
                    <button
                      onClick={() => toggleAdult(r.key)}
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 transition-colors ${
                        r.adult ? 'bg-rose-500/20 text-rose-500' : 'bg-slate-500/10 text-slate-500 hover:text-rose-500'
                      }`}
                    >
                      {r.adult ? '18+ ✓' : 'Mark 18+'}
                    </button>
                  )}
                  {r.existing ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 shrink-0">
                      {mode === 'update' ? 'Will update' : 'On shelf'}
                    </span>
                  ) : r.titleMatch ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-500/15 text-slate-500 shrink-0">
                      Same title
                    </span>
                  ) : null}
                  <span className="hidden sm:inline shrink-0">
                    <StatusBadge status={r.status} size="sm" />
                  </span>
                </div>
              )
            })}
          </div>

          {phase === 'saving' ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span>Saving to your vault…</span>
                <span>
                  {saved}/{chosen.length}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all duration-500"
                  style={{ width: `${chosen.length ? (saved / chosen.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button onClick={runImport} disabled={!chosen.length} className="btn-glow">
                Import {chosen.length} titles
              </button>
              <button onClick={reset} className="px-4 py-2 rounded-xl font-semibold text-slate-500 hover:bg-slate-900/5 dark:hover:bg-white/5">
                ← Back
              </button>
            </div>
          )}
        </section>
      )}

      {phase === 'done' && (
        <section className="glass rounded-3xl p-8 text-center space-y-4 animate-fade-up">
          <p className="text-6xl">🎉</p>
          <h2 className="text-3xl font-bold">
            Your vault just got <span className="text-gradient">bigger</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            {result.added} added · {result.updated} updated · {result.skipped} skipped
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/" className="btn-glow">
              Open my library
            </Link>
            <Link to="/?wall=1" className="px-4 py-2 rounded-xl font-semibold text-violet-500 hover:bg-violet-500/10">
              🎞️ See it in Cinema
            </Link>
            <button onClick={reset} className="px-4 py-2 rounded-xl font-semibold text-slate-500 hover:bg-slate-900/5 dark:hover:bg-white/5">
              Import another
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
