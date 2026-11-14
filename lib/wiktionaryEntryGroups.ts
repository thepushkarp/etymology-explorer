import { decodeHtmlEntities, preserveLinguisticNotation } from './sourceText'
import { sameSpelling } from './orthography'
import { LANGUAGES, languageFromName, lexicalLanguageName, type LanguageCode } from './languages'
import { normalizeScriptTargets } from './scriptTargets'
import { japaneseEtymologyRelations } from './japaneseEtymology'
import type { LexemeRef, ScriptTarget, SourceData, SourceLexicalRelation } from './types'
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
  counterparts?: ScriptTarget[]
  relations?: SourceLexicalRelation[]
  /** Only this heading's own body, excluding sense and descendant subsections. */
  etymologyText?: string
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

/** Ruby readings annotate a lexical spelling without contributing to its identity. */
function lexicalSpellingHtml(html: string): string {
  return html.replace(/<(rt|rp)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<\/?ruby\b[^>]*>/gi, '')
}

/** Readings must share a headword line with the exact query in this history. */
function headwordTransliteration(html: string, word: string): string | undefined {
  const readings = new Set<string>()
  for (const block of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const headwords = [...block[1].matchAll(/<strong\b([^>]*)>([\s\S]*?)<\/strong>/gi)].filter(
      (match) => /\bclass=["'](?:[^"']*\s)?headword(?:\s[^"']*)?["']/i.test(match[1])
    )
    for (const [index, headword] of headwords.entries()) {
      if (!sameSpelling(cleanWiktionaryHtml(lexicalSpellingHtml(headword[2])), word)) continue
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

function attribute(attributes: string, name: string): string | undefined {
  return attributes.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1]
}

function hasClass(attributes: string, name: string): boolean {
  return (attribute(attributes, 'class') ?? '').split(/\s+/).includes(name)
}

function balancedElement(html: string, start: number) {
  const opening = html.slice(start).match(/^<([a-z][a-z0-9]*)\b([^>]*)>/i)
  if (!opening) return undefined
  const tags = new RegExp(`<(/?)${opening[1]}\\b[^>]*>`, 'gi')
  tags.lastIndex = start + opening[0].length
  let depth = 1
  let closing
  while ((closing = tags.exec(html))) {
    depth += closing[1] ? -1 : 1
    if (depth === 0)
      return {
        attributes: opening[2],
        body: html.slice(start + opening[0].length, closing.index),
        end: tags.lastIndex,
      }
  }
  return undefined
}

export function languageFragment(
  html: string,
  sections: readonly WiktionaryTocSection[],
  languageHeading: string
) {
  const index = sections.findIndex(
    (section) => comparableHeading(section.line) === comparableHeading(languageHeading)
  )
  if (index < 0) return undefined
  const start = anchorOffset(html, sections[index].anchor)
  const next = sections
    .slice(index + 1)
    .find((section) => headingLevel(section) <= headingLevel(sections[index]))
  const end = next ? anchorOffset(html, next.anchor) : html.length
  return start >= 0 && end > start ? { start, html: html.slice(start, end) } : undefined
}

function japaneseSeeEntries(html: string, edition: string) {
  const entries = []
  let consumed = 0
  for (const opening of html.matchAll(/<table\b([^>]*)>/gi)) {
    if (opening.index < consumed || !hasClass(opening[1], 'ja-see')) continue
    const table = balancedElement(html, opening.index)
    if (!table) continue
    consumed = table.end
    const header = table.body.match(/<b\b[^>]*>([\s\S]*?)<\/b>/i)?.[1]
    if (!header || !/^For pronunciation and definitions\b/i.test(cleanWiktionaryHtml(header)))
      continue
    const targets: ScriptTarget[] = []
    let targetCount = 0
    for (const term of table.body.matchAll(/<(span|i|b)\b([^>]*)>\s*[【〖]\s*([\s\S]*?)[】〗]/gi)) {
      targetCount++
      if (attribute(term[2], 'lang') === 'ja' && [...term[3].matchAll(/<a\b/gi)].length === 1)
        targets.push(...scriptLink(term[3], 'ja', edition))
    }
    const subject = header.match(/<(span|i)\b([^>]*)>([\s\S]*?)<\/\1>/i)
    entries.push({
      start: opening.index,
      end: table.end,
      header: cleanWiktionaryHtml(header),
      subject:
        subject && attribute(subject[2], 'lang') === 'ja'
          ? cleanWiktionaryHtml(lexicalSpellingHtml(subject[3]))
          : undefined,
      targetCount,
      targets: normalizeScriptTargets(targets),
    })
  }
  return entries
}

/** The destination title, language anchor, and tagged language must agree. */
function scriptLink(html: string, language: LanguageCode, edition: string): ScriptTarget[] {
  const href = html.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1]
  if (!href) return []
  try {
    const url = new URL(decodeHtmlEntities(href), `https://${edition}.wiktionary.org`)
    if (
      url.protocol !== 'https:' ||
      url.host !== `${edition}.wiktionary.org` ||
      !url.pathname.startsWith('/wiki/') ||
      url.search ||
      languageFromName(decodeURIComponent(url.hash.slice(1)).replace(/_/g, ' ')) !== language
    )
      return []
    return normalizeScriptTargets([
      { word: decodeURIComponent(url.pathname.slice(6)).replace(/_/g, ' '), language },
    ])
  } catch {
    return []
  }
}

function selectedHeadwordLines(html: string, language: LanguageCode) {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].flatMap((block) =>
    [...block[1].matchAll(/<strong\b([^>]*)>([\s\S]*?)<\/strong>/gi)].flatMap((headword) =>
      hasClass(headword[1], 'headword') && attribute(headword[1], 'lang') === language
        ? [{ body: block[1], headword, start: block.index }]
        : []
    )
  )
}

