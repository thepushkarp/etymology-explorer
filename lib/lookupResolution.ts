import { toHiragana } from 'wanakana'
import { CONFIG } from './config'
import { LANGUAGES, candidateLanguages, languageFromName, type LanguageCode } from './languages'
import type { LexemeResearchSession } from './lexemeResearch'
import type { LookupCandidate, LookupResolution, SourceData, ScriptTarget } from './types'
import { canonicalizeWord, isValidWord } from './validation'
import { cacheSource, getCachedSource, getCachedWiktionaryToc } from './sourceCache'
import { extractWiktionaryLanguage, fetchWiktionaryPage } from './wiktionary'
import { fetchWithTimeout } from './fetchUtils'
import { proposeLookup } from './lookupFallback'
import { safeError } from './errorUtils'
import { levenshteinDistance } from './spellcheck'

const LATIN = /^[\p{Script=Latin}\p{M}'’ -]+$/u
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u

/** Long vowels generate alternatives, never a globally accent-stripped identity. */
export function japaneseReadings(input: string): string[] {
  const word = canonicalizeWord(input)
  if (KANA.test(word)) return [toHiragana(word)]
  if (!LATIN.test(word)) return []
  const base = word
    .replace(/[āâ]/g, 'aa')
    .replace(/[īî]/g, 'ii')
    .replace(/[ūû]/g, 'uu')
    .replace(/[ēê]/g, 'ee')
  const variants = /[ōô]/.test(base)
    ? [base.replace(/[ōô]/g, 'ou'), base.replace(/[ōô]/g, 'oo')]
    : [base]
  return [
    ...new Set(variants.map((value) => toHiragana(value)).filter((value) => KANA.test(value))),
  ]
}

export async function lookupSource(
  word: string,
  language: LanguageCode,
  session: LexemeResearchSession
): Promise<SourceData | null> {
  const heading = LANGUAGES[language].englishName
  const key = `wiktionaryLanguage:${heading}` as const
  const cached = await getCachedSource(key, word)
  const age = Date.now() - Date.parse(cached?.retrieval?.retrievedAt ?? '')
  if (cached && age >= 0 && age <= CONFIG.sourceCacheTTL * 1000) return cached
  const page = await fetchWiktionaryPage(word, 'en', session.signal, {
    fetchOnce: session.fetchOnce,
  })
  const source = page && extractWiktionaryLanguage(page, heading)
  if (source) await cacheSource(key, word, source)
  return source
}

function provenance(data: SourceData, evidence: string): LookupCandidate['provenance'][number] {
  return {
    sourceUrl: data.url,
    revisionId: data.revisionId,
    verifiedAt: data.retrieval!.retrievedAt,
    evidence,
  }
}

/** Search discovers possible table owners. Only their exact, language-scoped markup is evidence. */
async function discoverForms(word: string, language: LanguageCode, session: LexemeResearchSession) {
  const url = new URL('https://en.wiktionary.org/w/api.php')
  url.search = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: `"${word}" incategory:"${LANGUAGES[language].englishName} verbs"`,
    srlimit: '5',
    format: 'json',
  }).toString()
  const response = await fetchWithTimeout(url, {}, CONFIG.timeouts.source, session.signal)
  if (!response.ok) throw new Error(`Dictionary form discovery HTTP ${response.status}`)
  const payload = await response.json()
  if (!Array.isArray(payload.query?.search))
    throw new Error('Dictionary form discovery returned malformed results')
  return {
    words: payload.query.search
      .map((row: { title: string }) => canonicalizeWord(row.title))
      .filter(isValidWord) as string[],
    more: !!payload.continue,
  }
}

export interface ResolvedLookup {
  preserveExactEntry?: boolean
  resolution?: LookupResolution
  terminal?: SourceData
  originalTargets?: ScriptTarget[]
  verifiedCount?: number
  fallbackAttempted?: boolean
}

