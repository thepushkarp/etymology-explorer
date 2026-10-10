import type { ReactNode } from 'react'

/** A small prose format: blank-line paragraphs and single-star italic emphasis. */
function emphasize(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Require nonempty, unpadded text; leave double stars and unmatched historical
  // reconstruction markers untouched. React text nodes always escape HTML.
  const pattern = /(?<!\*)\*([^*\s](?:[^*\n]*[^*\s])?)\*(?!\*)/g
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    nodes.push(text.slice(offset, index))
    nodes.push(<em key={index}>{match[1]}</em>)
    offset = index + match[0].length
  }
  nodes.push(text.slice(offset))
  return nodes
}

export function StoryText({ text }: { text: string }) {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  return (
    <div className="max-w-2xl space-y-5 font-serif text-lg leading-[1.8] text-ink">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{emphasize(paragraph)}</p>
      ))}
    </div>
  )
}
