# Chatbot widget

Drop-in React chat widget. Only needs `react` + `react-dom` (18+). No Tailwind, no other deps — copy this folder into any project.

## Use

```tsx
import { ChatWidget, createHttpAdapter } from './chatbot'

<ChatWidget
  adapter={createHttpAdapter({ url: '/api/chat' })}
  title="Assistant"
  suggestions={['What can you do?']}
/>
```

## Adapters (where the answers come from)

| Adapter | Use for |
|---|---|
| `createHttpAdapter({ url, headers?, buildBody?, parseResponse? })` | Your backend. Sends `{ messages: [{ role, content }] }`. Accepts JSON (`{ reply }`, `{ content }`, OpenAI shape), SSE, or streamed text. |
| `createOpenAIAdapter({ baseUrl?, apiKey?, model, systemPrompt? })` | Any OpenAI-compatible API (OpenAI, OpenRouter, Groq, Ollama `http://localhost:11434/v1`). Keep keys on a server in production. |
| `createLocalAdapter((input, messages) => reply)` | Rules / local data, no AI. Reply can be text or `{ content, actions }`. |

Custom adapter: `async (messages, { signal, onToken }) => string | { content, actions } | void`.
Call `onToken(chunk)` to stream. `actions` render as buttons under the reply.

## Props

`title`, `subtitle`, `avatar`, `welcomeMessage`, `suggestions`, `placeholder`,
`position` (`bottom-right` | `bottom-left`), `theme` (`{ accent, accent2, mode: 'auto' | 'dark' | 'light' }`),
`storageKey` (string or `false`), `defaultOpen`, `hotkey` (Ctrl/Cmd+K), `className`.

`mode: 'auto'` follows a `dark` class or `data-theme="dark"` on `<html>`.

## Styling

Override CSS variables via `className`:

```css
.my-bot { --cbw-offset-x: 24px; --cbw-offset-y: 24px; --cbw-z: 9990; --cbw-font: 'Inter', sans-serif; }
```

## Features

Streaming with typing caret, stop button, retry, copy, markdown (lists, code, bold, links),
quick-reply suggestions, action buttons, persistent history, clear chat, unread badge,
auto-growing input, Enter / Shift+Enter, Esc to close, Ctrl+K toggle, fullscreen on mobile,
dark/light theme, reduced-motion support.
