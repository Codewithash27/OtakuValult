import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatWidget, type AdapterReply, type ChatAdapter, type ChatMessage } from '../chatbot'
import { useMediaItems } from '../hooks/useMediaItems'
import { AnimeMascot } from './AnimeMascot'
import { useContentMode, useIsAdult } from '../hooks/useAdultFilter'
import { MediaItem, MediaType, STATUS_LABELS } from '../types/media'
import { apiUrl } from '../lib/api'

const TYPE_WORDS: Record<string, MediaType> = {
  anime: 'anime', manga: 'manga', manhwa: 'manhwa', webtoon: 'manhwa', pornhwa: 'manhwa',
}

const pickRandom = <T,>(arr: T[], n: number) => [...arr].sort(() => Math.random() - 0.5).slice(0, n)

const line = (i: MediaItem) =>
  `**${i.title}** · ${i.media_type}${i.rating ? ` · ★ ${i.rating}` : ''}${i.total ? ` · ${i.progress}/${i.total}` : ''}`

export function LibraryAssistant() {
  const { data: allItems = [] } = useMediaItems()
  const navigate = useNavigate()
  const [contentMode] = useContentMode()
  const isAdult = useIsAdult(allItems)

  const items = useMemo(
    () => (contentMode === 'clean' ? allItems.filter((i) => !isAdult(i)) : allItems),
    [allItems, contentMode, isAdult]
  )
  const itemsRef = useRef(items)
  itemsRef.current = items

  const contentModeRef = useRef(contentMode)
  contentModeRef.current = contentMode

  const adapter = useMemo<ChatAdapter>(() => {
    const openShelfItem = (i: MediaItem) => ({
      label: `Open ${i.title.length > 22 ? i.title.slice(0, 22) + '…' : i.title}`,
      onClick: () => {
        const slug =
          i.source === 'pornhwadb' && i.external_id
            ? i.external_id
            : i.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        navigate(`/community-lists/series/${encodeURIComponent(slug)}`)
      },
    })

    const runLocalFallback = (text: string): AdapterReply => {
      const lower = text.toLowerCase()
      const all = itemsRef.current
      const type = Object.entries(TYPE_WORDS).find(([w]) => new RegExp(`\\b${w}\\b`).test(lower))?.[1]
      const pool = type ? all.filter((i) => i.media_type === type) : all
      const label = type ? `${type} ` : ''

      if (!all.length) return { content: 'Your shelf is empty right now. Use **+ Add item** or search to add your first title!' }

      if (/^(hi|hello|hey|yo|sup)\b/.test(lower))
        return { content: `Hey! You've got **${all.length}** titles on your shelf. Ask me what to watch next, your stats, or to find something.` }

      if (/stat|summary|overview|how many|count/.test(lower)) {
        const by = (k: keyof typeof STATUS_LABELS) => pool.filter((i) => i.status === k).length
        const rated = pool.filter((i) => i.rating)
        const avg = rated.length ? (rated.reduce((s, i) => s + (i.rating || 0), 0) / rated.length).toFixed(1) : '–'
        const types = Object.entries(
          pool.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.media_type]: (acc[i.media_type] || 0) + 1 }), {})
        )
          .map(([t, n]) => `${t} ${n}`)
          .join(' · ')
        return {
          content: `#### Your ${label}stats\n- Total: **${pool.length}**\n- Watching: **${by('watching')}** · Completed: **${by('completed')}**\n- Plan to watch: **${by('plan_to_watch')}** · On hold: **${by('on_hold')}** · Dropped: **${by('dropped')}**\n- Average rating: **${avg}**\n- ${types}`
        }
      }

      if (/next|recommend|suggest|what should|bored|pick/.test(lower)) {
        const planned = pool.filter((i) => i.status === 'plan_to_watch')
        const source = planned.length ? planned : pool.filter((i) => i.status === 'on_hold')
        const chosen = pickRandom(source, 3)
        return {
          content: `Here are some ${label}picks from your ${planned.length ? 'plan-to-watch' : 'on-hold'} list:\n${chosen.map((i) => `- ${line(i)}`).join('\n')}`,
          actions: chosen.map(openShelfItem),
        }
      }

      if (/creamy|clean|content mode|radio button/.test(lower)) {
        return {
          content: `### Content Modes in OtakuVault:\n- **Clean Mode (SFW)**: Safe for all ages. Shows mainstream Anime & Manga, and hides all 18+ adult titles and adult gallery art.\n- **Creamy Mode (18+)**: Unlocks the adult catalogue, the **Top Rated (Community Lists)** Pornhwa chart, and adult panels in the Gallery.`
        }
      }

      if (/what is this app|how to use|features|about app|guide|walkthrough/.test(lower)) {
        return {
          content: `### Welcome to OtakuVault!\nI'm **Kimetsu**, your personal otaku companion. Here is what you can do:\n- **📚 Library**: Track what you're watching or reading, record episode/chapter progress, rate titles (1-10★), and keep notes.\n- **⛩️ Categories**: Filter your shelf by Anime, Manga, or Manhwa.\n- **⭐ Top Rated**: Browse the top-100 rated manhwa with scores and tags (in Creamy mode).\n- **🖼️ Gallery**: Save and explore high-res anime art and manga panels.\n- **⬆️ Import**: Sync your watchlists from AniList or JSON exports.\n- **💬 Kimetsu (Ctrl+K)**: Ask me for recommendations, plot synopses, and shelf stats!`
        }
      }

      const query = lower.replace(/^(find|search|do i have|is|show me|where is|open)\s+/, '').replace(/[?!.]+$/, '').trim()
      const matches = query.length >= 2 ? all.filter((i) => i.title.toLowerCase().includes(query)) : []
      if (matches.length) {
        return {
          content: `Found ${matches.length} on your shelf:\n${matches.slice(0, 6).map((i) => `- ${line(i)}`).join('\n')}`,
          actions: matches.slice(0, 3).map(openShelfItem),
        }
      }

      return {
        content: `I can help with your shelf & catalogue knowledge base. Try:\n- "What should I watch next?"\n- "Recommend a drama manhwa with intense plot"\n- "Show my stats"\n- "What am I watching right now?"`
      }
    }

    return async (messages: ChatMessage[], { signal, onToken, sendUserMessage }) => {
      const lastMsg = messages[messages.length - 1]?.content || ''
      const currentShelf = itemsRef.current
      const currentMode = contentModeRef.current

      // Prepare shelf snapshot for context
      const shelfPayload = currentShelf.slice(0, 40).map((i) => ({
        id: i.id,
        title: i.title,
        media_type: i.media_type,
        status: i.status,
        rating: i.rating,
        progress: i.progress,
        total: i.total,
        notes: i.notes,
        source: i.source,
        external_id: i.external_id,
      }))

      try {
        const res = await fetch(apiUrl('/api/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            shelfItems: shelfPayload,
            contentMode: currentMode,
          }),
          signal,
        })

        if (!res.ok) {
          throw new Error(`API returned ${res.status}`)
        }

        const data = await res.json()
        const replyText = data.reply || ''

        // Stream words to UI for natural typing experience
        const words = replyText.split(/(\s+)/)
        for (const w of words) {
          if (signal.aborted) break
          onToken(w)
          await new Promise((r) => setTimeout(r, 8))
        }

        // Build interactive click actions (options that send a message or open a title)
        const actions = (data.actions || []).map(
          (act: { label: string; itemId?: string; slug?: string; title?: string; type?: string; url?: string; actionType?: string }) => {
            return {
              label: act.label,
              onClick: () => {
                if (act.actionType === 'link' && act.url) {
                  window.open(act.url, '_blank', 'noopener,noreferrer')
                  return
                }
                // If this is an option choice button -> send that choice into the conversation
                if (act.actionType === 'message' || (!act.itemId && !act.slug && !act.title)) {
                  // Clean emoji prefixes if needed or send directly
                  const queryText = act.label.replace(/^[\p{Emoji}\s]+/u, '').trim() || act.label
                  if (sendUserMessage) {
                    sendUserMessage(queryText)
                  }
                  return
                }

                // Check if title is on user's shelf
                const matchedShelfItem = currentShelf.find(
                  (i) =>
                    (act.itemId && i.id === act.itemId) ||
                    (act.title && i.title.toLowerCase() === act.title.toLowerCase())
                )

                // Resolve target series slug:
                // Priority: act.slug -> matchedShelfItem's external_id (if pornhwadb) -> act.itemId (if catalogue slug) -> slug from title
                const targetSlug =
                  act.slug ||
                  (matchedShelfItem?.source === 'pornhwadb' && matchedShelfItem.external_id ? matchedShelfItem.external_id : null) ||
                  (act.type === 'catalogue' ? act.itemId : null) ||
                  (matchedShelfItem?.title
                    ? matchedShelfItem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                    : act.title
                    ? act.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                    : null)

                // Always open the rich series details page, never the edit drawer!
                if (targetSlug) {
                  navigate(`/community-lists/series/${encodeURIComponent(targetSlug)}`)
                }
              },
            }
          }
        )

        return { actions }
      } catch (err: any) {
        // Fallback gracefully to local adapter rules if backend is unreachable or offline
        if (signal.aborted) return

        const fallback = runLocalFallback(lastMsg)
        const words = (fallback.content || '').split(/(\s+)/)
        for (const w of words) {
          if (signal.aborted) break
          onToken(w)
          await new Promise((r) => setTimeout(r, 12))
        }
        return { actions: fallback.actions }
      }
    }
  }, [navigate])

  const { welcomeMessage, suggestions } = useMemo(() => {
    const h = new Date().getHours()
    const hello = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
    const watching = items.filter((i) => i.status === 'watching')
    const planned = items.filter((i) => i.status === 'plan_to_watch')
    const fav = [...items].filter((i) => i.rating).sort((a, b) => (b.rating || 0) - (a.rating || 0))[0]
    const current = pickRandom(watching, 1)[0]

    const intro = !items.length
      ? `${hello}! I'm **Kimetsu**. Your shelf is empty — tell me what you enjoy and I'll find your first title.`
      : current
        ? `${hello}! Still on **${current.title}**? Ask me anything about it, or what you're in the mood for next.`
        : `${hello}! You've got **${items.length}** titles on your shelf. What are you in the mood for today?`

    const chips = [
      current && `Something like ${current.title}`,
      fav && fav.title !== current?.title && `More like ${fav.title}`,
      planned.length ? 'Pick from my plan-to-watch' : 'Recommend a manhwa',
      items.length ? 'Show my stats' : 'What can this app do?',
      contentMode === 'clean' ? 'Recommend an anime' : 'Top rated manhwa',
    ].filter(Boolean) as string[]

    return { welcomeMessage: intro, suggestions: chips.slice(0, 4) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, contentMode])

  return (
    <ChatWidget
      adapter={adapter}
      title="Kimetsu"
      subtitle="AI Companion · Knows your whole shelf"
      avatar={<AnimeMascot />}
      launcherIcon={<AnimeMascot />}
      welcomeMessage={welcomeMessage}
      suggestions={suggestions}
      placeholder="Ask Kimetsu about your library, plots, recommendations…"
      storageKey="kimetsu-assistant-history"
      theme={{ accent: '#f59e0b', accent2: '#06b6d4', mode: 'auto' }}
      className="vault-bot"
    />
  )
}
