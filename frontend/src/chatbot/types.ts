import type { ReactNode } from 'react'

export type ChatRole = 'user' | 'assistant'

export interface ChatAction {
  label: string
  onClick: () => void
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  /** Buttons rendered under an assistant message. Not persisted. */
  actions?: ChatAction[]
  error?: boolean
}

export interface AdapterContext {
  /** Aborted when the user presses "Stop". */
  signal: AbortSignal
  /** Call repeatedly to stream text into the reply. */
  onToken: (chunk: string) => void
  /** Allows action buttons/options to send a message into the conversation */
  sendUserMessage?: (text: string) => void
}

export interface AdapterReply {
  content?: string
  actions?: ChatAction[]
}

/**
 * The only thing a host app must provide. Receives the full conversation
 * (latest user message last) and either streams via `onToken`, returns the text,
 * or returns `{ content, actions }`.
 */
export type ChatAdapter = (
  messages: ChatMessage[],
  ctx: AdapterContext
) => Promise<string | AdapterReply | void>

export interface ChatTheme {
  /** Primary gradient start, any CSS color. */
  accent?: string
  /** Primary gradient end, any CSS color. */
  accent2?: string
  /** 'auto' follows a `dark` class / data-theme="dark" on <html>. */
  mode?: 'auto' | 'dark' | 'light'
}

export interface ChatWidgetProps {
  adapter: ChatAdapter
  title?: string
  subtitle?: string
  avatar?: ReactNode
  /** Custom launcher button content (e.g. an SVG mascot). Defaults to a chat bubble icon. */
  launcherIcon?: ReactNode
  welcomeMessage?: string
  suggestions?: string[]
  placeholder?: string
  position?: 'bottom-right' | 'bottom-left'
  theme?: ChatTheme
  /** localStorage key for history; `false` disables persistence. */
  storageKey?: string | false
  defaultOpen?: boolean
  /** Toggle with Ctrl/Cmd + K. */
  hotkey?: boolean
  /** Extra class on the root, handy for overriding --cbw-* CSS variables. */
  className?: string
}
