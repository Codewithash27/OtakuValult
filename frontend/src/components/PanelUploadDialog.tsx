import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MediaItem, anilistId } from '../types/media'
import { PANEL_KINDS, PanelKind } from '../types/panel'
import { useUploadPanels } from '../hooks/usePanels'
import { useToast } from './Toast'
import { TitlePicker } from './TitlePicker'
import { TagEditor } from './TagEditor'
import { FindImages } from './FindImages'

const MAX_FILE_BYTES = 25 * 1024 * 1024

type Tab = 'files' | 'find'

interface Props {
  open: boolean
  onClose: () => void
  items: MediaItem[]
  isAdultItem: (item: MediaItem) => boolean
  tagSuggestions: string[]
  initialFiles?: File[]
  presetItemId?: string | null
  initialTab?: Tab
  initialPornhwadbSlug?: string | null
  initialMediaId?: number | null
}

export function PanelUploadDialog({
  open,
  onClose,
  items,
  isAdultItem,
  tagSuggestions,
  initialFiles,
  presetItemId = null,
  initialTab = 'files',
  initialPornhwadbSlug = null,
  initialMediaId = null,
}: Props) {
  const { showToast } = useToast()
  const upload = useUploadPanels()
  const input = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [finding, setFinding] = useState(false)
  const busy = upload.isPending || finding
  const [files, setFiles] = useState<File[]>([])
  const [itemId, setItemId] = useState<string | null>(presetItemId)
  const [kind, setKind] = useState<PanelKind>('panel')
  const [tags, setTags] = useState<string[]>([])
  const [adult, setAdult] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab(initialFiles?.length ? 'files' : initialTab)
    setFinding(false)
    setFiles(initialFiles ?? [])
    setItemId(presetItemId)
    setKind('panel')
    setTags([])
    setProgress(null)
    const preset = presetItemId ? items.find((i) => i.id === presetItemId) : undefined
    setAdult(!!preset && isAdultItem(preset))
    // Only reset when the dialog opens, not on every items refresh.
  }, [open])

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  useEffect(() => {
    if (!open) return
    const onPaste = (e: ClipboardEvent) => {
      const pasted = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (pasted.length) {
        setTab('files')
        addFiles(pasted)
      }
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
    }
  })

  if (!open) return null

  const presetItem = presetItemId ? items.find((i) => i.id === presetItemId) : undefined

  function addFiles(list: File[]) {
    const images = list.filter((f) => f.type.startsWith('image/'))
    const tooBig = images.filter((f) => f.size > MAX_FILE_BYTES)
    if (tooBig.length) showToast(`${tooBig.length} file(s) over 25 MB skipped`, 'error')
    setFiles((prev) => [...prev, ...images.filter((f) => f.size <= MAX_FILE_BYTES)])
  }

  const chooseTitle = (id: string | null) => {
    setItemId(id)
    const item = id ? items.find((i) => i.id === id) : undefined
    if (item) setAdult(isAdultItem(item))
  }

  const start = () => {
    if (!files.length) return
    setProgress({ done: 0, total: files.length })
    upload.mutate(
      { files, mediaItemId: itemId, kind, adult, tags, onProgress: (done, total) => setProgress({ done, total }) },
      {
        onSuccess: ({ uploaded, failed }) => {
          if (failed.length) {
            showToast(`Added ${uploaded}, ${failed.length} failed: ${failed[0]}`, 'error')
          } else {
            showToast(`Added ${uploaded} image${uploaded === 1 ? '' : 's'} to your gallery`, 'success')
          }
          onClose()
        },
        onError: (err) => {
          showToast(err instanceof Error ? err.message : 'Upload failed', 'error')
          setProgress(null)
        },
      },
    )
  }

  const label = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5'

  // Portalled: the title drawer's backdrop-filter would otherwise trap this fixed dialog inside it.
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col glass-strong rounded-3xl shadow-2xl overflow-hidden animate-fade-up">
        <div className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Add to gallery</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Private to your account. Images are shrunk before upload.</p>
            </div>
            <button
              onClick={onClose}
              disabled={busy}
              className="w-9 h-9 grid place-items-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-40"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-1.5 mt-3">
            {(
              [
                ['files', '⬆ My files'],
                ['find', '🔍 Find images'],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                disabled={busy}
                className={`chip !px-3 !py-1 !text-xs ${tab === id ? 'chip-active' : ''}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {tab === 'find' ? (
          <FindImages
            items={items}
            isAdultItem={isAdultItem}
            tagSuggestions={tagSuggestions}
            initialQuery={presetItem?.title ?? ''}
            initialMediaId={initialMediaId ?? (presetItem ? anilistId(presetItem) : null)}
            initialShelfItemId={presetItemId}
            initialPornhwadbSlug={initialPornhwadbSlug}
            onBusyChange={setFinding}
            onDone={onClose}
          />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  addFiles([...e.dataTransfer.files])
                }}
                onClick={() => input.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
                  dragging ? 'border-violet-500 bg-violet-500/10' : 'border-slate-300 dark:border-white/15 hover:border-violet-400'
                }`}
              >
                <div className="text-3xl mb-1">🖼️</div>
                <p className="font-semibold text-sm">Drop images here, tap to choose, or paste (Ctrl+V)</p>
                <p className="text-xs text-slate-500 mt-0.5">JPG, PNG, WebP or GIF · up to 25 MB each</p>
                <input
                  ref={input}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles([...(e.target.files ?? [])])
                    e.target.value = ''
                  }}
                />
              </div>

              {files.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={label + ' !mb-0'}>{files.length} selected</span>
                    {!upload.isPending && (
                      <button onClick={() => setFiles([])} className="text-xs font-semibold text-rose-500 hover:underline">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                    {files.map((_, i) => (
                      <div key={i} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-black/20">
                        <img src={previews[i]} alt="" className="w-full h-full object-cover object-top" />
                        {!upload.isPending && (
                          <button
                            onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-black/70 text-white text-xs"
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={label}>Title</label>
                <TitlePicker items={items} value={itemId} onChange={chooseTitle} placeholder="Link to a title on your shelf (optional)" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={label}>Type</label>
                  <div className="flex gap-1.5">
                    {PANEL_KINDS.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setKind(k.id)}
                        className={`chip !px-3 !py-1 !text-xs ${kind === k.id ? 'chip-active' : ''}`}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={label}>Content</label>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm h-[30px]">
                    <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="accent-rose-500 w-4 h-4" />
                    <span>Mark as 18+</span>
                  </label>
                </div>
              </div>

              <div>
                <label className={label}>Tags</label>
                <TagEditor value={tags} onChange={setTags} suggestions={tagSuggestions} />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 dark:border-white/10">
              {progress && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span>Uploading…</span>
                    <span>
                      {progress.done} / {progress.total}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <button onClick={start} disabled={!files.length || upload.isPending} className="btn-glow w-full !py-2.5">
                {upload.isPending ? 'Uploading…' : `Upload ${files.length || ''} image${files.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
