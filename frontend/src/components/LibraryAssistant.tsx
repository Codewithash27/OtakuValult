import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatWidget, type AdapterReply, type ChatAdapter, type ChatMessage } from '../chatbot'
import { useMediaItems } from '../hooks/useMediaItems'
import { AnimeMascot } from './AnimeMascot'
import { useContentMode, useIsAdult } from '../hooks/useAdultFilter'
import { MediaItem, MediaType, STATUS_LABELS, detailHref, type Status } from '../types/media'
import { apiUrl } from '../lib/api'
import { useAddItem } from '../hooks/useMediaMutations'
import { setAdultOverrides } from '../hooks/useAdultFilter'

interface Lookup {
  title: string
  media_type: MediaType
  year?: number | null
  total?: number | null
  rating?: number | null
  external_id: string
  poster_url?: string | null
  shelf_status?: string | null
  source?: 'anilist' | 'pornhwadb'
  url: string | null
}

type AddStep = 'status' | 'progress' | 'rating'
interface AddFlow {
  item: Lookup
  step: AddStep
  asked: boolean
  status?: Status
  progress?: number
}

const STATUS_PATTERNS: [RegExp, Status][] = [
  [/\bplan|later|want to (watch|read)|ptw\b/i, 'plan_to_watch'],
  [/\b(complete|completed|finished|watched|done|read it)\b/i, 'completed'],
  [/\b(watching|reading|ongoing|currently|in progress)\b/i, 'watching'],
  [/\b(hold|paused|pause)\b/i, 'on_hold'],
  [/\b(drop|dropped|quit|stopped)\b/i, 'dropped'],
]
const CANCEL_RE = /^(cancel|stop|never ?mind|nvm|no|don'?t add|skip it)\b/i
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

const TYPE_WORDS: Record<string, MediaType> = {
  anime: 'anime', manga: 'manga', manhwa: 'manhwa', webtoon: 'manhwa', pornhwa: 'manhwa',
}

const pickRandom = <T,>(arr: T[], n: number) => [...arr].sort(() => Math.random() - 0.5).slice(0, n)

const CREATOR_RE =
  /who\s+(build|built|made|created|owns)|who'?s\s+(the\s+)?(creator|developer|author|owner|maker)|(your|the)\s+(creator|developer|maker|owner)|aman\s*hukkerikar|hukkerikar|codewithash|nvidia\s+research|created\s+by\s+nvidia|who\s+(are|r)\s+you\s*[?.!]*$|made\s+(you|this)|built\s+(you|this)|created\s+(you|this)/i
const CREATOR_REPLY =
  "OtakuVault was built by **Aman Hukkerikar** (GitHub: [Codewithash27](https://github.com/Codewithash27)). I'm **Kimetsu**, his in-app buddy — not an NVIDIA chatbot. I just use a model to talk about anime, manga, manhwa, and your shelf."
const isCreatorQuestion = (text: string) => CREATOR_RE.test(text)

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

  const addItem = useAddItem()
  const addItemRef = useRef(addItem.mutateAsync)
  addItemRef.current = addItem.mutateAsync
  const flowRef = useRef<AddFlow | null>(null)
  const lastLookupsRef = useRef<Lookup[]>([])

  const adapter = useMemo<ChatAdapter>(() => {
    const shortTitle = (t: string) => (t.length > 22 ? t.slice(0, 22) + '…' : t)

    const lookupHref = (l: Pick<Lookup, 'external_id' | 'media_type' | 'source'>) => {
      if (l.source === 'pornhwadb') return `/community-lists/series/${encodeURIComponent(l.external_id)}`
      const [prefix, num] = l.external_id.includes(':') ? l.external_id.split(':') : [l.media_type, l.external_id]
      return `/title/${prefix === 'anime' ? 'anime' : 'manga'}/${num}`
    }

    const openItem = (i: MediaItem) => navigate(detailHref(i) ?? `/?item=${encodeURIComponent(i.id)}`)

    const openShelfItem = (i: MediaItem) => ({
      label: `Open ${shortTitle(i.title)}`,
      onClick: () => openItem(i),
    })

    const findOnShelf = (title: string, externalId?: string) => {
      const t = title.trim().toLowerCase()
      return itemsRef.current.find(
        (i) => (externalId && i.external_id === externalId) || i.title.trim().toLowerCase() === t
      )
    }

    const unitOf = (l: Lookup) => (l.media_type === 'anime' ? 'episodes' : 'chapters')

    const statusOptions = (l: Lookup, send?: (t: string) => void) => {
      const anime = l.media_type === 'anime'
      return [anime ? 'Plan to watch' : 'Plan to read', anime ? 'Watching' : 'Reading', 'Completed', 'On hold', 'Dropped'].map(
        (label) => ({ label, onClick: () => send?.(label) })
      )
    }

    const startAddFlow = (l: Lookup, send?: (t: string) => void) => {
      flowRef.current = { item: l, step: 'status', asked: false }
      send?.(`Add ${l.title} to my shelf`)
    }

    const lookupActions = (lookups: Lookup[], send?: (t: string) => void) =>
      lookups.flatMap((l) => {
        const owned = findOnShelf(l.title, l.external_id)
        return [
          owned
            ? openShelfItem(owned)
            : { label: `➕ Add ${shortTitle(l.title)} (${l.media_type})`, onClick: () => startAddFlow(l, send) },
          ...(owned ? [] : [{ label: `📖 ${l.media_type} details`, onClick: () => navigate(lookupHref(l)) }]),
        ]
      })

    const saveFlow = async (f: AddFlow, rating: number | null): Promise<AdapterReply> => {
      flowRef.current = null
      const l = f.item
      try {
        const newId = await addItemRef.current({
          title: l.title,
          media_type: l.media_type,
          poster_url: l.poster_url ?? null,
          year: l.year ?? null,
          status: f.status!,
          rating,
          progress: f.progress ?? 0,
          total: l.total ?? null,
          notes: null,
          source: l.source ?? 'anilist',
          external_id: l.external_id,
        })
        if (l.source === 'pornhwadb') setAdultOverrides([newId], true)
        const progress = l.total ? `${f.progress ?? 0}/${l.total}` : `${f.progress ?? 0} ${unitOf(l)}`
        const extra = [STATUS_LABELS[f.status!], f.status === 'plan_to_watch' ? '' : progress, rating ? `★ ${rating}` : '']
          .filter(Boolean)
          .join(' · ')
        return {
          content: `${pick(['Done!', 'Added!', 'All set!', 'Saved!'])} **${l.title}** is on your shelf — ${extra} ✅`,
          actions: [
            {
              label: `Open ${shortTitle(l.title)}`,
              onClick: () => navigate(lookupHref(l)),
            },
          ],
        }
      } catch (e: any) {
        return { content: `I couldn't save **${l.title}** (${e?.message || 'unknown error'}). Try again from **+ Add item**.` }
      }
    }

    const handleAddFlow = async (text: string, send?: (t: string) => void): Promise<AdapterReply | null> => {
      const f = flowRef.current
      if (!f) return null
      const l = f.item
      const unit = unitOf(l)
      const totalHint = l.total ? ` (out of ${l.total})` : ''

      if (f.step !== 'rating' && CANCEL_RE.test(text.trim())) {
        flowRef.current = null
        return { content: `No problem, I won't add **${l.title}**. What else can I help with?` }
      }

      if (f.step === 'status') {
        const owned = findOnShelf(l.title, l.external_id)
        if (owned) {
          flowRef.current = null
          return {
            content: `**${l.title}** is already on your shelf (${STATUS_LABELS[owned.status]}).`,
            actions: [openShelfItem(owned)],
          }
        }
        if (!f.asked) {
          f.asked = true
          return {
            content: `${pick(['Nice pick!', 'Great choice!', 'Ooh, good one!'])} What's your status for **${l.title}**?`,
            actions: statusOptions(l, send),
          }
        }
        const status = STATUS_PATTERNS.find(([re]) => re.test(text))?.[1]
        if (!status) {
          if (text.length > 30) {
            flowRef.current = null
            return null
          }
          return { content: `Pick a status for **${l.title}** so I can add it:`, actions: statusOptions(l, send) }
        }
        f.status = status
        if (status === 'plan_to_watch') return saveFlow(f, null)
        if (status === 'completed') {
          f.progress = l.total ?? 0
          f.step = 'rating'
          return {
            content: `Finished it! How would you rate **${l.title}** out of 10?`,
            actions: [...[10, 9, 8, 7, 6, 5].map((n) => ({ label: `★ ${n}`, onClick: () => send?.(String(n)) })), { label: 'Skip', onClick: () => send?.('skip rating') }],
          }
        }
        f.step = 'progress'
        const q =
          status === 'watching'
            ? `How many ${unit} have you finished so far${totalHint}?`
            : `Which ${unit === 'episodes' ? 'episode' : 'chapter'} did you stop at${totalHint}?`
        return { content: q }
      }

      if (f.step === 'progress') {
        const n = Number(text.match(/\d+/)?.[0])
        if (!Number.isFinite(n) || n < 0 || (l.total && n > l.total)) {
          return { content: `Just send a number${l.total ? ` between 0 and ${l.total}` : ''} — how many ${unit}?` }
        }
        f.progress = n
        if (l.total && n === l.total && f.status === 'watching') f.status = 'completed'
        return saveFlow(f, null)
      }

      if (/skip|no|later/i.test(text)) return saveFlow(f, null)
      const r = Number(text.match(/\d+/)?.[0])
      if (!Number.isFinite(r) || r < 1 || r > 10) return { content: 'Give me a number from 1 to 10, or say **skip**.' }
      return saveFlow(f, r)
    }

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

      if (isCreatorQuestion(lower)) {
        return { content: CREATOR_REPLY }
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
        content: `I can't reach my AI server right now (it may be waking up — free servers sleep). Try again in a minute; meanwhile I can still **show your stats** or **pick something from your plan-to-watch**.`
      }
    }

    return async (messages: ChatMessage[], { signal, onToken, sendUserMessage }) => {
      const lastMsg = messages[messages.length - 1]?.content || ''
      const currentShelf = itemsRef.current
      const currentMode = contentModeRef.current

      const stream = async (reply: AdapterReply) => {
        for (const w of (reply.content || '').split(/(\s+)/)) {
          if (signal.aborted) break
          onToken(w)
          await new Promise((r) => setTimeout(r, 8))
        }
        return { actions: reply.actions }
      }

      // Typed "add it" / "add <title>" right after a lookup starts the add flow without another API call
      if (!flowRef.current && lastLookupsRef.current.length) {
        const refersToLast =
          /\b(add|have|track|save|put)\b.*\b(it|this|that|one)\b/i.test(lastMsg) ||
          /^\s*(yes|yeah|yep|yup|ok(ay)?|sure|haan|ha)?[\s,!]*(add|save|track)(\s+(it|pls|please|now))?[\s.!]*$/i.test(lastMsg)
        const named = /^\s*add\s+(.+?)(?:\s+(?:to|in|into|on)\s+(?:my\s+)?(?:shelf|list|library))?\s*[.!]*$/i.exec(lastMsg)?.[1]?.toLowerCase()
        const hit = refersToLast
          ? lastLookupsRef.current[0]
          : named
            ? lastLookupsRef.current.find((l) => l.title.toLowerCase().includes(named) || named.includes(l.title.toLowerCase()))
            : undefined
        if (hit) flowRef.current = { item: hit, step: 'status', asked: false }
      }

      const flowReply = await handleAddFlow(lastMsg, sendUserMessage)
      if (flowReply) return stream(flowReply)

      if (isCreatorQuestion(lastMsg)) return stream({ content: CREATOR_REPLY })

      // Prepare shelf snapshot for context
      const shelfPayload = currentShelf.slice(0, 400).map((i) => ({
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

                if (matchedShelfItem && matchedShelfItem.source !== 'pornhwadb') {
                  openItem(matchedShelfItem)
                  return
                }

                const targetSlug =
                  act.slug ||
                  (matchedShelfItem?.source === 'pornhwadb' && matchedShelfItem.external_id ? matchedShelfItem.external_id : null) ||
                  (act.type === 'catalogue' ? act.itemId : null) ||
                  (matchedShelfItem?.title
                    ? matchedShelfItem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                    : act.title
                    ? act.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                    : null)

                if (targetSlug) {
                  navigate(`/community-lists/series/${encodeURIComponent(targetSlug)}`)
                }
              },
            }
          }
        )

        const lookups: Lookup[] = data.lookups || []
        lastLookupsRef.current = lookups

        const target = lookups[0]
        if (data.addRequest && target && !findOnShelf(target.title, target.external_id)) {
          flowRef.current = { item: target, step: 'status', asked: true }
          return {
            actions: [...statusOptions(target, sendUserMessage), { label: '📖 Details', onClick: () => navigate(lookupHref(target)) }],
          }
        }

        const seenLabels = new Set<string>()
        const merged = [...lookupActions(lookups, sendUserMessage), ...actions].filter((a) => {
          const k = a.label.toLowerCase()
          if (seenLabels.has(k)) return false
          seenLabels.add(k)
          return true
        })
        return { actions: merged }
      } catch (err: any) {
        // Fallback gracefully to local adapter rules if backend is unreachable or offline
        if (signal.aborted) return

        const status = Number(/API returned (\d+)/.exec(err?.message || '')?.[1]) || 0
        const fallback: AdapterReply =
          status === 503
            ? { content: "My AI brain isn't connected on the server yet (the NVIDIA API key is missing), so I can only do basic shelf stuff right now. Try **Show my stats** or **What should I watch next?**" }
            : status
              ? { content: `The AI server hit an error (${status}). Give it a moment and try again.` }
              : runLocalFallback(lastMsg)
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
      theme={{ accent: '#f98a07', accent2: '#07c4a8', mode: 'auto' }}
      className="vault-bot"
    />
  )
}