function headwordCounterparts(
  html: string,
  word: string,
  language: LanguageCode,
  edition: string,
  boundHeadword?: string
): ScriptTarget[] {
  if (language !== 'hi' && language !== 'ur') return []
  const targetLanguage = language === 'hi' ? 'ur' : 'hi'
  const label = language === 'hi' ? 'Urdu' : 'Hindi'
  const targets: ScriptTarget[] = []
  for (const { body, headword } of selectedHeadwordLines(html, language)) {
    const spelling = cleanWiktionaryHtml(lexicalSpellingHtml(headword[2]))
    if (!sameSpelling(spelling, word) && !sameSpelling(spelling, boundHeadword ?? '')) continue
    const tail = body.slice(headword.index! + headword[0].length)
    const nextHeadword = tail.search(/<strong\b[^>]*class=["'][^"']*\bheadword\b/i)
    const local = nextHeadword < 0 ? tail : tail.slice(0, nextHeadword)
    for (const term of local.matchAll(
      /<(b|i|span)\b([^>]*\blang=["'][^"']+["'][^>]*)>([\s\S]*?)<\/\1>/gi
    )) {
      if (attribute(term[2], 'lang') !== targetLanguage) continue
      const prefix = cleanWiktionaryHtml(local.slice(0, term.index))
      if (!new RegExp(`(?:^|[,(;])\\s*${label} spelling\\s*:?$`, 'i').test(prefix)) continue
      targets.push(...scriptLink(term[3], targetLanguage, edition))
    }
  }
  return normalizeScriptTargets(targets)
}

/** Romanization definitions are explicit links, never inferred from pronunciation or glosses. */
export function extractWiktionaryRomanizations(
  html: string,
  sections: readonly WiktionaryTocSection[],
  requestedWord: string
): ScriptTarget[] {
  if (!/^[\p{Script=Latin}\p{M}\s'’\-]+$/u.test(requestedWord)) return []
  const targets: ScriptTarget[] = []
  for (let index = 0; index < sections.length; index++) {
    const language = languageFromName(cleanHeading(sections[index].line))
    if (
      !language ||
      LANGUAGES[language].scripts.every((script) => script === 'Latin') ||
      headingLevel(sections[index]) !== 2
    )
      continue
    for (let cursor = index + 1; cursor < sections.length; cursor++) {
      if (headingLevel(sections[cursor]) <= 2) break
      if (!/^Romanization$/i.test(cleanHeading(sections[cursor].line))) continue
      const start = anchorOffset(html, sections[cursor].anchor)
      const following = sections[cursor + 1]
      const end = following ? anchorOffset(html, following.anchor) : html.length
      if (start < 0 || end <= start) continue
      const fragment = html.slice(start, end)
      const headwords = selectedHeadwordLines(fragment, language)
      if (
        headwords.length !== 1 ||
        !sameSpelling(cleanWiktionaryHtml(headwords[0].headword[2]), requestedWord)
      )
        continue
      for (const definition of fragment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
        if (!/\bclass=["'][^"']*\bform-of-definition\b/.test(definition[1])) continue
        const linkMarker = definition[1].search(
          /<(?:span|i)\b[^>]*class=["'][^"']*\bform-of-definition-link\b/i
        )
        if (linkMarker < 0) continue
        const prefix = cleanWiktionaryHtml(definition[1].slice(0, linkMarker))
        if (!/^(?:(?:[\p{L}\p{M}ō -]+)\s+)?(?:romanization|transcription) of$/iu.test(prefix))
          continue
        const target = balancedElement(definition[1], linkMarker)
        if (!target) continue
        if (attribute(target.attributes, 'lang') === language) {
          targets.push(...scriptLink(target.body, language, 'en'))
        } else {
          for (const term of target.body.matchAll(/<(i|b|span)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
            if (attribute(term[2], 'lang') === language)
              targets.push(...scriptLink(term[3], language, 'en'))
          }
        }
      }
    }
  }
  return normalizeScriptTargets(targets)
}

/** Lookup relationships are extracted only from the selected language's lexical markup. */
export function extractWiktionaryLookup(
  html: string,
  sections: readonly WiktionaryTocSection[],
  heading: string,
  word: string
): SourceData['lookup'] {
  const language = languageFromName(heading)
  const selected = languageFragment(html, sections, heading)
  if (!language || !selected) return undefined
  const fragment = selected.html
  const readings = new Set<string>()
  const boundHeadwords = selectedHeadwordLines(fragment, language).filter(({ headword }) =>
    sameSpelling(cleanWiktionaryHtml(lexicalSpellingHtml(headword[2])), word)
  )
  const boundHeadword = boundHeadwords[0]
  // Identity requires a single lemma, but lookup must retain independent senses
  // even when a sibling history or definition describes an inflected form.
  const hasIndependentEntry = boundHeadwords.some(({ start }) => {
    const body = fragment.slice(start).split(/<h[1-6]\b/i)[0]
    const opening = body.match(/<ol\b[^>]*>/i)
    const list = opening && balancedElement(body, opening.index!)
    if (!list) return false
    let consumed = 0
    for (const item of list.body.matchAll(/<li\b[^>]*>/gi)) {
      if (item.index < consumed) continue
      const definition = balancedElement(list.body, item.index)
      if (!definition) continue
      consumed = definition.end
      const gloss = definition.body.split(/<(?:ul|ol|dl)\b/i)[0]
      if (!/\bform-of-definition\b/.test(gloss) && cleanWiktionaryHtml(gloss)) return true
    }
    return false
  })
  const transliteration = headwordTransliteration(fragment, word)
  if (transliteration) readings.add(transliteration)
  if (language === 'ja' && /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(word))
    readings.add(word)
  const targets: NonNullable<SourceData['lookup']>['targets'] = extractWiktionaryRomanizations(
    html,
    sections,
    word
  )
    .filter((target) => target.language === language)
    .map((target) => ({ ...target, relationship: 'romanization' }))
  let incomplete = false
  for (const table of language === 'ja' ? japaneseSeeEntries(fragment, 'en') : []) {
    if (!sameSpelling(table.subject ?? '', word)) continue
    incomplete ||= table.targets.length !== table.targetCount
    targets.push(
      ...table.targets.map((target) => ({ ...target, relationship: 'spelling' as const }))
    )
  }
  for (const definition of fragment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    if (!boundHeadword) break
    if (!/\bform-of-definition\b/.test(definition[1])) continue
    const marker = definition[1].search(
      /<(?:span|i)\b[^>]*class=["'][^"']*\bform-of-definition-link\b/i
    )
    if (marker < 0) continue
    const prefix = cleanWiktionaryHtml(definition[1].slice(0, marker))
    if (
      !/\b(?:imperative|inflection|conjugation|form|past|plural|participle|stem)\b.*\bof$/i.test(
        prefix
      )
    )
      continue
    const link = balancedElement(definition[1], marker)
    if (!link) continue
    const linked = scriptLink(link.body, language, 'en')
    targets.push(...linked.map((target) => ({ ...target, relationship: 'form' as const })))
  }
  // A conjugation table belongs to this lemma; example sentences and glosses do not.
  const forms = new Set<string>()
  for (const section of sections) {
    if (!boundHeadword) break
    if (!/^(?:Conjugation|Inflection|Declension)$/i.test(cleanHeading(section.line))) continue
    const start = anchorOffset(html, section.anchor)
    if (start < selected.start || start >= selected.start + fragment.length) continue
    const following = sections
      .slice(sections.indexOf(section) + 1)
      .find((next) => headingLevel(next) <= headingLevel(section))
    const end = following ? anchorOffset(html, following.anchor) : selected.start + fragment.length
    const body = html.slice(start, Math.min(end, selected.start + fragment.length))
    for (const cell of body.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      let consumed = 0
      for (const opening of cell[1].matchAll(/<(?:span|i|b)\b([^>]*)>/gi)) {
        if (opening.index < consumed || attribute(opening[1], 'lang') !== language) continue
        const term = balancedElement(cell[1], opening.index)
        if (!term) continue
        consumed = term.end
        // Table line breaks separate alternatives; ordinary whitespace can belong
        // to a phrase. Footnote numbers annotate forms, never the query spelling.
        const lexical = lexicalSpellingHtml(term.body).replace(
          /<sup\b([^>]*)>([\s\S]*?)<\/sup>/gi,
          (markup, attributes: string, content: string) =>
            hasClass(attributes, 'reference') ||
            /^[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]+$/.test(cleanWiktionaryHtml(content))
              ? ''
              : markup
        )
        for (const alternative of lexical.split(/<br\b[^>]*>/i)) {
          const form = cleanWiktionaryHtml(alternative.replace(/\s+/g, ' ')).replace(
            /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/u,
            ''
          )
          if (form) forms.add(form)
        }
      }
    }
  }
  const headwordBody = boundHeadword
    ? fragment.slice(boundHeadword.start).split(/<h[1-6]\b/i)[0]
    : ''
  const listOpening = headwordBody.match(/<ol\b[^>]*>/i)
  const definitions = listOpening && balancedElement(headwordBody, listOpening.index!)
  const definition = definitions?.body
    .match(/<li\b[^>]*>([\s\S]*?)<\/li>/i)?.[1]
    .split(/<(?:ul|ol|dl)\b/i)[0]
  return {
    readings: [...readings],
    hasIndependentEntry,
    meaning:
      definition && !/form-of-definition/.test(definition)
        ? cleanWiktionaryHtml(definition)
        : undefined,
    targets,
    forms: [...forms],
    incomplete,
  }
}

export function extractWiktionarySpellingRedirect(
  html: string,
  sections: readonly WiktionaryTocSection[],
  languageHeading: string,
  requestedWord: string,
  edition = 'en'
): SourceData['spellingRedirect'] {
  const language = languageFromName(languageHeading)
  const selected = languageFragment(html, sections, languageHeading)
  if (!language || !selected) return undefined
  const fragment = selected.html
  const headings = [...fragment.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((heading) =>
    cleanWiktionaryHtml(heading[1])
  )
  if (
    headings.filter((heading) => /^Etymology(?:\s+\d+)?$/i.test(heading)).length > 1 ||
    headings.some((heading) => /^Romanization$/i.test(heading))
  )
    return undefined
  const tables = language === 'ja' ? japaneseSeeEntries(fragment, edition) : []
  if (tables.length) {
    const table = tables[0]
    let outside = fragment.slice(0, table.start) + fragment.slice(table.end)
    for (const marker of [...outside.matchAll(/<span\b([^>]*)>/gi)].reverse()) {
      if (!hasClass(marker[1], 'mw-editsection')) continue
      const element = balancedElement(outside, marker.index)
      if (element) outside = outside.slice(0, marker.index) + outside.slice(element.end)
    }
    outside = outside
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, ' ')
    if (
      tables.length !== 1 ||
      table.targetCount !== 1 ||
      table.targets.length !== 1 ||
      !sameSpelling(table.subject ?? '', requestedWord) ||
      !/\bsee the following entry\.$/i.test(table.header) ||
      cleanWiktionaryHtml(outside)
    )
      return undefined
    const target = table.targets[0]
    return sameSpelling(target.word, requestedWord) ? undefined : { ...target, kind: 'spelling' }
  }
  if (/\bja-see\b/.test(fragment)) return undefined
  const headwords = selectedHeadwordLines(fragment, language)
  if (
    headwords.length !== 1 ||
    !sameSpelling(cleanWiktionaryHtml(lexicalSpellingHtml(headwords[0].headword[2])), requestedWord)
  )
    return undefined
  const definitions: string[] = []
  let consumed = 0
  for (const opening of fragment.matchAll(/<ol\b([^>]*)>/gi)) {
    if (opening.index < consumed || hasClass(opening[1], 'references')) continue
    const list = balancedElement(fragment, opening.index)
    if (!list) return undefined
    consumed = list.end
    let previous = 0
    for (const item of list.body.matchAll(/<li\b[^>]*>/gi)) {
      if (item.index < previous) continue
      const definition = balancedElement(list.body, item.index)
      if (!definition) return undefined
      previous = definition.end
      definitions.push(definition.body)
    }
  }
  if (definitions.length !== 1) return undefined
  const definition = definitions[0]
  const marker = definition.search(/<(?:span|i)\b[^>]*class=["'][^"']*\bform-of-definition-link\b/i)
  if (marker < 0) return undefined
  const kind = cleanWiktionaryHtml(definition.slice(0, marker)).match(
    /^(misspelling|(?:alternative|alternate) spelling) of$/i
  )?.[1]
  const target = balancedElement(definition, marker)
  if (!kind || !target || cleanWiktionaryHtml(definition.slice(target.end)).replace(/\./g, ''))
    return undefined
  const terms = [...target.body.matchAll(/<(span|i|b)\b([^>]*\blang=["'][^"']+["'][^>]*)>/gi)]
  if (
    terms.length !== 1 ||
    attribute(terms[0][2], 'lang') !== language ||
    [...target.body.matchAll(/<a\b/gi)].length !== 1
  )
    return undefined
  const targets = scriptLink(target.body, language, edition)
  return targets.length === 1 && !sameSpelling(targets[0].word, requestedWord)
    ? { ...targets[0], kind: /^misspelling$/i.test(kind) ? 'misspelling' : 'spelling' }
    : undefined
}

export function isWiktionarySpellingLemma(
  html: string,
  sections: readonly WiktionaryTocSection[],
  languageHeading: string,
  requestedWord: string,
  resolvedWord: string
): boolean {
  const language = languageFromName(languageHeading)
  const selected = languageFragment(html, sections, languageHeading)
  if (!language || !selected || !sameSpelling(requestedWord, resolvedWord)) return false
  const fragment = selected.html
  if (/\bja-see\b/.test(fragment)) return false
  const headings = [...fragment.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
  if (
    headings.filter((heading) => /^Etymology(?:\s+\d+)?$/i.test(cleanWiktionaryHtml(heading[1])))
      .length > 1 ||
    headings.some((heading) => /^Romanization$/i.test(cleanWiktionaryHtml(heading[1])))
  )
    return false
  const headwords = selectedHeadwordLines(fragment, language)
  if (
    headwords.length !== 1 ||
    !sameSpelling(cleanWiktionaryHtml(lexicalSpellingHtml(headwords[0].headword[2])), requestedWord)
  )
    return false
  const owner = headings.findLastIndex((heading) => heading.index < headwords[0].start)
  if (
    owner < 0 ||
    !/^(?:Noun|Verb|Adjective|Adverb|Pronoun|Interjection|Conjunction|Preposition|Postposition|Determiner|Particle|Numeral|Proper noun)$/i.test(
      cleanWiktionaryHtml(headings[owner][1])
    )
  )
    return false
  const body = fragment.slice(headwords[0].start, headings[owner + 1]?.index)
  const opening = body.match(/<ol\b[^>]*>/i)
  const list = opening && balancedElement(body, opening.index!)
  if (!list || /\bform-of-definition\b/.test(list.body)) return false
  let definitions = 0
  let consumed = 0
  for (const item of list.body.matchAll(/<li\b[^>]*>/gi)) {
    if (item.index < consumed) continue
    const definition = balancedElement(list.body, item.index)
    if (!definition || !cleanWiktionaryHtml(definition.body)) return false
    consumed = definition.end
    definitions++
  }
  return definitions > 0
}

function affirmativeOriginPrefix(prefix: string, pattern: RegExp): boolean {
  const clause = prefix.split(/[.!?]/).at(-1) ?? ''
  // Term markup also appears in rejected analyses and quoted comparisons. Only
  // the publisher's affirmative local assertion can establish a relation.
  if (
    /\b(?:not|never|neither|without|unrelated|compar(?:e[ds]?|ison)|unlike|rather than|instead of|mistaken(?:ly)?|incorrect(?:ly)?|wrong(?:ly)?|fals(?:e|ely)|\w+n['’]t)\b/i.test(
      clause
    ) ||
    /["“”‘]|(?:^|[\s(])'/.test(clause)
  )
    return false
  return pattern.test(clause)
}

/** Read explicit term formulas before cleaning removes language and phrase boundaries. */
function etymologyRelations(html: string, subject: LexemeRef): SourceLexicalRelation[] {
  const relations: SourceLexicalRelation[] = []
  for (const paragraph of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const body = paragraph[1]
    const snippet = cleanWiktionaryHtml(body)
    const terms = [
      ...body.matchAll(/<(i|span)\b([^>]*\blang=["'][^"']+["'][^>]*)>([\s\S]*?)<\/\1>/gi),
    ].flatMap((match) => {
      const code = match[2].match(/\blang=["']([^"']+)["']/i)?.[1]
      const language = code ? languageFromName(code) : undefined
      const word = cleanWiktionaryHtml(lexicalSpellingHtml(match[3]))
      if (!language || !word) return []
      return [
        {
          lexeme: { word, language: LANGUAGES[language].englishName },
          start: match.index!,
          end: match.index! + match[0].length,
        },
      ]
    })
    let compoundSubject = subject
    for (const term of terms) {
      const prefix = cleanWiktionaryHtml(body.slice(0, term.start))
      if (
        affirmativeOriginPrefix(prefix, /\b(?:clipping|shortening) of(?: earlier)?$/i) &&
        term.lexeme.language === subject.language
      ) {
        relations.push({ subject, target: term.lexeme, relation: 'derived_from', snippet })
        compoundSubject = term.lexeme
        break
      }
    }
    for (let index = 0; index < terms.length - 1; index += 1) {
      const first = terms[index]
      const prefix = cleanWiktionaryHtml(body.slice(0, first.start))
      if (
        !affirmativeOriginPrefix(
          prefix,
          /\b(?:compound(?:ed)?(?:\s+(?:of|from))?|derived from|analy[sz]able as|formed from)\b[^.!?]*$/i
        )
      )
        continue
      const components = [first]
      let last = index
      while (last + 1 < terms.length) {
        const between = cleanWiktionaryHtml(body.slice(terms[last].end, terms[last + 1].start))
        if (!/\+/.test(between) || /[.!?;]/.test(between)) break
        components.push(terms[last + 1])
        last += 1
      }
      if (components.length < 2) continue
      for (const component of components) {
        relations.push({
          subject: compoundSubject,
          target: component.lexeme,
          relation: 'compound_from',
          snippet,
        })
      }
      index = last
    }
    // A tagged phrase is one lexical donor even when its words have separate links.
    for (const term of terms) {
      const prefix = cleanWiktionaryHtml(body.slice(0, term.start))
      if (
        affirmativeOriginPrefix(
          prefix,
          /\b(?:derive[ds]?|derived|borrowed)\s+from\s+(?:the\s+)?[\p{L}-]+\s+phrase$/iu
        )
      ) {
        relations.push({ subject, target: term.lexeme, relation: 'derived_from', snippet })
      }
    }
  }
  return relations
}

/**
 * Extracts independent entry groups from one explicitly selected language.
 *
 * Numbered etymology headings are group boundaries. Other headings remain
 * structured sections inside the current group, including same-level native
 * edition headings such as a noun entry followed by an inflected-form entry.
 * Native Japanese labelled homographs (名詞:橋, 名詞:箸) own their nested
 * etymology sections. Ordinary POS sections alone do not establish different
 * origins.
 */
export function extractWiktionaryEntryGroups(
  html: string,
  sections: readonly WiktionaryTocSection[],
  languageHeading: string,
  etymologyHeading: RegExp,
  requestedWord?: string,
  pageIdentity?: { title: string; edition: string }
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

  const nativeJapanese = pageIdentity?.edition === 'ja' && languageHeading === '日本語'
  const nativeEntryIndexes = nativeJapanese
    ? sections.flatMap((section, index) =>
        index > languageIndex &&
        index < languageEndIndex &&
        headingLevel(section) === languageLevel + 1 &&
        /^(?:名詞|動詞|形容詞|形容動詞|副詞|感動詞|接辞|接頭辞|接尾辞|造語成分)(?:\s*[:：]\s*\S.*)?$/u.test(
          cleanHeading(section.line)
        )
          ? [index]
          : []
      )
    : []
  const homographIndexes =
    nativeEntryIndexes.some((index) => /[:：]/u.test(cleanHeading(sections[index].line))) ||
    (nativeEntryIndexes.length &&
      etymologyIndexes.some((index) => headingLevel(sections[index]) > languageLevel + 1))
      ? nativeEntryIndexes
      : []
  const groupIndexes = homographIndexes.length
    ? [
        ...homographIndexes,
        ...etymologyIndexes.filter((index) => headingLevel(sections[index]) === languageLevel + 1),
      ].sort((a, b) => a - b)
    : etymologyIndexes.length
      ? etymologyIndexes
      : [languageIndex]
  const selectedLanguage = languageFromName(languageHeading)
  const languageStart = anchorOffset(html, language.anchor)
  const headwordLines = selectedLanguage
    ? selectedHeadwordLines(html.slice(languageStart, languageEndOffset), selectedLanguage)
    : []
  // A validated page title can identify one displayed, vocalized headword locally.
  // Multiple headword lines require exact identity rather than diacritic folding.
  const boundHeadword =
    requestedWord &&
    pageIdentity &&
    sameSpelling(pageIdentity.title, requestedWord) &&
    headwordLines.length === 1
      ? cleanWiktionaryHtml(lexicalSpellingHtml(headwordLines[0].headword[2]))
      : undefined

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
    let counterparts =
      requestedWord && selectedLanguage
        ? headwordCounterparts(
            fragment,
            requestedWord,
            selectedLanguage,
            pageIdentity?.edition ?? 'en',
            boundHeadword
          )
        : []
    const assignedSections = sections.slice(groupIndex + 1, nextGroupIndex)
    if (
      selectedLanguage === 'ja' &&
      requestedWord &&
      ((pageIdentity && sameSpelling(pageIdentity.title, requestedWord)) ||
        selectedHeadwordLines(fragment, 'ja').some(({ headword }) =>
          sameSpelling(cleanWiktionaryHtml(lexicalSpellingHtml(headword[2])), requestedWord)
        ))
    ) {
      const variantHtml = groupIndexes.length === 1 ? html.slice(languageStart, end) : fragment
      const variantSections =
        groupIndexes.length === 1
          ? sections.slice(languageIndex, nextGroupIndex)
          : [{ ...group, line: languageHeading }, ...assignedSections]
      counterparts = normalizeScriptTargets(
        extractWiktionaryVariants(
          variantHtml,
          variantSections,
          languageHeading,
          pageIdentity?.edition ?? 'en'
        )
          .filter(({ url }) => languageFromName(new URL(url).hash.slice(1)) === 'ja')
          .map(({ word }) => ({ word, language: 'ja' }))
      ).filter((target) => !sameSpelling(target.word, requestedWord))
    }
    const firstSectionOffset = assignedSections.length
      ? anchorOffset(html, assignedSections[0].anchor)
      : end
    const etymologyHtml = etymologyIndexes.includes(groupIndex)
      ? html
          .slice(start, firstSectionOffset > start ? firstSectionOffset : end)
          .replace(/^[\s\S]*?<\/h[1-6]>/i, '')
      : nativeJapanese && homographIndexes.includes(groupIndex)
        ? assignedSections
            .flatMap((section, index) => {
              if (!matchesHeading(etymologyHeading, section.line)) return []
              const sectionStart = anchorOffset(html, section.anchor)
              const next = assignedSections[index + 1]
              const sectionEnd = next ? anchorOffset(html, next.anchor) : end
              return sectionStart >= 0 && sectionEnd > sectionStart
                ? [html.slice(sectionStart, sectionEnd).replace(/^[\s\S]*?<\/h[1-6]>/i, '')]
                : []
            })
            .join('\n') || undefined
        : undefined
    const relations =
      requestedWord && etymologyHtml
        ? (nativeJapanese ? japaneseEtymologyRelations : etymologyRelations)(
            nativeJapanese ? cleanWiktionaryHtml(etymologyHtml) : etymologyHtml,
            {
              word: requestedWord,
              language: nativeJapanese ? 'Japanese' : lexicalLanguageName(languageHeading),
            }
          )
        : []

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
        ...(counterparts.length ? { counterparts } : {}),
        ...(relations.length ? { relations } : {}),
        ...(etymologyHtml !== undefined
          ? { etymologyText: cleanWiktionaryHtml(etymologyHtml) }
          : {}),
        text: cleanWiktionaryHtml(fragment),
        sections: structuredSections,
      },
    ]
  })
}

/** Only explicit spelling variants and pronunciation/definition redirects admit links. */
export function extractWiktionaryVariants(
  html: string,
  sections: readonly WiktionaryTocSection[],
  languageHeading: string,
  edition = 'en'
): Array<{ word: string; relationship: 'spelling-variant' | 'redirect'; url: string }> {
  const selected = languageFragment(html, sections, languageHeading)
  if (!selected) return []
  const { start, html: fragment } = selected
  const variants = new Map<
    string,
    { word: string; relationship: 'spelling-variant' | 'redirect'; url: string }
  >()
  const addJapaneseSpellings = (body: string) => {
    for (const term of body.matchAll(
      /<(span|i|b)\b([^>]*\blang=["']ja["'][^>]*)>([\s\S]*?)<\/\1>/gi
    )) {
      for (const target of scriptLink(term[3], 'ja', edition)) {
        variants.set(target.word, {
          word: target.word,
          relationship: 'spelling-variant',
          url: new URL(
            `/wiki/${encodeURIComponent(target.word)}#Japanese`,
            `https://${edition}.wiktionary.org`
          ).toString(),
        })
      }
    }
  }
  if (comparableHeading(languageHeading) === 'japanese') {
    for (const table of fragment.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)) {
      if (hasClass(table[1], 'ja-see')) continue
      const header = table[2].match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)
      if (!header || !/^Alternative spellings$/i.test(cleanWiktionaryHtml(header[1]))) continue
      for (const cell of table[2]
        .slice(header.index! + header[0].length)
        .matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)) {
        addJapaneseSpellings(cell[1])
      }
    }
    for (const table of japaneseSeeEntries(fragment, edition)) {
      for (const target of table.targets) {
        variants.set(target.word, {
          word: target.word,
          relationship: 'redirect',
          url: `https://${edition}.wiktionary.org/wiki/${encodeURIComponent(target.word)}#Japanese`,
        })
      }
    }
  }
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
    if (
      comparableHeading(languageHeading) === 'japanese' &&
      localHeading &&
      /^Alternative spellings?$/i.test(cleanHeading(localHeading.line))
    ) {
      addJapaneseSpellings(body)
    }
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
