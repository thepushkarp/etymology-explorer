import type { ReactNode } from 'react'

const ARABIC_SCRIPT = /\p{Script=Arabic}/u
const DEVANAGARI_SCRIPT = /\p{Script=Devanagari}/u
const HAN_SCRIPT = /\p{Script=Han}/u
const HIRAGANA_SCRIPT = /\p{Script=Hiragana}/u
const KATAKANA_SCRIPT = /\p{Script=Katakana}/u
const FOREIGN_SPAN_PATTERN =
  /(?:(?!\p{Script=Latin})\p{Letter}[\p{Mark}\u200C\u200D]*)+(?:[ \u00A0]+(?:(?!\p{Script=Latin})\p{Letter}[\p{Mark}\u200C\u200D]*)+)*/gu
const EMPHASIS_PATTERN = /(?<!\*)\*([^*\s](?:[^*\n]*[^*\s])?)\*(?!\*)/g

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
    (ARABIC_SCRIPT.test(text)
      ? 'und-Arab'
      : DEVANAGARI_SCRIPT.test(text)
        ? 'und-Deva'
        : HAN_SCRIPT.test(text)
          ? 'und-Hani'
          : HIRAGANA_SCRIPT.test(text)
            ? 'und-Hira'
            : KATAKANA_SCRIPT.test(text)
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
  let offset = 0
  for (const match of text.matchAll(FOREIGN_SPAN_PATTERN)) {
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
  let offset = 0
  for (const match of text.matchAll(EMPHASIS_PATTERN)) {
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
    <div className="max-w-prose space-y-4 font-serif text-base leading-[1.85] text-ink sm:text-[1.0625rem]">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{emphasize(paragraph)}</p>
      ))}
    </div>
  )
}
