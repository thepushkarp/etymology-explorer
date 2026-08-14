import { isRomaji, toHiragana, toKatakana, toRomaji } from 'wanakana'
import type { LexemeCandidate, LookupResolution } from '@/lib/types'
import { lookupJmdictKeys, type JmdictEntry } from './dictionary'
import { deinflectJapanese } from './deinflect'

const POS_LABELS: Record<string, string> = {
  n: 'noun',
  'n-adv': 'adverbial noun',
  v1: 'ichidan verb',
  v5u: 'godan verb',
  v5k: 'godan verb',
  v5g: 'godan verb',
  v5s: 'godan verb',
  v5t: 'godan verb',
  v5n: 'godan verb',
  v5b: 'godan verb',
  v5m: 'godan verb',
  v5r: 'godan verb',
  vs: 'suru verb',
  'vs-i': 'suru verb',
  vk: 'kuru verb',
  'adj-i': 'い-adjective',
  'adj-ix': 'irregular い-adjective',
  'adj-na': 'な-adjective',
  adv: 'adverb',
  int: 'interjection',
  exp: 'expression',
  pn: 'pronoun',
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function expandMacrons(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[āĀ]/g, 'aa')
    .replace(/[īĪ]/g, 'ii')
    .replace(/[ūŪ]/g, 'uu')
    .replace(/[ēĒ]/g, 'ee')
    .replace(/[ōŌ]/g, 'ou')
}

function containsLatin(value: string): boolean {
  return /[A-Za-zĀĪŪĒŌāīūēō]/.test(value)
}

