import { LANGUAGES, type BetaLanguageCode } from './languages'
import type { ResearchEntryContext, SourceData } from './types'

interface WikidataText {
  language?: string
  value?: string
}

interface WikidataEntity {
  id?: string
  lemmas?: Record<string, WikidataText>
  forms?: Array<{ representations?: Record<string, WikidataText> }>
}

interface WikidataPayload {
  entities?: Record<string, WikidataEntity>
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase()
}

function stableToken(value: string): string {
  let hash = 0x811c9dc5
  for (const character of value.normalize('NFKC')) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function historyIdentity(parts: string[]): { id: string; evidenceScopeId: string } {
  const token = stableToken(parts.join('\u001f'))
  return { id: `history:${token}`, evidenceScopeId: `scope:${token}` }
}

function selectedValue(
  values: Record<string, WikidataText> | undefined,
  language: BetaLanguageCode
): string | null {
  const match = Object.values(values ?? {}).find(
    (value) => value.language?.toLocaleLowerCase().split('-')[0] === language && value.value
  )
  return match?.value ?? null
}

function wikidataIdentities(
  source: SourceData | null,
  word: string,
  language: BetaLanguageCode
): { queryIsLemma: boolean; formTargets: string[] } {
  if (!source) return { queryIsLemma: false, formTargets: [] }
  try {
    const payload = JSON.parse(source.text) as WikidataPayload
    const normalizedWord = normalize(word)
    let queryIsLemma = false
    const formTargets = new Set<string>()
    for (const entity of Object.values(payload.entities ?? {})) {
      const lemma = selectedValue(entity.lemmas, language)
      if (!lemma) continue
      if (normalize(lemma) === normalizedWord) queryIsLemma = true
      const queryIsForm = (entity.forms ?? []).some(
        (form) => normalize(selectedValue(form.representations, language) ?? '') === normalizedWord
      )
      if (queryIsForm && normalize(lemma) !== normalizedWord) formTargets.add(lemma)
    }
    return { queryIsLemma, formTargets: [...formTargets] }
  } catch {
    return { queryIsLemma: false, formTargets: [] }
  }
}

function containsWholeLexeme(text: string, lexeme: string): boolean {
  const target = normalize(lexeme)
  return normalize(text)
    .split(/[^\p{L}\p{N}_-]+/u)
    .includes(target)
}

function matchingEtymologyLine(preamble: string, heading: string): string | null {
  const marker = `(${normalize(heading)})`
  return (
    preamble
      .split('\n')
      .find((line) => normalize(line).startsWith(marker))
      ?.trim() ?? null
  )
}

function numberedPreambleBlocks(preamble: string): Array<{ heading: string; text: string }> {
  const lines = preamble.split('\n')
  const starts = lines.flatMap((line, index) => {
    const match = line.match(/^\s*-?\s*([^:\n]{2,60}\(\d+(?:\s*[-–]\s*\d+)?\)):\s*$/u)
    return match ? [{ index, heading: match[1].trim() }] : []
  })
  if (starts.length < 2) return []
  return starts.map((start, index) => ({
    heading: start.heading,
    text: lines
      .slice(start.index, starts[index + 1]?.index ?? lines.length)
      .join('\n')
      .trim(),
  }))
}

/**
 * Derives history boundaries from source structure and structured Wikidata
 * lemma/form identity. Localized headings are retained only as display
 * metadata; they never decide whether an entry is a form.
 */
export function deriveEntryContexts(
  word: string,
  language: BetaLanguageCode,
  sourceName: 'wiktionaryEnglish' | 'wiktionaryNative',
  source: SourceData | null,
  wikidata: SourceData | null
): ResearchEntryContext[] {
  if (!source) return []
  const identity = wikidataIdentities(wikidata, word, language)
  const groups = source.entryGroups ?? []
  const contexts: ResearchEntryContext[] = []

  for (const group of groups) {
    const formSections = identity.formTargets.flatMap((target) => {
      const matches = group.sections.filter((section) => containsWholeLexeme(section.text, target))
      if (matches.length === 0) return []
      // One structured form target is one lexical history even when several
      // headings mention it (definition, pronunciation, derived terms, etc.).
      const section =
        matches.find((candidate) =>
          sourceName === 'wiktionaryEnglish'
            ? /\b(?:plural|singular|form|inflection) of\b/i.test(candidate.text)
            : LANGUAGES[language].formHeading.test(candidate.heading)
        ) ?? matches[0]
      return [{ section, target }]
    })

    const firstSectionOffset = Math.min(
      ...group.sections
        .map((section) => group.text.indexOf(section.text))
        .filter((offset) => offset >= 0),
      group.text.length
    )
    const preamble = group.text.slice(0, firstSectionOffset)
    const numberedBlocks = numberedPreambleBlocks(preamble)
    const lemmaSections = group.sections.filter(
      (section) =>
        !formSections.some((form) => form.section.index === section.index) &&
        matchingEtymologyLine(preamble, section.heading)
    )

    if (numberedBlocks.length >= 2) {
      for (const block of numberedBlocks) {
        const entryIdentity = historyIdentity([
          language,
          word,
          sourceName,
          group.anchor,
          block.heading,
          'lemma',
        ])
        contexts.push({
          id: entryIdentity.id,
          source: sourceName,
          heading: block.heading,
          text: block.text,
          sectionHeadings: [block.heading],
          evidenceScopeId: entryIdentity.evidenceScopeId,
          sourceUrl: source.url,
          entryKind: identity.queryIsLemma ? 'lemma' : 'unresolved',
        })
      }
    } else if (lemmaSections.length >= 2) {
      for (const section of lemmaSections) {
        const entryIdentity = historyIdentity([
          language,
          word,
          sourceName,
          group.anchor,
          section.anchor,
          'lemma',
        ])
        contexts.push({
          id: entryIdentity.id,
          source: sourceName,
          heading: section.heading,
          text: `${matchingEtymologyLine(preamble, section.heading)}\n${section.text}`,
          sectionHeadings: section.path,
          evidenceScopeId: entryIdentity.evidenceScopeId,
          sourceUrl: source.url,
          entryKind: identity.queryIsLemma ? 'lemma' : 'unresolved',
        })
      }
    } else {
      let lemmaText = group.text
      for (const { section } of formSections) lemmaText = lemmaText.replace(section.text, '').trim()
      if (lemmaText || (formSections.length === 0 && identity.queryIsLemma)) {
        const entryIdentity = historyIdentity([language, word, sourceName, group.anchor, 'lemma'])
        contexts.push({
          id: entryIdentity.id,
          source: sourceName,
          heading: group.heading,
          text: lemmaText || group.text,
          sectionHeadings: group.sections
            .filter((section) => !formSections.some((form) => form.section.index === section.index))
            .map((section) => section.heading),
          evidenceScopeId: entryIdentity.evidenceScopeId,
          sourceUrl: source.url,
          entryKind: identity.queryIsLemma ? 'lemma' : 'unresolved',
        })
      }
    }

    for (const { section, target } of formSections) {
      const entryIdentity = historyIdentity([
        language,
        word,
        sourceName,
        group.anchor,
        section.anchor,
        'form',
        target,
      ])
      contexts.push({
        id: entryIdentity.id,
        source: sourceName,
        heading: section.heading,
        text: section.text,
        sectionHeadings: section.path,
        evidenceScopeId: entryIdentity.evidenceScopeId,
        sourceUrl: source.url,
        entryKind: 'form',
        formOf: { word: target, language },
      })
    }
  }

  if (contexts.length > 0) return contexts.slice(0, 4)
  const fallbackIdentity = historyIdentity([language, word, sourceName, 'selected-language'])
  return [
    {
      id: fallbackIdentity.id,
      source: sourceName,
      heading: word,
      text: source.text,
      sectionHeadings: [],
      evidenceScopeId: fallbackIdentity.evidenceScopeId,
      sourceUrl: source.url,
      entryKind: identity.queryIsLemma ? 'lemma' : 'unresolved',
    },
  ]
}
