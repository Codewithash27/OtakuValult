import type { AdapterReply, ChatAdapter, ChatMessage } from './types'

const toApiMessages = (messages: ChatMessage[]) =>
  messages.filter((m) => !m.error && m.content).map((m) => ({ role: m.role, content: m.content }))

const pickText = (json: any): string =>
  json?.reply ?? json?.content ?? json?.message ?? json?.text ??
  json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.delta?.content ?? ''

export interface HttpAdapterOptions {
  url: string
  headers?: Record<string, string>
  /** Build the request body. Default: `{ messages: [{ role, content }] }`. */
  buildBody?: (messages: ChatMessage[]) => unknown
  /** Extract text from a JSON (non-streaming) response. */
  parseResponse?: (json: any) => string | AdapterReply
}

/**
 * Talks to your own backend. Handles three response styles automatically:
 * JSON (`{ reply }`, `{ content }`, OpenAI shape), Server-Sent Events, and plain streamed text.
 */
export function createHttpAdapter(opts: HttpAdapterOptions): ChatAdapter {
  return async (messages, { signal, onToken }) => {
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      body: JSON.stringify(opts.buildBody ? opts.buildBody(messages) : { messages: toApiMessages(messages) }),
      signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Request failed (${res.status}) ${detail.slice(0, 200)}`)
    }

    const type = res.headers.get('content-type') || ''
    if (type.includes('application/json')) {
      const json = await res.json()
      return opts.parseResponse ? opts.parseResponse(json) : pickText(json)
    }
    if (!res.body) return await res.text()

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const isSSE = type.includes('text/event-stream')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      if (!isSSE) {
        onToken(chunk)
        continue
      }
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          onToken(pickText(JSON.parse(data)) || '')
        } catch {
          onToken(data)
        }
      }
    }
  }
}

export interface OpenAIAdapterOptions {
  /** Any OpenAI-compatible API: OpenAI, OpenRouter, Groq, Together, Ollama (`http://localhost:11434/v1`)... */
  baseUrl?: string
  /** Never ship a real key in a public frontend. Prefer proxying through your backend with createHttpAdapter. */
  apiKey?: string
  model: string
  systemPrompt?: string
  temperature?: number
}

export function createOpenAIAdapter(opts: OpenAIAdapterOptions): ChatAdapter {
  return createHttpAdapter({
    url: `${(opts.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
    headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : undefined,
    buildBody: (messages) => ({
      model: opts.model,
      stream: true,
      temperature: opts.temperature ?? 0.7,
      messages: [
        ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
        ...toApiMessages(messages),
      ],
    }),
  })
}

/**
 * Runs a plain function in the browser (rules, local data, offline FAQ...)
 * and types the answer out like a streamed reply.
 */
export function createLocalAdapter(
  handler: (input: string, messages: ChatMessage[]) => string | AdapterReply | Promise<string | AdapterReply>,
  { typingSpeed = 12 }: { typingSpeed?: number } = {}
): ChatAdapter {
  return async (messages, { signal, onToken }) => {
    const last = messages[messages.length - 1]?.content || ''
    const result = await handler(last, messages)
    const reply: AdapterReply = typeof result === 'string' ? { content: result } : result
    const words = (reply.content || '').split(/(\s+)/)
    for (const w of words) {
      if (signal.aborted) break
      onToken(w)
      if (typingSpeed) await new Promise((r) => setTimeout(r, typingSpeed))
    }
    return { actions: reply.actions }
  }
}