/** Verification is bounded across all discovery methods; model output is never evidence. */
export async function resolveLookup(
  word: string,
  session: LexemeResearchSession,
  hint?: LanguageCode
): Promise<ResolvedLookup> {
  const candidates = candidateLanguages(word).filter((code) =>
    ['ja', 'hi', 'ur', 'sa'].includes(code)
  )
  if (hint || candidates.length < 2) return resolveLookupLanguage(word, session, hint)
  // Devanagari alone cannot choose Hindi over Sanskrit. Exact entries take precedence;
  // otherwise both languages share the same four-candidate verification allowance.
  try {
    const exact = await session
      .getBudget()
      .runLimited(Math.max(0, CONFIG.maxTotalFetches - session.getBudget().attempts), () =>
        Promise.all(candidates.map((code) => lookupSource(word, code, session)))
      )
    if (exact.some((data) => data?.entryGroups?.length && !data.lookup?.targets.length)) return {}
  } catch (error) {
    session.signal?.throwIfAborted()
    console.warn('[Lookup] Script language verification unavailable:', safeError(error))
    return {
      resolution: {
        originalInput: word,
        language: candidates[0],
        candidates: [],
        incomplete: true,
      },
    }
  }
  let remaining = 4
  const results: ResolvedLookup[] = []
  let fallbackAttempted = false
  for (const code of candidates) {
    if (!remaining) break
    const result = await resolveLookupLanguage(word, session, code, remaining, !fallbackAttempted)
    fallbackAttempted ||= !!result.fallbackAttempted
    remaining -= result.verifiedCount ?? 0
    results.push(result)
  }
  const verified = results.flatMap((result) => result.resolution?.candidates ?? [])
  const incomplete =
    results.length !== candidates.length || results.some((result) => result.resolution?.incomplete)
  const preserveExactEntry = results.some((result) => result.preserveExactEntry)
  const unique =
    !preserveExactEntry && !incomplete && verified.length === 1
      ? results.find((result) => result.resolution?.selected)
      : undefined
  return {
    preserveExactEntry,
    resolution: {
      originalInput: word,
      language: unique?.resolution?.language ?? candidates[0],
      candidates: verified,
      incomplete,
      selected: unique?.resolution?.selected,
    },
    terminal: unique?.terminal,
  }
}

