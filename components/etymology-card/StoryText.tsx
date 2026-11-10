import type { ReactNode } from 'react'

/** A form's script can be known when its lexical language is not supplied. */
export function FormText({
  text,
  language,
  className,
}: {
  text: string
  language?: string
  className?: string
}) {
  const lang =
    language ??
    (/\p{Script=Arabic}/u.test(text)
      ? 'und-Arab'
      : /\p{Script=Devanagari}/u.test(text)
        ? 'und-Deva'
        : /\p{Script=Han}/u.test(text)
          ? 'und-Hani'
          : /\p{Script=Hiragana}/u.test(text)
            ? 'und-Hira'
            : /\p{Script=Katakana}/u.test(text)
              ? 'und-Kana'
              : 'und')
  return (
    <bdi lang={lang} dir="auto" className={className}>
      {text}
    </bdi>
  )
}

/** Isolate unmarked native forms without inferring a language from their script. */
function isolateForeignText(text: string, baseOffset: number): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern =
    /(?:(?!\p{Script=Latin})\p{Letter}[\p{Mark}\u200C\u200D]*)+(?:[ \u00A0]+(?:(?!\p{Script=Latin})\p{Letter}[\p{Mark}\u200C\u200D]*)+)*/gu
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    nodes.push(text.slice(offset, match.index))
    nodes.push(<FormText key={`form-${baseOffset + match.index}`} text={match[0]} />)
    offset = match.index + match[0].length
  }
  nodes.push(text.slice(offset))
  return nodes
}

/** A small prose format: blank-line paragraphs and single-star italic emphasis. */
export function emphasize(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Require nonempty, unpadded text; leave double stars and unmatched historical
  // reconstruction markers untouched. React text nodes always escape HTML.
  const pattern = /(?<!\*)\*([^*\s](?:[^*\n]*[^*\s])?)\*(?!\*)/g
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    nodes.push(...isolateForeignText(text.slice(offset, index), offset))
    nodes.push(
      <em key={`em-${index}`}>
        <FormText text={match[1]} />
      </em>
    )
    offset = index + match[0].length
  }
  nodes.push(...isolateForeignText(text.slice(offset), offset))
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
