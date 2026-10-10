import { useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChatWidget, createLocalAdapter, type AdapterReply } from '../chatbot'
import { useMediaItems } from '../hooks/useMediaItems'
import { AnimeMascot } from './AnimeMascot'
import { useContentMode, useIsAdult } from '../hooks/useAdultFilter'
import { MediaItem, MediaType, STATUS_LABELS } from '../types/media'

const TYPE_WORDS: Record<string, MediaType> = {
  anime: 'anime', manga: 'manga', manhwa: 'manhwa', webtoon: 'manhwa',
  movie: 'movie', movies: 'movie', film: 'movie', tv: 'tv', show: 'tv', series: 'tv',
}

const pickRandom = <T,>(arr: T[], n: number) => [...arr].sort(() => Math.random() - 0.5).slice(0, n)

const line = (i: MediaItem) =>
  `**${i.title}** · ${i.media_type}${i.rating ? ` · ★ ${i.rating}` : ''}${i.total ? ` · ${i.progress}/${i.total}` : ''}`

export function LibraryAssistant() {
  const { data: allItems = [] } = useMediaItems()
  const [, setSearchParams] = useSearchParams()
  const [contentMode] = useContentMode()
  const isAdult = useIsAdult(allItems)

  const items = useMemo(
    () => (contentMode === 'clean' ? allItems.filter((i) => !isAdult(i)) : allItems),
    [allItems, contentMode, isAdult]
  )
  const itemsRef = useRef(items)
  itemsRef.current = items

  const adapter = useMemo(() => {
    const open = (i: MediaItem) => ({
      label: `Open ${i.title.length > 22 ? i.title.slice(0, 22) + '…' : i.title}`,
      onClick: () =>
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.set('item', i.id)
          return next
        }),
    })

    const listReply = (title: string, list: MediaItem[], empty: string): AdapterReply =>
      list.length
        ? { content: `${title}\n${list.map((i) => `- ${line(i)}`).join('\n')}`, actions: list.slice(0, 3).map(open) }
        : { content: empty }

    return createLocalAdapter((input) => {
      const text = input.toLowerCase()
      const all = itemsRef.current
      const type = Object.entries(TYPE_WORDS).find(([w]) => new RegExp(`\\b${w}\\b`).test(text))?.[1]
      const pool = type ? all.filter((i) => i.media_type === type) : all
      const label = type ? `${type} ` : ''

      if (!all.length) return 'Your shelf is empty right now. Use **+ Add item** or the search bar to add your first title, then ask me again!'

      if (/^(hi|hello|hey|yo|sup)\b/.test(text))
        return `Hey! You've got **${all.length}** titles on your shelf. Ask me what to watch next, your stats, or to find something.`

      if (/stat|summary|overview|how many|count/.test(text)) {
        const by = (k: keyof typeof STATUS_LABELS) => pool.filter((i) => i.status === k).length
        const rated = pool.filter((i) => i.rating)
        const avg = rated.length ? (rated.reduce((s, i) => s + (i.rating || 0), 0) / rated.length).toFixed(1) : '–'
        const types = Object.entries(
          pool.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.media_type]: (acc[i.media_type] || 0) + 1 }), {})
        )
          .map(([t, n]) => `${t} ${n}`)
          .join(' · ')
        return `#### Your ${label}stats\n- Total: **${pool.length}**\n- Watching: **${by('watching')}** · Completed: **${by('completed')}**\n- Plan to watch: **${by('plan_to_watch')}** · On hold: **${by('on_hold')}** · Dropped: **${by('dropped')}**\n- Average rating: **${avg}**\n- ${types}`
      }

      if (/next|recommend|suggest|what should|bored|pick/.test(text)) {
        const planned = pool.filter((i) => i.status === 'plan_to_watch')
        const source = planned.length ? planned : pool.filter((i) => i.status === 'on_hold')
        return listReply(
          `Here are some ${label}picks from your ${planned.length ? 'plan-to-watch' : 'on-hold'} list:`,
          pickRandom(source, 3),
          `Nothing ${label}in your plan-to-watch or on-hold lists. Add a few and I'll pick for you!`
        )
      }

      if (/watching|reading|current|in progress|continue/.test(text))
        return listReply(
          `You're currently on these ${label}titles:`,
          pool.filter((i) => i.status === 'watching').slice(0, 8),
          `You aren't watching any ${label}titles right now.`
        )

      if (/top|best|favou?rite|highest/.test(text))
        return listReply(
          `Your top rated ${label}titles:`,
          pool.filter((i) => i.rating).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5),
          `You haven't rated any ${label}titles yet.`
        )

      if (/almost|close to|finish/.test(text)) {
        const near = pool
          .filter((i) => i.status === 'watching' && i.total && i.progress / i.total >= 0.6)
          .sort((a, b) => b.progress / (b.total || 1) - a.progress / (a.total || 1))
        return listReply('These are close to the finish line:', near.slice(0, 5), 'Nothing is close to finished yet. Keep going!')
      }

      if (/dropped/.test(text))
        return listReply(`Titles you dropped:`, pool.filter((i) => i.status === 'dropped').slice(0, 8), 'You haven\'t dropped anything. Respect.')

      const query = text.replace(/^(find|search|do i have|is|show me|where is|open)\s+/, '').replace(/[?!.]+$/, '').trim()
      const matches = query.length >= 2 ? all.filter((i) => i.title.toLowerCase().includes(query)) : []
      if (matches.length)
        return listReply(`Found ${matches.length} on your shelf:`, matches.slice(0, 6), '')

      return `I can help with your shelf. Try:\n- "What should I watch next?"\n- "Recommend a manhwa"\n- "Show my stats"\n- "What am I watching?"\n- "Top rated anime"\n- "Almost finished"\n- Or type a title to find it`
    })
  }, [setSearchParams])

  return (
    <ChatWidget
      adapter={adapter}
      title="Vault Assistant"
      subtitle="Knows your whole shelf"
      avatar={<AnimeMascot />}
      launcherIcon={<AnimeMascot />}
      welcomeMessage="Hey! I'm your **Vault Assistant**. Ask me what to watch next, your stats, or to find a title on your shelf."
      suggestions={['What should I watch next?', 'Show my stats', 'What am I watching?', 'Top rated', 'Recommend a manhwa']}
      placeholder="Ask about your shelf…"
      storageKey="vault-assistant-history"
      theme={{ accent: '#7c3aed', accent2: '#db2777', mode: 'auto' }}
      className="vault-bot"
    />
  )
}
