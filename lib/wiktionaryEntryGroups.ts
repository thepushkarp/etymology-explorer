import { decodeHtmlEntities, preserveLinguisticNotation } from './sourceText'
import { sameSpelling } from './orthography'
/** A section returned by MediaWiki's `prop=tocdata` parser response. */
export interface WiktionaryTocSection {
  index: string
  line: string
  anchor: string
  hLevel?: number
  level?: string
  number: string
}

/**
 * A heading and its local body within an etymology group.
 *
 * `text` stops at the next TOC heading. This keeps adjacent parts of speech,
 * senses, and form-of entries independently addressable even when an edition
 * places them at the same heading level as its etymology heading.
 */
export interface WiktionaryEntrySection {
  index: string
  number: string
  heading: string
  anchor: string
  level: number
  path: string[]
  text: string
}

/** One source-defined etymology, without merging it with adjacent etymologies. */
export interface WiktionaryEntryGroup {
  sourceUrl?: string
  transliteration?: string
  index: string
  number: string
  heading: string
  anchor: string
  level: number
  text: string
  sections: WiktionaryEntrySection[]
}

function headingLevel(section: WiktionaryTocSection): number {
  const level = section.hLevel ?? Number(section.level)
  return Number.isFinite(level) ? level : 0
}

function cleanHeading(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function comparableHeading(value: string): string {
  return cleanHeading(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
}

/** Converts a MediaWiki HTML fragment into compact, readable source text. */
export function cleanWiktionaryHtml(value: string): string {
  // Keep the publisher's reading annotation after its HTML classes disappear.
  const annotated = value.replace(
    /<span\b[^>]*class=["'](?:[^"']*\s)?mention-tr(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/span>/gi,
    'transliteration: $1'
  )
  const withBoundaries = preserveLinguisticNotation(annotated)
    .replace(/<(?:style|script|noscript)[^>]*>[\s\S]*?<\/(?:style|script|noscript)>/gi, ' ')
    .replace(
      /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, url: string, label: string) => `${label} (${url})`
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(?:dd|div|dl|dt|h[1-6]|li|ol|p|table|tr|ul)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  return decodeHtmlEntities(withBoundaries)
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/[^\S\r\n]+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim()
    )
    .filter(Boolean)
    .join('\n')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function anchorOffset(html: string, anchor: string): number {
  const escaped = escapeRegExp(anchor)
  const heading = html.match(new RegExp(`<h[1-6][^>]*\\bid=["']${escaped}["'][^>]*>`, 'i'))
  if (heading?.index !== undefined) return heading.index

  const element = html.match(new RegExp(`<[^>]+\\bid=["']${escaped}["'][^>]*>`, 'i'))
  return element?.index ?? -1
}

function matchesHeading(pattern: RegExp, heading: string): boolean {
  pattern.lastIndex = 0
  const matches = pattern.test(cleanHeading(heading))
  pattern.lastIndex = 0
  return matches
}

function sectionPath(sections: WiktionaryTocSection[], targetIndex: number): string[] {
  const stack: Array<{ heading: string; level: number }> = []

  for (let index = 0; index <= targetIndex; index += 1) {
    const section = sections[index]
    const level = headingLevel(section)
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop()
    stack.push({ heading: cleanHeading(section.line), level })
  }

  return stack.map((section) => section.heading)
}

/** Readings must share a headword line with the exact query in this history. */
function headwordTransliteration(html: string, word: string): string | undefined {
  const readings = new Set<string>()
  for (const block of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const headwords = [...block[1].matchAll(/<strong\b([^>]*)>([\s\S]*?)<\/strong>/gi)].filter(
      (match) => /\bclass=["'](?:[^"']*\s)?headword(?:\s[^"']*)?["']/i.test(match[1])
    )
    for (const [index, headword] of headwords.entries()) {
      if (!sameSpelling(cleanWiktionaryHtml(headword[2]), word)) continue
      const tail = block[1].slice(headword.index! + headword[0].length, headwords[index + 1]?.index)
      const reading = tail.match(
        /<span\b[^>]*class=["'](?:[^"']*\s)?headword-tr(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/span>/i
      )
      if (reading) {
        const text = cleanWiktionaryHtml(reading[1])
        if (text) readings.add(text)
      }
    }
  }
  return readings.size === 1 ? [...readings][0] : undefined
}

/**
 * Extracts independent entry groups from one explicitly selected language.
 *
 * Numbered etymology headings are group boundaries. Other headings remain
 * structured sections inside the current group, including same-level native
 * edition headings such as a noun entry followed by an inflected-form entry.
 * If an edition has no etymology heading, the language section is returned as
 * one fallback group rather than being confused with a same-spelling language.
 */
export function extractWiktionaryEntryGroups(
  html: string,
  sections: readonly WiktionaryTocSection[],
  languageHeading: string,
  etymologyHeading: RegExp,
  requestedWord?: string
): WiktionaryEntryGroup[] {
  const languageIndex = sections.findIndex(
    (section) => comparableHeading(section.line) === comparableHeading(languageHeading)
  )
  if (languageIndex < 0) return []

  const language = sections[languageIndex]
  const languageLevel = headingLevel(language)
  const nextLanguageRelativeIndex = sections
    .slice(languageIndex + 1)
    .findIndex((section) => headingLevel(section) <= languageLevel)
  const languageEndIndex =
    nextLanguageRelativeIndex < 0 ? sections.length : languageIndex + 1 + nextLanguageRelativeIndex
  const languageEndOffset =
    languageEndIndex < sections.length
      ? anchorOffset(html, sections[languageEndIndex].anchor)
      : html.length

  const etymologyIndexes: number[] = []
  for (let index = languageIndex + 1; index < languageEndIndex; index += 1) {
    if (matchesHeading(etymologyHeading, sections[index].line)) etymologyIndexes.push(index)
  }

  const groupIndexes = etymologyIndexes.length > 0 ? etymologyIndexes : [languageIndex]

  return groupIndexes.flatMap((groupIndex, position) => {
    const group = sections[groupIndex]
    const start = anchorOffset(html, group.anchor)
    if (start < 0) return []

    const nextGroupIndex = groupIndexes[position + 1] ?? languageEndIndex
    const nextGroupOffset =
      nextGroupIndex < sections.length
        ? anchorOffset(html, sections[nextGroupIndex].anchor)
        : languageEndOffset
    const end = nextGroupOffset > start ? nextGroupOffset : languageEndOffset
    const fragment = html.slice(start, end)
    const transliteration = requestedWord
      ? headwordTransliteration(fragment, requestedWord)
      : undefined
    const assignedSections = sections.slice(groupIndex + 1, nextGroupIndex)

    const structuredSections = assignedSections.flatMap((section, sectionPosition) => {
      const sectionStart = anchorOffset(html, section.anchor)
      if (sectionStart < 0 || sectionStart >= end) return []

      const following = assignedSections[sectionPosition + 1]
      const followingOffset = following ? anchorOffset(html, following.anchor) : end
      const sectionEnd = followingOffset > sectionStart ? followingOffset : end

      return [
        {
          index: section.index,
          number: section.number,
          heading: cleanHeading(section.line),
          anchor: section.anchor,
          level: headingLevel(section),
          path: sectionPath(assignedSections, sectionPosition),
          text: cleanWiktionaryHtml(html.slice(sectionStart, sectionEnd)),
        },
      ]
    })

    return [
      {
        index: group.index,
        number: group.number,
        heading: cleanHeading(group.line),
        anchor: group.anchor,
        level: headingLevel(group),
        ...(transliteration ? { transliteration } : {}),
        text: cleanWiktionaryHtml(fragment),
        sections: structuredSections,
      },
    ]
  })
}

/** Only explicit spelling-variant statements in the selected language admit links. */
export function extractWiktionaryVariants(
  html: string,
  sections: readonly WiktionaryTocSection[],
  languageHeading: string,
  edition = 'en'
): Array<{ word: string; relationship: 'spelling-variant'; url: string }> {
  const index = sections.findIndex(
    (section) => comparableHeading(section.line) === comparableHeading(languageHeading)
  )
  if (index < 0) return []
  const start = anchorOffset(html, sections[index].anchor)
  const next = sections
    .slice(index + 1)
    .find((section) => headingLevel(section) <= headingLevel(sections[index]))
  if (start < 0) return []
  const end = next ? anchorOffset(html, next.anchor) : html.length
  const fragment = html.slice(start, end < 0 ? html.length : end)
  const variants = new Map<
    string,
    { word: string; relationship: 'spelling-variant'; url: string }
  >()
  // Resolve invariant heading offsets once to avoid whole-page scans per block.
  const positionedSections = sections.map((section) => ({
    section,
    offset: anchorOffset(html, section.anchor),
  }))
  // Inspect local definition/paragraph blocks so a variant qualifier never leaks
  // across senses into unrelated translation or cognate links.
  for (const block of fragment.matchAll(/<(p|li|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const body = block[2]
    const plain = cleanWiktionaryHtml(body.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1'))
    const statement =
      /\b(?:(?:British|American|UK|US)\s+(?:English\s+)?(?:standard\s+)?(?:spelling|form)|(?:alternative|alternate)\s+spelling)\s+(?:of|for)\b/i.test(
        plain
      )
    const localHeading = positionedSections
      .filter(({ offset }) => offset >= start && offset <= start + (block.index ?? 0))
      .at(-1)?.section
    const listedRegionalVariant =
      localHeading &&
      /^Alternative forms?$/i.test(cleanHeading(localHeading.line)) &&
      /\b(?:British|American|UK|US)\s+(?:English\s+)?(?:standard\s+)?spelling\b/i.test(plain)
    if (!statement && !listedRegionalVariant) continue
    // Standard MediaWiki form-of markup identifies the target, rather than a
    // regional label link or another word mentioned in an example.
    const target =
      body.match(
        /<(?:span|i)\b[^>]*class=["'](?:[^"']*\s)?(?:form-of-definition-link|mention)(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/(?:span|i)>/i
      )?.[1] ?? body
    const relationTail =
      target === body && statement
        ? body.slice(body.search(/(?:spelling|form)[\s\S]*?\b(?:of|for)\b/i))
        : target
    const link = relationTail.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const href = decodeHtmlEntities(link[1])
    const url = new URL(href, `https://${edition}.wiktionary.org`)
    if (url.hostname !== `${edition}.wiktionary.org` || !url.pathname.startsWith('/wiki/')) continue
    const word = decodeURIComponent(url.pathname.slice('/wiki/'.length)).replace(/_/g, ' ')
    if (!word || word.includes(':')) continue
    variants.set(word, { word, relationship: 'spelling-variant', url: url.toString() })
  }
  return [...variants.values()]
}

/** Retains every subsection, including pronunciation/variants before etymology. */
export function extractWiktionaryLanguageText(
  html: string,
  sections: readonly WiktionaryTocSection[],
  languageHeading: string
): string {
  const index = sections.findIndex(
    (section) => comparableHeading(section.line) === comparableHeading(languageHeading)
  )
  if (index < 0) return ''
  const start = anchorOffset(html, sections[index].anchor)
  if (start < 0) return ''
  const next = sections
    .slice(index + 1)
    .find((section) => headingLevel(section) <= headingLevel(sections[index]))
  const end = next ? anchorOffset(html, next.anchor) : html.length
  return cleanWiktionaryHtml(html.slice(start, end < 0 ? html.length : end))
}
