import { Fragment, ReactNode } from 'react'

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-${i}`
    if (!part) return null
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>
    if (part.startsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>
    if (/^https?:\/\//.test(part)) return <a key={key} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
    return <Fragment key={key}>{part}</Fragment>
  })
}

function blocks(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const lines = text.split('\n')
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(
      <Tag key={`${keyBase}-l${out.length}`}>
        {list.items.map((it, i) => <li key={i}>{inline(it, `${keyBase}-li${out.length}-${i}`)}</li>)}
      </Tag>
    )
    list = null
  }

  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const ul = line.match(/^\s*[-*•]\s+(.*)/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/)
    if (ul || ol) {
      const ordered = !!ol
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push((ul || ol)![1])
      return
    }
    flush()
    if (!line.trim()) return
    const h = line.match(/^#{1,4}\s+(.*)/)
    if (h) out.push(<h4 key={`${keyBase}-h${i}`}>{inline(h[1], `${keyBase}-h${i}`)}</h4>)
    else out.push(<p key={`${keyBase}-p${i}`}>{inline(line, `${keyBase}-p${i}`)}</p>)
  })
  flush()
  return out
}

/** Tiny, dependency-free markdown: paragraphs, lists, headings, code, bold, italic, links. */
export function Markdown({ text }: { text: string }) {
  const parts = text.split(/```(?:\w+)?\n?([\s\S]*?)(?:```|$)/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i}><code>{part.replace(/\n$/, '')}</code></pre>
        ) : (
          <Fragment key={i}>{blocks(part, String(i))}</Fragment>
        )
      )}
    </>
  )
}