async function resolveLookupLanguage(
  word: string,
  session: LexemeResearchSession,
  hint?: LanguageCode,
  maximum = 4,
  allowFallback = true
): Promise<ResolvedLookup> {
  const scripts = candidateLanguages(word)
  const language =
    hint && ['ja', 'hi', 'ur', 'sa'].includes(hint)
      ? hint
      : !hint && scripts.length === 1 && ['ja', 'hi', 'ur', 'sa'].includes(scripts[0])
        ? scripts[0]
        : !hint && LATIN.test(word)
          ? 'ja'
          : undefined
  if (!language) return {}
  const resolution: LookupResolution = { originalInput: word, language, candidates: [] }
  let fallbackAttempted = false
  const budget = session.getBudget()
  const run = <T>(fn: () => Promise<T>) =>
    budget.runLimited(Math.max(0, CONFIG.maxTotalFetches - budget.attempts), fn)
  const source = (target: string) => run(() => lookupSource(target, language, session))
  const readings = language === 'ja' ? japaneseReadings(word) : []
  const matchingForms = new Set([word, ...readings])
  const terminals = new Map<string, SourceData>()
  const checked = new Set<string>()
  let preserveLatin = !hint && LATIN.test(word)
  let exact: SourceData | null = null
  let originalTargets: ScriptTarget[] = []
  try {
    exact = await source(word)
    if (
      exact?.spellingLemma ||
      (exact?.entryGroups?.length && !exact.lookup?.targets.length && !LATIN.test(word))
    )
      return {}
    if (LATIN.test(word)) {
      const toc = await getCachedWiktionaryToc(word)
      originalTargets = (toc?.nonemptyHeadings ?? []).flatMap((heading) => {
        const code = languageFromName(heading)
        return code && candidateLanguages(word).includes(code) ? [{ word, language: code }] : []
      })
      if (preserveLatin) {
        if (!originalTargets.length && (await run(() => lookupSource(word, 'en', session))))
          originalTargets.push({ word, language: 'en' })
        preserveLatin = originalTargets.length > 0
        if (preserveLatin && !exact?.lookup?.targets.length) return {}
      }
    }
  } catch (error) {
    session.signal?.throwIfAborted()
    console.warn('[Lookup] Exact source unavailable:', safeError(error))
    return { resolution: { ...resolution, incomplete: true } }
  }
  type Pending = {
    word: string
    relationship: LookupCandidate['relationship']
    proof?: LookupCandidate['provenance']
    depth: number
    discovered?: boolean
  }
  const queue: Pending[] = []
  const addLinks = (
    data: SourceData,
    relationship: LookupCandidate['relationship'],
    proofs: LookupCandidate['provenance'],
    depth: number
  ) => {
    resolution.incomplete ||= data.lookup?.incomplete
    for (const target of data.lookup?.targets ?? []) {
      queue.push({
        word: target.word,
        relationship: target.relationship === 'form' ? 'form' : relationship,
        proof: [
          ...proofs,
          provenance(data, `${data.requestedWord} ${target.relationship} of ${target.word}`),
        ],
        depth,
      })
    }
  }
  if (exact?.lookup?.targets.length)
    addLinks(exact, LATIN.test(word) ? 'romanization' : 'form', [], 0)
  else if (language === 'ja' && LATIN.test(word))
    for (const reading of readings)
      queue.push({ word: reading, relationship: 'romanization', depth: 0 })

  const drain = async () => {
    while (queue.length) {
      session.signal?.throwIfAborted()
      const item = queue.shift()!
      const target = canonicalizeWord(item.word)
      if (checked.has(target)) continue
      if (checked.size >= maximum || item.depth > 3) {
        resolution.incomplete = true
        continue
      }
      checked.add(target)
      try {
        const data = await source(target)
        if (!data) {
          if (item.proof?.length || item.discovered) resolution.incomplete = true
          continue
        }
        if (!data.retrieval?.retrievedAt || data.incomplete) {
          resolution.incomplete = true
          continue
        }
        const declared = data.lookup?.readings ?? []
        const readingMatch = declared.some(
          (reading) =>
            canonicalizeWord(reading) === word ||
            (language === 'ja' && japaneseReadings(reading).some((kana) => readings.includes(kana)))
        )
        const form = data.lookup?.forms.find((form) => matchingForms.has(canonicalizeWord(form)))
        const linked = !!item.proof?.length
        const correction =
          item.relationship === 'correction' &&
          Math.min(...[target, ...declared].map((value) => levenshteinDistance(word, value))) <= 2
        if (!linked && !readingMatch && !form && !correction) {
          resolution.incomplete = true
          continue
        }
        const relationship = form ? 'form' : item.relationship
        const proofs = [
          ...(item.proof ?? []),
          provenance(
            data,
            form
              ? `${form} in the inflection table for ${target}`
              : readingMatch
                ? `${target}: ${declared.join(', ')}`
                : `Dictionary entry for ${target}`
          ),
        ]
        if (data.lookup?.targets.length) {
          addLinks(data, relationship, proofs, item.depth + 1)
          if (!data.lookup.hasIndependentEntry) continue
        }
        if (!data.entryGroups?.length) {
          resolution.incomplete = true
          continue
        }
        const candidate: LookupCandidate = {
          word: target,
          language,
          relationship,
          reading: declared[0],
          meaning: data.lookup?.meaning,
          sourceUrl: data.url,
          provenance: proofs,
        }
        resolution.candidates.push(candidate)
        terminals.set(target, data)
      } catch (error) {
        session.signal?.throwIfAborted()
        resolution.incomplete = true
        console.warn('[Lookup] Candidate verification unavailable:', safeError(error))
      }
    }
  }
  await drain()
  const preserveExactEntry = !!exact?.lookup?.hasIndependentEntry
  if (
    !preserveExactEntry &&
    !resolution.candidates.length &&
    checked.size < maximum &&
    !preserveLatin
  ) {
    try {
      const discovered = await run(() => discoverForms(readings[0] ?? word, language, session))
      resolution.incomplete ||= discovered.more || discovered.words.length > maximum - checked.size
      for (const target of discovered.words)
        queue.push({ word: target, relationship: 'form', depth: 0, discovered: true })
      await drain()
    } catch (error) {
      session.signal?.throwIfAborted()
      resolution.incomplete = true
      console.warn('[Lookup] Form discovery unavailable:', safeError(error))
    }
  }
  if (
    !preserveExactEntry &&
    !resolution.candidates.length &&
    checked.size < maximum &&
    !preserveLatin &&
    allowFallback
  ) {
    const proposed = await proposeLookup(word, language, session.signal)
    fallbackAttempted = CONFIG.features.lookupFallback
    // An unverified proposal is neither an absence nor proof of uniqueness.
    for (const candidate of proposed) queue.push({ ...candidate, depth: 0, discovered: true })
    await drain()
    if (CONFIG.features.lookupFallback && !resolution.candidates.length)
      resolution.incomplete = true
  }
  if (
    !preserveExactEntry &&
    !preserveLatin &&
    !resolution.incomplete &&
    resolution.candidates.length === 1 &&
    resolution.candidates[0].relationship !== 'correction'
  ) {
    const target = resolution.candidates[0]
    if (target.relationship === 'form' || terminals.get(target.word)?.spellingLemma)
      resolution.selected = target
  }
  return {
    preserveExactEntry,
    resolution,
    originalTargets,
    verifiedCount: checked.size,
    fallbackAttempted,
    terminal: resolution.selected ? terminals.get(resolution.selected.word) : undefined,
  }
}
