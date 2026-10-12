import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ChatMessage, ChatWidgetProps } from './types'
import { Markdown } from './Markdown'
import './chatbot.css'

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function loadHistory(key: string | false): ChatMessage[] {
  if (!key) return []
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function useDarkMode(mode: 'auto' | 'dark' | 'light') {
  const read = () =>
    mode === 'dark' ||
    (mode === 'auto' &&
      (document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark'))
  const [dark, setDark] = useState(read)
  useEffect(() => {
    setDark(read())
    if (mode !== 'auto') return
    const obs = new MutationObserver(() => setDark(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => obs.disconnect()
  }, [mode])
  return dark
}

const Icon = {
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="3" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
    </svg>
  ),
}

export function ChatWidget({
  adapter,
  title = 'Assistant',
  subtitle = 'Online',
  avatar = '✦',
  launcherIcon,
  welcomeMessage = 'Hi! How can I help you today?',
  suggestions = [],
  placeholder = 'Type a message…',
  position = 'bottom-right',
  theme = {},
  storageKey = 'cbw-history',
  defaultOpen = false,
  hotkey = true,
  className = '',
}: ChatWidgetProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(storageKey))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const openRef = useRef(open)
  const dark = useDarkMode(theme.mode || 'auto')

  openRef.current = open

  useEffect(() => {
    if (!storageKey) return
    const persistable = messages.filter((m) => m.content).map(({ actions, ...m }) => m)
    localStorage.setItem(storageKey, JSON.stringify(persistable.slice(-100)))
  }, [messages, storageKey])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => inputRef.current?.focus(), 250)
    }
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hotkey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape' && openRef.current) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hotkey])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  const patch = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)))

  const run = useCallback(
    async (history: ChatMessage[]) => {
      const replyId = uid()
      setMessages([...history, { id: replyId, role: 'assistant', content: '', createdAt: Date.now() }])
      setLoading(true)
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const result = await adapter(history, {
          signal: controller.signal,
          onToken: (chunk) => patch(replyId, (m) => ({ ...m, content: m.content + chunk })),
          sendUserMessage: (text) => send(text),
        })
        if (typeof result === 'string') patch(replyId, (m) => ({ ...m, content: result || m.content }))
        else if (result) patch(replyId, (m) => ({ ...m, content: result.content ?? m.content, actions: result.actions }))
        if (!openRef.current) setUnread((n) => n + 1)
      } catch (err) {
        if (controller.signal.aborted) {
          patch(replyId, (m) => ({ ...m, content: m.content || '_Stopped._' }))
        } else {
          patch(replyId, (m) => ({
            ...m,
            error: true,
            content: `Something went wrong: ${err instanceof Error ? err.message : String(err)}`,
          }))
        }
      } finally {
        setLoading(false)
        abortRef.current = null
      }
    },
    [adapter]
  )

  const send = (text: string) => {
    const content = text.trim()
    if (!content || loading) return
    setInput('')
    run([...messages, { id: uid(), role: 'user', content, createdAt: Date.now() }])
  }

  const retry = () => {
    const lastUser = [...messages].reverse().findIndex((m) => m.role === 'user')
    if (lastUser === -1 || loading) return
    run(messages.slice(0, messages.length - lastUser))
  }

  const copy = async (m: ChatMessage) => {
    await navigator.clipboard?.writeText(m.content)
    setCopied(m.id)
    setTimeout(() => setCopied(null), 1200)
  }

  const style = {
    ...(theme.accent && { '--cbw-accent': theme.accent }),
    ...(theme.accent2 && { '--cbw-accent-2': theme.accent2 }),
  } as CSSProperties

  const last = messages[messages.length - 1]
  const showTyping = loading && last?.role === 'assistant' && !last.content

  const handleClear = () => {
    if (loading && abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      setLoading(false)
    }
    setMessages([])
    if (storageKey) {
      localStorage.removeItem(storageKey)
    }
  }

  return createPortal(
    <div className={`cbw-root cbw-${position} ${dark ? 'cbw-dark' : ''} ${className}`} style={style}>
      <section className={`cbw-panel ${open ? 'cbw-open' : ''}`} role="dialog" aria-label={title} aria-hidden={!open}>
        <header className="cbw-header">
          <div className="cbw-avatar">{avatar}</div>
          <div className="cbw-head-text">
            <strong>{title}</strong>
            <span><i className="cbw-dot" />{loading ? 'Typing…' : subtitle}</span>
          </div>
          <button
            className="cbw-icon-btn"
            onClick={handleClear}
            title="Clear chat history"
            aria-label="Clear chat"
          >
            {Icon.trash}
          </button>
          <button className="cbw-icon-btn" onClick={() => setOpen(false)} aria-label="Close chat">
            {Icon.close}
          </button>
        </header>

        <div className="cbw-messages" ref={listRef}>
          <div className="cbw-msg cbw-assistant">
            <div className="cbw-bubble"><Markdown text={welcomeMessage} /></div>
          </div>

          {messages.length === 0 && suggestions.length > 0 && (
            <div className="cbw-suggestions">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'assistant' && !m.content ? null : (
              <div key={m.id} className={`cbw-msg cbw-${m.role} ${m.error ? 'cbw-error' : ''}`}>
                <div className="cbw-bubble">
                  {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
                  {loading && i === messages.length - 1 && m.role === 'assistant' && <span className="cbw-caret" />}
                </div>
                {m.actions && m.actions.length > 0 && (
                  <div className="cbw-actions">
                    {m.actions.map((a) => (
                      <button key={a.label} onClick={a.onClick}>{a.label}</button>
                    ))}
                  </div>
                )}
                <div className="cbw-meta">
                  <span>{time(m.createdAt)}</span>
                  {m.role === 'assistant' && (
                    <>
                      <button onClick={() => copy(m)}>{copied === m.id ? 'Copied' : 'Copy'}</button>
                      {i === messages.length - 1 && !loading && <button onClick={retry}>Retry</button>}
                    </>
                  )}
                </div>
              </div>
            )
          )}

          {showTyping && (
            <div className="cbw-msg cbw-assistant">
              <div className="cbw-bubble cbw-typing"><i /><i /><i /></div>
            </div>
          )}
        </div>

        <form
          className="cbw-composer"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            placeholder={placeholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
          />
          {loading ? (
            <button type="button" className="cbw-send cbw-stop" onClick={() => abortRef.current?.abort()} aria-label="Stop">
              {Icon.stop}
            </button>
          ) : (
            <button type="submit" className="cbw-send" disabled={!input.trim()} aria-label="Send">
              {Icon.send}
            </button>
          )}
        </form>
        {hotkey && <div className="cbw-hint">Enter to send · Shift+Enter new line · Ctrl+K toggle</div>}
      </section>

      <button className={`cbw-launcher ${open ? 'cbw-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Toggle chat">
        <span className={`cbw-launcher-icon cbw-i-chat ${launcherIcon ? 'cbw-custom' : ''}`}>{launcherIcon || Icon.chat}</span>
        <span className="cbw-launcher-icon cbw-i-close">{Icon.close}</span>
        {unread > 0 && !open && <span className="cbw-badge">{unread}</span>}
      </button>
    </div>,
    document.body
  )
}
