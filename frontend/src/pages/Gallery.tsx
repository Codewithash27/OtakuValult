import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMediaItems } from '../hooks/useMediaItems'
import { useDeletePanels, usePanels, useUpdatePanels } from '../hooks/usePanels'
import { useGalleryBlur, usePanelAccess } from '../hooks/usePanelAccess'
import { useItemMeta } from '../hooks/useAdultFilter'
import { ORIENTATIONS, PANEL_KINDS, Panel, orientationOf } from '../types/panel'
import { THEMES, hasTheme } from '../lib/themes'
import { PanelGrid } from '../components/PanelGrid'
import { PanelViewer } from '../components/PanelViewer'
import { PanelUploadDialog } from '../components/PanelUploadDialog'
import { TitlePicker } from '../components/TitlePicker'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useToast } from '../components/Toast'

const STARTER_TAGS = ['favorite', 'wallpaper', 'reaction', 'cover', 'funny']
const splitParam = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

export default function Gallery() {
  const [params, setParams] = useSearchParams()
  const { showToast } = useToast()
  const { data: allPanels = [], isLoading, error } = usePanels()
  const { data: items = [] } = useMediaItems()
  const { visible, hiddenCount, isAdultPanel, isAdultItem, itemsById, contentMode } = usePanelAccess(allPanels, items)
  const metaOf = useItemMeta(items)
  const [blur, setBlur] = useGalleryBlur()
  const update = useUpdatePanels()
  const remove = useDeletePanels()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadTab, setUploadTab] = useState<'files' | 'find'>('files')
  const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>()
  const [dragging, setDragging] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [linkTarget, setLinkTarget] = useState<string | null>(null)
  const [showLinker, setShowLinker] = useState(false)

  const titleId = params.get('title')
  const kind = params.get('kind')
  const orient = params.get('orient')
  const themes = splitParam(params.get('themes'))
  const tags = splitParam(params.get('tags'))
  const sort = params.get('sort') === 'old' ? 'old' : 'new'
  const openId = params.get('panel')
  const wantFind = params.get('find') === '1'
  const phdbSlug = params.get('phdb')
  const findAnilistId = useMemo(() => {
    const raw = params.get('al')
    if (!raw) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [params])

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      }),
    [setParams],
  )
  const toggleList = (key: string, list: string[], value: string) =>
    setParam(key, (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]).join(',') || null)

  const shelfItems = useMemo(
    () => (contentMode === 'clean' ? items.filter((i) => !isAdultItem(i)) : items),
    [items, contentMode, isAdultItem],
  )

  const titleTags = useCallback(
    (p: Panel) => {
      const item = p.media_item_id ? itemsById.get(p.media_item_id) : undefined
      return item ? metaOf(item)?.t : undefined
    },
    [itemsById, metaOf],
  )

  // Base set for counts: everything except the filter being counted, so chips show what you'd get.
  const byTitle = useMemo(() => (titleId ? visible.filter((p) => p.media_item_id === titleId) : visible), [visible, titleId])
  const filtered = useMemo(() => {
    let r = byTitle
    if (kind) r = r.filter((p) => p.kind === kind)
    if (orient) r = r.filter((p) => orientationOf(p) === orient)
    for (const t of THEMES.filter((t) => themes.includes(t.id))) r = r.filter((p) => hasTheme(titleTags(p), t))
    for (const tag of tags) r = r.filter((p) => p.tags.includes(tag))
    return sort === 'old' ? [...r].reverse() : r
  }, [byTitle, kind, orient, themes.join(), tags.join(), sort, titleTags])

  const titleCounts = useMemo(() => {
    const m = new Map<string, number>()
    visible.forEach((p) => p.media_item_id && m.set(p.media_item_id, (m.get(p.media_item_id) ?? 0) + 1))
    return m
  }, [visible])

  const kindCounts = useMemo(() => {
    const m = new Map<string, number>()
    byTitle.forEach((p) => m.set(p.kind, (m.get(p.kind) ?? 0) + 1))
    return m
  }, [byTitle])

  const themeCounts = useMemo(
    () => THEMES.map((t) => ({ theme: t, count: byTitle.filter((p) => hasTheme(titleTags(p), t)).length })).filter((x) => x.count > 0),
    [byTitle, titleTags],
  )

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>()
    visible.forEach((p) => p.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [visible])

  const tagSuggestions = useMemo(
    () => [...new Set([...tagCounts.map(([t]) => t), ...STARTER_TAGS])],
    [tagCounts],
  )

  const filtering = !!(titleId || kind || orient || themes.length || tags.length)
  const clearFilters = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      ;['title', 'kind', 'orient', 'themes', 'tags'].forEach((k) => next.delete(k))
      return next
    })

  const openUpload = (files?: File[], tab: 'files' | 'find' = 'files') => {
    setDroppedFiles(files)
    setUploadTab(tab)
    setUploadOpen(true)
  }

  useEffect(() => {
    if (!wantFind || uploadOpen) return
    if (!titleId && !phdbSlug && findAnilistId == null) return
    openUpload(undefined, 'find')
    setParam('find', null)
  }, [wantFind, titleId, phdbSlug, findAnilistId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (uploadOpen || openId) return
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (files.length) openUpload(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [uploadOpen, openId])

  const toggleSelect = (p: Panel) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(p.id)) next.delete(p.id)
      else next.add(p.id)
      return next
    })

  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Set())
    setShowLinker(false)
  }

  const bulkUpdate = (data: Parameters<typeof update.mutate>[0]['data'], message: string) =>
    update.mutate(
      { ids: [...selected], data },
      {
        onSuccess: () => {
          showToast(message, 'success')
          exitSelect()
        },
        onError: (e) => showToast(e instanceof Error ? e.message : 'Update failed', 'error'),
      },
    )

  const bulkDelete = () =>
    remove.mutate(
      allPanels.filter((p) => selected.has(p.id)),
      {
        onSuccess: () => {
          showToast(`Deleted ${selected.size} image${selected.size === 1 ? '' : 's'}`, 'success')
          setConfirmBulkDelete(false)
          exitSelect()
        },
        onError: (e) => showToast(e instanceof Error ? e.message : 'Delete failed', 'error'),
      },
    )

  const selectedTitle = titleId ? itemsById.get(titleId) : undefined
  const missingTable = error && /panels|relation|schema cache/i.test((error as Error).message)

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
        if (files.length) openUpload(files)
      }}
    >
      {dragging && (
        <div className="fixed inset-0 z-[45] grid place-items-center bg-violet-950/70 backdrop-blur-sm pointer-events-none">
          <div className="rounded-3xl border-2 border-dashed border-violet-400 px-10 py-8 text-center text-white">
            <div className="text-4xl mb-2">🖼️</div>
            <p className="font-bold">Drop to add to your gallery</p>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl px-4 py-3 mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <span className="text-2xl">🖼️</span>
          <div>
            <h1 className="text-xl font-bold leading-tight">Gallery</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {visible.length} image{visible.length === 1 ? '' : 's'} · private to you
              {hiddenCount > 0 && ` · ${hiddenCount} hidden (Clean mode)`}
            </p>
          </div>
        </div>
        {contentMode === 'creamy' && (
          <button
            onClick={() => setBlur(!blur)}
            className={`chip !px-3 !py-1.5 !text-xs ${blur ? 'chip-active' : ''}`}
            title="Blur 18+ images until opened"
          >
            {blur ? '🙈 Blur 18+ on' : '👁 Blur 18+'}
          </button>
        )}
        {visible.length > 0 && (
          <button
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            className={`chip !px-3 !py-1.5 !text-xs ${selecting ? 'chip-active' : ''}`}
          >
            {selecting ? 'Done' : '☑ Select'}
          </button>
        )}
        <button onClick={() => openUpload(undefined, 'find')} className="chip !px-3 !py-1.5 !text-xs">
          🔍 Find images
        </button>
        {contentMode === 'creamy' && titleId && selectedTitle && (
          <button
            onClick={() => openUpload(undefined, 'find')}
            className="chip !px-3 !py-1.5 !text-xs border-rose-500/30 text-rose-600 dark:text-rose-300"
            title={`Search explicit / panel images for ${selectedTitle.title}`}
          >
            🔞 Find for “{selectedTitle.title.length > 18 ? `${selectedTitle.title.slice(0, 16)}…` : selectedTitle.title}”
          </button>
        )}
        <button onClick={() => openUpload()} className="btn-glow !py-1.5 text-sm">
          ⬆ Upload
        </button>
      </div>

      {visible.length > 0 && (
        <div className="glass rounded-2xl p-3 mb-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <TitlePicker
              items={shelfItems.filter((i) => titleCounts.has(i.id))}
              value={titleId}
              onChange={(id) => setParam('title', id)}
              counts={titleCounts}
              placeholder="All titles"
              className="w-full sm:w-64"
            />
            <div className="flex gap-1.5 overflow-x-auto">
              <button onClick={() => setParam('kind', null)} className={`chip !px-3 !py-1 !text-xs ${!kind ? 'chip-active' : ''}`}>
                All {byTitle.length}
              </button>
              {PANEL_KINDS.filter((k) => kindCounts.get(k.id)).map((k) => (
                <button
                  key={k.id}
                  onClick={() => setParam('kind', kind === k.id ? null : k.id)}
                  className={`chip !px-3 !py-1 !text-xs ${kind === k.id ? 'chip-active' : ''}`}
                >
                  {k.plural} {kindCounts.get(k.id)}
                </button>
              ))}
            </div>
            <select
              value={orient ?? ''}
              onChange={(e) => setParam('orient', e.target.value || null)}
              className="input-premium !w-auto !py-1 !px-2 text-xs"
              aria-label="Orientation"
            >
              <option value="">Any shape</option>
              {ORIENTATIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setParam('sort', e.target.value === 'old' ? 'old' : null)}
              className="input-premium !w-auto !py-1 !px-2 text-xs"
              aria-label="Sort"
            >
              <option value="new">Newest uploads</option>
              <option value="old">Oldest uploads</option>
            </select>
            {filtering && (
              <button onClick={clearFilters} className="text-xs font-semibold text-rose-500 hover:underline ml-auto">
                ✕ Clear filters
              </button>
            )}
          </div>

          {(themeCounts.length > 0 || tagCounts.length > 0) && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 items-center">
              {themeCounts.map(({ theme, count }) => (
                <button
                  key={theme.id}
                  onClick={() => toggleList('themes', themes, theme.id)}
                  className={`chip !px-2.5 !py-0.5 !text-[11px] shrink-0 ${themes.includes(theme.id) ? 'chip-active' : ''}`}
                >
                  {theme.label} <span className="opacity-60">{count}</span>
                </button>
              ))}
              {themeCounts.length > 0 && tagCounts.length > 0 && <span className="w-px h-4 bg-slate-300 dark:bg-white/15 shrink-0" />}
              {tagCounts.slice(0, 20).map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => toggleList('tags', tags, tag)}
                  className={`chip !px-2.5 !py-0.5 !text-[11px] shrink-0 ${tags.includes(tag) ? 'chip-active' : ''}`}
                >
                  #{tag} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </div>
          )}

          {filtering && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {filtered.length} of {visible.length}
              {selectedTitle ? ` · ${selectedTitle.title}` : ''}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="mb-3 rounded-xl bg-slate-200 dark:bg-white/[0.04] animate-pulse" style={{ height: 160 + (i % 4) * 60 }} />
          ))}
        </div>
      ) : missingTable ? (
        <div className="glass rounded-2xl p-6 text-center max-w-lg mx-auto">
          <div className="text-4xl mb-2">🛠️</div>
          <h2 className="font-bold text-lg">Gallery needs a one-time setup</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Run <code className="px-1 rounded bg-black/10 dark:bg-white/10">supabase/migrations/20261011000001_panels_gallery.sql</code>{' '}
            and then <code className="px-1 rounded bg-black/10 dark:bg-white/10">20261011000002_panels_official_art.sql</code> in the
            Supabase SQL Editor, then reload.
          </p>
        </div>
      ) : error ? (
        <p className="text-rose-500 text-sm">{(error as Error).message}</p>
      ) : visible.length === 0 ? (
        <div className="space-y-3">
          <button
            onClick={() => openUpload()}
            className="w-full rounded-3xl border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-violet-400 p-12 text-center transition-colors"
          >
            <div className="text-5xl mb-3">🖼️</div>
            <h2 className="text-lg font-bold">Start your gallery</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Drop panels, stickers or edits here, choose files, or paste a screenshot. Link them to titles on your shelf and tag them
              to find them later. Only you can see them.
            </p>
          </button>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Or{' '}
            <button onClick={() => openUpload(undefined, 'find')} className="font-semibold text-violet-500 hover:underline">
              🔍 find official art
            </button>{' '}
            by title or artist name.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-12">No images match these filters.</p>
      ) : (
        <PanelGrid
          panels={filtered}
          itemsById={itemsById}
          isAdultPanel={isAdultPanel}
          blur={blur}
          selecting={selecting}
          selected={selected}
          onOpen={(p) => setParam('panel', p.id)}
          onToggle={toggleSelect}
          resetKey={[titleId, kind, orient, themes.join(), tags.join(), sort].join('|')}
        />
      )}

      {selecting && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-2xl glass-strong rounded-2xl shadow-2xl p-3">
          {showLinker ? (
            <div className="flex items-center gap-2">
              <TitlePicker items={shelfItems} value={linkTarget} onChange={setLinkTarget} placeholder="Link to which title?" className="flex-1" />
              <button
                disabled={!selected.size || update.isPending}
                onClick={() => bulkUpdate({ media_item_id: linkTarget }, `Updated ${selected.size} image${selected.size === 1 ? '' : 's'}`)}
                className="btn-glow !py-2 text-sm"
              >
                {linkTarget ? 'Link' : 'Unlink'}
              </button>
              <button onClick={() => setShowLinker(false)} className="chip !px-3 !py-2 !text-xs">
                Back
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold mr-auto">{selected.size} selected</span>
              <button
                onClick={() => setSelected(new Set(filtered.map((p) => p.id)))}
                className="chip !px-3 !py-1.5 !text-xs"
              >
                All {filtered.length}
              </button>
              <button disabled={!selected.size} onClick={() => setShowLinker(true)} className="chip !px-3 !py-1.5 !text-xs disabled:opacity-40">
                🔗 Title
              </button>
              <button
                disabled={!selected.size}
                onClick={() => bulkUpdate({ adult: true }, 'Marked 18+')}
                className="chip !px-3 !py-1.5 !text-xs disabled:opacity-40"
              >
                18+
              </button>
              <button
                disabled={!selected.size}
                onClick={() => bulkUpdate({ adult: false }, 'Marked not 18+')}
                className="chip !px-3 !py-1.5 !text-xs disabled:opacity-40"
              >
                Not 18+
              </button>
              <button
                disabled={!selected.size}
                onClick={() => setConfirmBulkDelete(true)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-rose-500/40 text-rose-500 hover:bg-rose-500 hover:text-white disabled:opacity-40 transition"
              >
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      )}

      {openId && !isLoading && (
        <PanelViewer
          panels={filtered}
          currentId={openId}
          items={shelfItems}
          itemsById={itemsById}
          isAdultPanel={isAdultPanel}
          tagSuggestions={tagSuggestions}
          onNavigate={(id) => setParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set('panel', id)
            return next
          }, { replace: true })}
          onClose={() => setParam('panel', null)}
        />
      )}

      <PanelUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        items={shelfItems}
        isAdultItem={isAdultItem}
        tagSuggestions={tagSuggestions}
        initialFiles={droppedFiles}
        presetItemId={titleId}
        initialTab={uploadTab}
        initialPornhwadbSlug={phdbSlug}
        initialMediaId={findAnilistId}
      />

      <ConfirmDialog
        title={`Delete ${selected.size} image${selected.size === 1 ? '' : 's'}?`}
        message="They'll be removed from your gallery for good."
        confirmLabel="Delete"
        isDangerous
        isOpen={confirmBulkDelete}
        isLoading={remove.isPending}
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  )
}
