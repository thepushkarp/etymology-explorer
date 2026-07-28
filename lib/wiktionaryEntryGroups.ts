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

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#')) {
      const hexadecimal = name[1]?.toLowerCase() === 'x'
      const codePoint = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
      if (Number.isFinite(codePoint)) {
        try {
          return String.fromCodePoint(codePoint)
        } catch {
          return entity
        }
      }
      return entity
    }

    return named[name.toLowerCase()] ?? entity
  })
}

function cleanHeading(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function comparableHeading(value: string): string {
  return cleanHeading(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
}

/** Converts a MediaWiki HTML fragment into compact, readable source text. */
export function cleanWiktionaryHtml(value: string): string {
  const withBoundaries = value
    .replace(/<(?:style|script|noscript)[^>]*>[\s\S]*?<\/(?:style|script|noscript)>/gi, ' ')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(?:dd|div|dl|dt|h[1-6]|li|ol|p|table|tr|ul)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  return decodeHtmlEntities(withBoundaries)
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/[\t ]+/g, ' ')
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
  etymologyHeading: RegExp
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
        text: cleanWiktionaryHtml(html.slice(start, end)),
        sections: structuredSections,
      },
    ]
  })
}
