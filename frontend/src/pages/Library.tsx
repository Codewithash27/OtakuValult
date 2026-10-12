import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMediaItems } from '../hooks/useMediaItems'
import { MediaItem, MediaType, Status, STATUS_LABELS, detailHref } from '../types/media'
import { MediaCard } from '../components/MediaCard'
import { MediaRow } from '../components/MediaRow'
import type { SortOption } from '../components/SortSelect'
import { VaultHeader, type VaultView } from '../components/VaultHeader'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { Skeleton } from '../components/Skeleton'
import { AddItemModal } from '../components/AddItemModal'
import { ItemDrawer } from '../components/ItemDrawer'
import { PosterWall } from '../components/PosterWall'
import { PremiereMode } from '../components/PremiereMode'
import { SpotlightReel } from '../components/SpotlightReel'
import { LibraryIntro, introWanted, useSplashDone } from '../components/LibraryIntro'
import { PANIC_EVENT } from '../components/ModeEffects'
import { ThemeFilter, ThemeRows } from '../components/ThemeBrowser'
import { useContentMode, useIsAdult, useItemMeta } from '../hooks/useAdultFilter'
import { THEMES, hasTheme } from '../lib/themes'

const PAGE_SIZE = 60

const HERO_KANJI: Partial<Record<MediaType | 'all', string>> = {
  all: '宝',
  anime: 'アニメ',
  manga: '漫画',
  manhwa: '만화',
}

const HERO: Record<MediaType | 'all', { title: string; blurb: string }> = {
  all: { title: 'Vault', blurb: 'Your shelf, in one place.' },
  anime: { title: 'Anime', blurb: 'Everything you watch, from airing seasons to all-time classics.' },
  manga: { title: 'Manga', blurb: 'Your reading shelf, chapter by chapter.' },
  manhwa: { title: 'Manhwa', blurb: 'After Dark — adult manhwa, sorted by the themes you like.' },
  movie: { title: 'Vault', blurb: '' },
  tv: { title: 'Vault', blurb: '' },
}

const splitParam = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

