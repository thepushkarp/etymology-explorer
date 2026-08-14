import type { LexemeCandidate, SourceData } from '@/lib/types'
import type { WiktionaryEntryGroup } from '@/lib/wiktionaryEntryGroups'

const ETYMOLOGY_HEADING = /^(?:Etymology|語源)(?:\s*\d+)?$/i
const STRATUM_PATTERNS = [
  ['native', /\bNative Japanese\b|和語/iu],
  ['sino-japanese', /\bSino-Japanese\b|漢語/iu],
  ['loanword', /\bloanword\b|外来語|借用/iu],
  ['hybrid', /\bhybrid\b|混種語/iu],
  ['wasei', /\bwasei\b|和製/iu],
] as const

function isEtymologyGroup(group: WiktionaryEntryGroup): boolean {
  return ETYMOLOGY_HEADING.test(group.heading)
}

/**
 * Convert only explicit Japanese etymology groups into synthesis evidence.
 * The shared extractor returns a lexical fallback when a page has no
 * etymology heading; Japanese rejects that fallback so dictionary definitions
 * cannot accidentally authorize origin claims.
 */
export function adaptJapaneseWiktionaryEvidence(
  source: SourceData | null,
  edition: 'en' | 'ja',
  candidate?: LexemeCandidate
): SourceData | null {
  if (!source?.entryGroups?.length) return null
  const etymologyGroups = source.entryGroups.filter(isEtymologyGroup)
  const glossTokens = (candidate?.gloss.toLowerCase().match(/[a-z]{3,}/g) ?? []).slice(0, 5)
  const scored = etymologyGroups.map((group, ordinal) => ({
    group,
    ordinal,
    score: glossTokens.filter((token) => group.text.toLowerCase().includes(token)).length,
  }))
  const bestScore = Math.max(0, ...scored.map(({ score }) => score))
  const selected = bestScore > 0 ? scored.filter(({ score }) => score === bestScore) : scored
  const groups = selected.map(({ group, ordinal }) => {
    const text = group.text.slice(0, 4500)
    return {
      evidenceScopeId: `wiktionary:${edition}:${group.index || ordinal + 1}`,
      homographOrdinal: ordinal,
      homograph: group.heading,
      number: group.number,
      text,
      sectionHeadings: group.sections.map((section) => section.heading).slice(0, 16),
      lexicalStrata: STRATUM_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
        ([label]) => label
      ),
      hasHistoricalSpelling: /historical spelling|旧字体|歴史的仮名遣|古形/iu.test(text),
      hasSoundChange: /sound change|音変化|連濁|rendaku|促音|音便/iu.test(text),
      hasSourceLoan: /borrowed from|loanword|借用|外来語|語源/iu.test(text),
    }
  })
  if (groups.length === 0) return null
  return { ...source, text: JSON.stringify({ edition, etymologies: groups }) }
}

/** Keep the native-edition family on the same numbered homograph selected by
 * the English edition when both pages expose parallel numbered histories. */
export function alignJapaneseWiktionaryFamilies(
  english: SourceData | null,
  native: SourceData | null
): SourceData | null {
  if (!english || !native) return native
  try {
    const englishPayload = JSON.parse(english.text) as {
      etymologies?: Array<{ homographOrdinal?: number }>
    }
    const nativePayload = JSON.parse(native.text) as {
      edition: string
      etymologies?: Array<{ homographOrdinal?: number }>
    }
    if (englishPayload.etymologies?.length !== 1 || !nativePayload.etymologies?.length) {
      return native
    }
    const ordinal = englishPayload.etymologies[0].homographOrdinal
    const aligned = nativePayload.etymologies.filter(
      (etymology) => etymology.homographOrdinal === ordinal
    )
    return aligned.length > 0
      ? { ...native, text: JSON.stringify({ ...nativePayload, etymologies: aligned }) }
      : native
  } catch {
    return native
  }
}