export function romajiToHiragana(value: string): string | null {
  if (!containsLatin(value) || !isRomaji(value.replace(/[\s'-]/g, ''))) return null
  const converted = toHiragana(expandMacrons(value).replace(/[\s'-]/g, ''))
  return /^[\p{Script=Hiragana}ー]+$/u.test(converted) ? converted : null
}

function romajiLookupSurfaces(value: string): string[] {
  const hiragana = romajiToHiragana(value)
  if (!hiragana) return []
  const compact = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s'-]/g, '')
  const longVowels = compact
    .replace(/[āĀ]/g, 'a-')
    .replace(/[īĪ]/g, 'i-')
    .replace(/[ūŪ]/g, 'u-')
    .replace(/[ēĒ]/g, 'e-')
    .replace(/[ōŌ]/g, 'o-')
    .replace(/aa|ii|uu|ee|oo|ou/g, (pair) => `${pair[0]}-`)
  return [...new Set([hiragana, toKatakana(longVowels)])]
}

function canonicalReading(entry: JmdictEntry, lemma: string, matchedReading?: string): string {
  return (entry.r.find(([text]) => normalize(text) === normalize(matchedReading ?? '')) ??
    entry.r.find(
      ([, common, applies]) => common === 1 && (applies.includes('*') || applies.includes(lemma))
    ) ??
    entry.r.find(([, , applies]) => applies.includes('*') || applies.includes(lemma)) ??
    entry.r[0])[0]
}

function canonicalLemma(entry: JmdictEntry, matchedSurface: string): string {
  if (/^[\p{Script=Katakana}ー]+$/u.test(matchedSurface)) return matchedSurface
  return (
    entry.k.find(([, common]) => common === 1)?.[0] ??
    entry.r.find(([, common]) => common === 1)?.[0] ??
    entry.k[0]?.[0] ??
    entry.r[0][0]
  )
}

function partOfSpeech(entry: JmdictEntry): string[] {
  const labels = entry.p.map((tag) => POS_LABELS[tag]).filter((tag): tag is string => Boolean(tag))
  return [...new Set(labels)].slice(0, 3)
}

interface Match {
  key: string
  entry: JmdictEntry
  matchType: LexemeCandidate['matchType']
  explanation: string
  score: number
}

function candidateFromMatch(match: Match, query: string): LexemeCandidate {
  const lemma = canonicalLemma(match.entry, match.key)
  const reading = canonicalReading(
    match.entry,
    lemma,
    match.matchType === 'reading' || match.matchType === 'romaji' ? match.key : undefined
  )
  const common =
    match.entry.k.some(([, flag]) => flag === 1) || match.entry.r.some(([, flag]) => flag === 1)
  return {
    entryId: match.entry.id,
    lemma,
    reading,
    romaji: toRomaji(reading),
    partOfSpeech: partOfSpeech(match.entry),
    gloss: match.entry.g[0] ?? 'Japanese lexical entry',
    common,
    matchType: match.matchType,
    matchExplanation: match.explanation,
    ...(match.matchType === 'inflection' ? { searchedForm: query } : {}),
    alternateForms: [
      ...match.entry.k.map(([text]) => text),
      ...match.entry.r.map(([text]) => text),
    ].filter((form, index, forms) => form !== lemma && forms.indexOf(form) === index),
  }
}

export async function resolveJapaneseLexeme(rawQuery: string): Promise<LookupResolution> {
  const query = normalize(rawQuery)
  if (!query) return { status: 'not_found', query, candidates: [] }

  const romajiSurfaces = romajiLookupSurfaces(query)
  const lookupSurface = romajiSurfaces[0] ?? query
  const deinflections = deinflectJapanese(lookupSurface)
  const exactSurfaces = romajiSurfaces.length > 0 ? romajiSurfaces : [lookupSurface]
  const keys = [...exactSurfaces, ...deinflections.map((candidate) => candidate.lemma)]
  const results = await lookupJmdictKeys(keys)
  const matches: Match[] = []

  for (const surface of exactSurfaces) {
    for (const entry of results.get(surface) ?? []) {
      const exactKanji = entry.k.some(([text]) => normalize(text) === surface)
      matches.push({
        key: surface,
        entry,
        matchType: romajiSurfaces.length > 0 ? 'romaji' : exactKanji ? 'exact' : 'reading',
        explanation:
          romajiSurfaces.length > 0
            ? `romaji for ${surface}`
            : exactKanji
              ? 'exact dictionary spelling'
              : 'dictionary reading',
        score: romajiSurfaces.length > 0 ? 320 : exactKanji ? 400 : 360,
      })
    }
  }

  for (const deinflection of deinflections) {
    for (const entry of results.get(normalize(deinflection.lemma)) ?? []) {
      const expectedAdjective = deinflection.explanation.includes('adjective')
      const expectedSuru = deinflection.explanation.startsWith('suru')
      const posMatches = expectedAdjective
        ? entry.p.includes('adj-i') || entry.p.includes('adj-ix')
        : expectedSuru
          ? entry.p.some((part) => part === 'vs' || part.startsWith('vs-'))
          : entry.p.some((part) => part.startsWith('v'))
      if (!posMatches) continue
      matches.push({
        key: deinflection.lemma,
        entry,
        matchType: 'inflection',
        explanation: deinflection.explanation,
        score: 200 + Math.round(deinflection.confidence * 100),
      })
    }
  }

  const bestById = new Map<string, Match>()
  for (const match of matches) {
    const common =
      match.entry.k.some(([, flag]) => flag === 1) || match.entry.r.some(([, flag]) => flag === 1)
    const score = match.score + (common ? 30 : 0)
    const existing = bestById.get(match.entry.id)
    if (!existing || score > existing.score) bestById.set(match.entry.id, { ...match, score })
  }

  const candidates = [...bestById.values()]
    .sort(
      (left, right) => right.score - left.score || Number(left.entry.id) - Number(right.entry.id)
    )
    .slice(0, 8)
    .map((match) => candidateFromMatch(match, rawQuery.normalize('NFKC').trim()))

  if (candidates.length === 0) return { status: 'not_found', query, candidates: [] }
  const leadingMatch = [...bestById.values()].sort(
    (left, right) => right.score - left.score || Number(left.entry.id) - Number(right.entry.id)
  )
  const decisiveCommonLead =
    candidates.length > 1 &&
    candidates[0].common &&
    !candidates[1].common &&
    leadingMatch[0].score - leadingMatch[1].score >= 25
  if (candidates.length === 1 || decisiveCommonLead) {
    return { status: 'unique', query, candidates: [candidates[0]] }
  }
  return { status: 'ambiguous', query, candidates }
}

export async function resolveJapaneseEntry(
  query: string,
  entryId: string
): Promise<LexemeCandidate | null> {
  const resolution = await resolveJapaneseLexeme(query)
  return resolution.candidates.find((candidate) => candidate.entryId === entryId) ?? null
}

export function selectJapaneseCandidate(
  resolution: LookupResolution,
  entryId: string | null
):
  | { status: 'selected'; candidate: LexemeCandidate }
  | { status: 'selection_required' }
  | { status: 'entry_mismatch' } {
  if (resolution.status === 'not_found') return { status: 'entry_mismatch' }
  if (!entryId && resolution.status === 'ambiguous') return { status: 'selection_required' }
  const candidate = entryId
    ? resolution.candidates.find((entry) => entry.entryId === entryId)
    : resolution.candidates[0]
  return candidate ? { status: 'selected', candidate } : { status: 'entry_mismatch' }
}