export default function Library({ fixedType }: { fixedType?: MediaType }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('view') === 'list' ? 'list' : 'grid'))
  const [themesOpen, setThemesOpen] = useState(false)
  const [premiere, setPremiere] = useState<{ startId?: string } | null>(null)
  const [intro, setIntro] = useState(() => !fixedType && introWanted())
  const splashDone = useSplashDone()

  useEffect(() => {
    const onPanic = () => {
      setPremiere(null)
      setIntro(false)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('wall')
        next.delete('item')
        return next
      })
    }
    window.addEventListener(PANIC_EVENT, onPanic)
    return () => window.removeEventListener(PANIC_EVENT, onPanic)
  }, [setSearchParams])
  const [sort, setSort] = useState<SortOption>('recent')
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: allItems = [], isLoading, error, refetch } = useMediaItems()
  const [contentMode, setContentMode] = useContentMode()
  const isAdult = useIsAdult(allItems)
  const metaOf = useItemMeta(allItems)
  const tagsOf = useCallback((i: MediaItem) => metaOf(i)?.t, [metaOf])
  const [byTheme, setByTheme] = useState(false)
  const items = useMemo(() => {
    if (fixedType) {
      const typed = allItems.filter((i) => i.media_type === fixedType)
      return contentMode === 'clean' ? typed.filter((i) => !isAdult(i)) : typed
    }
    return contentMode === 'clean'
      ? allItems.filter((i) => i.media_type === 'anime')
      : allItems.filter((i) => i.media_type === 'manhwa')
  }, [allItems, contentMode, isAdult, fixedType])
  const hiddenCount = allItems.filter((i) =>
    contentMode === 'clean' ? i.media_type === 'manhwa' : i.media_type === 'anime'
  ).length

  useEffect(() => {
    const handleOpenAddModal = () => setShowAddModal(true)
    window.addEventListener('openAddModal', handleOpenAddModal)
    return () => window.removeEventListener('openAddModal', handleOpenAddModal)
  }, [])

  // Parse URL params
  const mediaType = fixedType ?? (contentMode === 'clean' ? 'anime' : 'manhwa')
  const manhwaShelf = mediaType === 'manhwa'
  const selectedThemes = splitParam(searchParams.get('themes'))
  const selectedTags = splitParam(searchParams.get('tags'))
  const themesKey = searchParams.get('themes') || ''
  const tagsKey = searchParams.get('tags') || ''
  const status = (searchParams.get('status') as Status | null) || 'all'
  const searchQ = searchParams.get('q') || ''
  const itemId = searchParams.get('item')
  const showWall = searchParams.has('wall')

  const setShowWall = (on: boolean) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (on) next.set('wall', '1')
      else next.delete('wall')
      return next
    })

  const selectedItem = allItems.find((i) => i.id === itemId) || null

  const typeItems = items

  const pendingTags = useMemo(
    () => (manhwaShelf ? typeItems.filter((i) => i.source === 'anilist' && !tagsOf(i)).length : 0),
    [manhwaShelf, typeItems, tagsOf]
  )

  const themeRail = useMemo(
    () =>
      THEMES.map((theme) => ({
        id: theme.id,
        label: theme.label,
        count: typeItems.filter((i) => hasTheme(tagsOf(i), theme)).length,
      }))
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count),
    [typeItems, tagsOf]
  )

  // Filter items
  const filtered = useMemo(() => {
    let result = typeItems

    for (const theme of THEMES.filter((t) => themesKey.split(',').includes(t.id))) {
      result = result.filter((i) => hasTheme(tagsOf(i), theme))
    }
    for (const tag of tagsKey.split(',').filter(Boolean)) {
      result = result.filter((i) => tagsOf(i)?.includes(tag))
    }

    if (status !== 'all') {
      result = result.filter((i) => i.status === status)
    }

    if (searchQ) {
      const q = searchQ.toLowerCase()
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.notes?.toLowerCase().includes(q)
      )
    }

    return result
  }, [typeItems, themesKey, tagsKey, tagsOf, status, searchQ])

  // Sort items
  const sorted = useMemo(() => {
    const copy = [...filtered]
    if (sort === 'title-asc') {
      copy.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sort === 'rating-desc') {
      copy.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    }
    return copy
  }, [filtered, sort])

  const [limit, setLimit] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => setLimit(PAGE_SIZE), [mediaType, status, searchQ, sort, contentMode, themesKey, tagsKey])
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || limit >= sorted.length) return
    const observer = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && setLimit((l) => l + PAGE_SIZE),
      { rootMargin: '800px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [limit, sorted.length])
  const shown = sorted.slice(0, limit)

  // Count by status
  const counts = useMemo(() => {
    const result: Record<Status | 'all', number> = {
      all: typeItems.length,
      watching: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
      plan_to_watch: 0,
    }
    typeItems.forEach((i) => {
      result[i.status]++
    })
    return result
  }, [typeItems])

  const toggleListParam = (name: 'themes' | 'tags', value: string) => {
    setByTheme(false)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const list = splitParam(next.get(name))
      const updated = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
      if (updated.length) next.set(name, updated.join(','))
      else next.delete(name)
      return next
    })
  }

  const openItem = (item: MediaItem) => {
    const href = detailHref(item)
    if (href) {
      navigate(href, { state: { from: window.location.pathname } })
      return
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('item', item.id)
      return next
    })
  }

  const handleStatusChange = (newStatus: Status | 'all') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (newStatus === 'all') {
        next.delete('status')
      } else {
        next.set('status', newStatus)
      }
      return next
    })
  }

  const handleMediaTypeChange = (newType: MediaType | 'all') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (newType === 'all') {
        next.delete('type')
      } else {
        next.set('type', newType)
      }
      return next
    })
  }

  const handleClearFilters = () => {
    setSearchParams('')
  }

  const setParam = (name: string, value: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(name, value)
        else next.delete(name)
        return next
      },
      { replace: true }
    )

  const handleSearch = (q: string) => setParam('q', q || null)

  const handleView = (v: VaultView) => {
    if (v === 'themes') {
      if (!manhwaShelf) return
      setByTheme(true)
      return
    }
    setByTheme(false)
    setView(v)
    localStorage.setItem('view', v)
  }

  const pills = [
    ...(status !== 'all'
      ? [{ key: 'status', label: STATUS_LABELS[status as Status], onRemove: () => handleStatusChange('all') }]
      : []),
    ...(searchQ ? [{ key: 'q', label: `“${searchQ}”`, onRemove: () => handleSearch('') }] : []),
    ...selectedThemes.map((id) => ({
      key: `t-${id}`,
      label: THEMES.find((t) => t.id === id)?.label ?? id,
      onRemove: () => toggleListParam('themes', id),
    })),
    ...selectedTags.map((name) => ({ key: `g-${name}`, label: `#${name}`, onRemove: () => toggleListParam('tags', name) })),
  ]

  if (isLoading) {
    return <Skeleton count={8} view={view} />
  }

  return (
    <>
      <div className="max-w-7xl mx-auto">
        {error && <ErrorBanner error={error as Error} onRetry={() => refetch()} />}

        <VaultHeader
          mediaType={mediaType}
          fixedType={fixedType}
          title={HERO[mediaType].title}
          blurb={HERO[mediaType].blurb}
          kanji={HERO_KANJI[mediaType] ?? '宝'}
          counts={counts}
          resultCount={sorted.length}
          search={searchQ}
          onSearch={handleSearch}
          status={status as Status | 'all'}
          onStatus={handleStatusChange}
          onMediaType={handleMediaTypeChange}
          sort={sort}
          onSort={setSort}
          view={byTheme && manhwaShelf ? 'themes' : view}
          onView={handleView}
          contentMode={contentMode}
          onContentMode={setContentMode}
          hiddenCount={hiddenCount}
          themesOpen={themesOpen}
          onToggleThemes={() => setThemesOpen((o) => !o)}
          themeCount={selectedThemes.length + selectedTags.length}
          showThemes={manhwaShelf}
          themeRail={themeRail}
          selectedThemes={selectedThemes}
          onToggleTheme={(id) => toggleListParam('themes', id)}
          pills={pills}
          onClearAll={handleClearFilters}
          onCinema={() => setShowWall(true)}
          cinemaDisabled={!sorted.length}
          onPickShelf={openItem}
        >
          {manhwaShelf && themesOpen && typeItems.length > 0 && (
            <ThemeFilter
              items={typeItems}
              tagsOf={tagsOf}
              selectedThemes={selectedThemes}
              selectedTags={selectedTags}
              onToggleTheme={(id) => toggleListParam('themes', id)}
              onToggleTag={(name) => toggleListParam('tags', name)}
              pending={pendingTags}
            />
          )}
        </VaultHeader>

        {!pills.length && !byTheme && (
          <SpotlightReel
            items={typeItems}
            tagsOf={tagsOf}
            onOpen={openItem}
            onPremiere={(item) => setPremiere({ startId: item.id })}
            afterDark={contentMode === 'creamy'}
          />
        )}

        {/* Items */}
        {byTheme && manhwaShelf && !themesKey && !tagsKey ? (
          <ThemeRows
            items={filtered}
            tagsOf={tagsOf}
            onOpen={openItem}
            onSeeAll={(id) => toggleListParam('themes', id)}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            title={
              items.length === 0 ? 'Your shelf is empty' : 'No results found'
            }
            description={
              items.length === 0
                ? 'Start adding items to your library'
                : 'Try adjusting your filters'
            }
            onAddClick={items.length === 0 ? () => setShowAddModal(true) : undefined}
          />
        ) : view === 'grid' ? (
          <div key={`${mediaType}-${status}-${sort}`} className="stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {shown.map((item, i) => (
              <div key={item.id} style={{ animationDelay: `${Math.min(i % PAGE_SIZE, 15) * 45}ms` }}>
                <MediaCard item={item} />
              </div>
            ))}
          </div>
        ) : (
          <div key={`${mediaType}-${status}-${sort}`} className="stagger space-y-4">
            {shown.map((item, i) => (
              <div key={item.id} style={{ animationDelay: `${Math.min(i % PAGE_SIZE, 15) * 40}ms` }}>
                <MediaRow item={item} />
              </div>
            ))}
          </div>
        )}
        {!(byTheme && manhwaShelf && !themesKey && !tagsKey) && shown.length < sorted.length && (
          <div ref={sentinelRef} className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Showing {shown.length} of {sorted.length}…
          </div>
        )}
        {allItems.length === 0 && (
          <div className="-mt-10 pb-12 text-center">
            <Link to="/import" className="text-sm font-semibold text-violet-500 hover:underline">
              or import your list from AniList / MyAnimeList →
            </Link>
          </div>
        )}
      </div>

      {/* Floating action button (mobile) */}
      <button
        onClick={() => setShowAddModal(true)}
        className="lg:hidden fixed bottom-28 right-5 w-14 h-14 btn-glow !rounded-full !p-0 text-2xl animate-float"
        aria-label="Add item"
      >
        +
      </button>

      {/* Modals */}
      <AddItemModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
      {showWall &&
        createPortal(
          <PosterWall items={sorted} onClose={() => setShowWall(false)} onPremiere={() => setPremiere({ startId: undefined })} />,
          document.body
        )}
      {intro && splashDone && (
        <LibraryIntro items={allItems} mode={contentMode} isAdult={isAdult} onDone={() => setIntro(false)} />
      )}
      {premiere && (
        <PremiereMode
          items={sorted}
          startId={premiere.startId}
          tagsOf={tagsOf}
          onClose={() => setPremiere(null)}
          onOpen={(item) => {
            setPremiere(null)
            setShowWall(false)
            openItem(item)
          }}
        />
      )}
      <ItemDrawer item={selectedItem} />
    </>
  )
}
