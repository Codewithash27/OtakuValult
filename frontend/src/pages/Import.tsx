import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import { useMediaItems } from '../hooks/useMediaItems'
import { useToast } from '../components/Toast'
import { PosterImage } from '../components/PosterImage'
import { StatusBadge } from '../components/StatusBadge'
import { ImportEntry, fetchAniListUser, importMalFiles } from '../lib/importers'
import { MediaItem } from '../types/media'

type Source = 'anilist' | 'mal'
type Mode = 'skip' | 'update'
type Phase = 'pick' | 'loading' | 'preview' | 'saving' | 'done'

interface Row extends ImportEntry {
  key: string
  existing: MediaItem | null
  titleMatch: boolean
}

const BATCH = 100

export default function Import() {
  const { user } = useSession()
  const { data: shelf = [] } = useMediaItems()
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const [source, setSource] = useState<Source>('anilist')
  const [username, setUsername] = useState('')
  const [kinds, setKinds] = useState({ ANIME: true, MANGA: true })
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)

  const [phase, setPhase] = useState<Phase>('pick')
  const [error, setError] = useState<string | null>(null)
  const [loadingText, setLoadingText] = useState('')
  const [entries, setEntries] = useState<ImportEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>('skip')
  const [saved, setSaved] = useState(0)
  const [result, setResult] = useState({ added: 0, updated: 0, skipped: 0 })

  const rows: Row[] = useMemo(() => {
    const byKey = new Map(shelf.map((i) => [`${i.source}:${i.external_id}`, i]))
    const byTitle = new Set(shelf.map((i) => `${i.media_type}:${i.title.toLowerCase()}`))
    return entries.map((e) => {
      const key = `${e.source}:${e.external_id}`
      const existing = byKey.get(key) || null
      return { ...e, key, existing, titleMatch: !existing && byTitle.has(`${e.media_type}:${e.title.toLowerCase()}`) }
    })
  }, [entries, shelf])

  const isNew = (r: Row) => !r.existing && !r.titleMatch
  const importable = (r: Row) => isNew(r) || (mode === 'update' && !!r.existing)
  const chosen = rows.filter((r) => selected.has(r.key) && importable(r))

  const counts = useMemo(
    () => ({
      total: rows.length,
      fresh: rows.filter(isNew).length,
      onShelf: rows.filter((r) => !isNew(r)).length,
      anime: rows.filter((r) => r.media_type === 'anime').length,
      reading: rows.filter((r) => r.media_type !== 'anime').length,
    }),
    [rows]
  )

  const showPreview = (list: ImportEntry[]) => {
    if (!list.length) throw new Error('That list is empty. Nothing to import.')
    setEntries(list)
    setSelected(new Set(list.map((e) => `${e.source}:${e.external_id}`)))
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
      } else {
        setLoadingText('Reading your MAL export…')
        showPreview(
          await importMalFiles(files, (done, total) =>
            setLoadingText(`Matching titles with AniList for posters… ${done}/${total}`)
          )
        )
      }
    } catch (e) {
      setError((e as Error).message)
      setPhase('pick')
    }
  }

  const runImport = async () => {
    if (!user || !chosen.length) return
    setPhase('saving')
    setSaved(0)
    setError(null)
    let added = 0
    let updated = 0
    try {
      for (let i = 0; i < chosen.length; i += BATCH) {
        const batch = chosen.slice(i, i + BATCH)
        const payload = batch.map(({ key: _key, existing, titleMatch: _t, ...e }) => ({
          ...e,
          notes: e.notes ?? existing?.notes ?? null,
          user_id: user.id,
        }))
        const { error } = await supabase
          .from('media_items')
          .upsert(payload, { onConflict: 'user_id,source,external_id', ignoreDuplicates: mode === 'skip' })
        if (error) throw error
        batch.forEach((r) => (r.existing ? updated++ : added++))
        setSaved(i + batch.length)
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

  const addFiles = (list: FileList | null) => {
    if (!list) return
    setFiles([...list].filter((f) => /\.xml(\.gz)?$/i.test(f.name) || f.type.includes('xml') || f.type.includes('gzip')))
  }

  const canFetch = source === 'anilist' ? username.trim().length > 1 && (kinds.ANIME || kinds.MANGA) : files.length > 0

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
            Pull your whole AniList or MyAnimeList history into the Vault with posters, scores, status and progress.
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
          <div className="flex gap-1 p-1 rounded-xl bg-slate-900/[0.04] dark:bg-black/20 w-fit">
            {(['anilist', 'mal'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                disabled={phase === 'loading'}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  source === s ? 'chip-active !scale-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {s === 'anilist' ? 'AniList' : 'MyAnimeList'}
              </button>
            ))}
          </div>

          {source === 'anilist' ? (
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
          ) : (
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

          <button onClick={fetchList} disabled={!canFetch || phase === 'loading'} className="btn-glow">
            {phase === 'loading' ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                {loadingText}
              </>
            ) : (
              'Preview import →'
            )}
          </button>
        </section>
      )}

      {(phase === 'preview' || phase === 'saving') && (
        <section className="glass rounded-3xl p-4 lg:p-6 space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Found', value: counts.total, color: 'from-violet-500 to-fuchsia-500' },
              { label: 'New', value: counts.fresh, color: 'from-emerald-400 to-teal-500' },
              { label: 'On shelf', value: counts.onShelf, color: 'from-amber-400 to-orange-500' },
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
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {counts.anime} anime · {counts.reading} manga/manhwa
            </span>
            <label className="ml-auto flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={mode === 'update'}
                onChange={(e) => setMode(e.target.checked ? 'update' : 'skip')}
                disabled={phase === 'saving'}
                className="w-4 h-4 accent-violet-600"
              />
              Update titles already on my shelf
            </label>
          </div>

          <div className="max-h-[52vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
            {rows.map((r) => {
              const can = importable(r)
              return (
                <label
                  key={r.key}
                  className={`flex items-center gap-3 p-2.5 transition-colors ${
                    can ? 'cursor-pointer hover:bg-violet-500/5' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={can && selected.has(r.key)}
                    disabled={!can || phase === 'saving'}
                    onChange={() => toggle(r.key)}
                    className="w-4 h-4 accent-violet-600 shrink-0"
                  />
                  <PosterImage src={r.poster_url} alt={r.title} mediaType={r.media_type} className="w-9 h-12 rounded-md shrink-0 text-base" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{r.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {r.media_type}
                      {r.year ? ` · ${r.year}` : ''}
                      {r.total ? ` · ${r.progress}/${r.total}` : r.progress ? ` · ${r.progress}` : ''}
                      {r.rating ? ` · ★ ${r.rating}` : ''}
                    </p>
                  </div>
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
                </label>
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
