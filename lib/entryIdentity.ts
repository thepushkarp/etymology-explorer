import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { MAX_SPELLING_REDIRECTS, spellingMetadata, type SpellingProof } from './cache'
import { candidateLanguages, type LanguageCode } from './languages'
import type { LexemeResearchSession } from './lexemeResearch'
import { canonicalizeWord, isValidWord } from './validation'
import { cacheSource, getCachedSource } from './sourceCache'
import { extractWiktionaryLanguage, fetchWiktionaryPage } from './wiktionary'
import type { EntrySpelling, SourceData, WordEntry } from './types'

export interface EntryIdentity {
  word: string
  language?: LanguageCode
  spellings: EntrySpelling[]
  proofs: SpellingProof[]
  incomplete?: boolean
}

export async function resolveEntryIdentity(
  word: string,
  session: LexemeResearchSession,
  hint?: LanguageCode,
  saved?: WordEntry
): Promise<EntryIdentity> {
  const requestedWord = canonicalizeWord(word)
  const unchanged: EntryIdentity = { word: requestedWord, spellings: [], proofs: [] }
  const candidates = candidateLanguages(requestedWord)
  if (
    hint
      ? hint !== 'ja' || !candidates.includes('ja')
      : candidates.length !== 1 ||
        candidates[0] !== 'ja' ||
        saved?.languages.some((language) => language !== 'ja')
  )
    return unchanged

  const source = async (current: string): Promise<SourceData | null> => {
    const cached = await getCachedSource('wiktionaryLanguage:Japanese', current)
    const age = Date.now() - Date.parse(cached?.retrieval?.retrievedAt ?? '')
    if (cached && age >= 0 && age <= CONFIG.sourceCacheTTL * 1000) return cached
    const page = await fetchWiktionaryPage(current, 'en', session.signal, {
      fetchOnce: session.fetchOnce,
    })
    const data = page && extractWiktionaryLanguage(page, 'Japanese')
    if (data) await cacheSource('wiktionaryLanguage:Japanese', current, data)
    return data
  }

  return session.getBudget().runLimited(CONFIG.maxTotalFetches, async () => {
    const seen = new Set<string>()
    const hops: Omit<SpellingProof, 'terminal'>[] = []
    let current = requestedWord
    while (true) {
      session.signal?.throwIfAborted()
      if (seen.has(current)) return unchanged
      seen.add(current)
      let data: SourceData | null
      try {
        data = await source(current)
      } catch (error) {
        session.signal?.throwIfAborted()
        console.warn('[EntryIdentity] Source verification unavailable:', safeError(error))
        return { ...unchanged, incomplete: true }
      }
      if (!data) return unchanged
      const redirect = data.spellingRedirect
      if (!redirect) {
        if (!hops.length) return unchanged
        if (!data.spellingLemma || !data.retrieval?.retrievedAt) return unchanged
        const terminal = {
          word: current,
          sourceUrl: data.url,
          revisionId: data.revisionId,
          verifiedAt: data.retrieval.retrievedAt,
        }
        const proofs = hops.map((hop) => ({ ...hop, terminal }))
        return {
          word: current,
          language: 'ja',
          proofs,
          spellings: proofs.map((_proof, index) => spellingMetadata(proofs.slice(index))),
        }
      }
      if (hops.length >= MAX_SPELLING_REDIRECTS) return unchanged
      const targetWord = canonicalizeWord(redirect.word)
      if (
        redirect.language !== 'ja' ||
        !isValidWord(targetWord) ||
        !candidateLanguages(targetWord).includes('ja')
      )
        return unchanged
      const verifiedAt = data.retrieval?.retrievedAt
      if (!verifiedAt || !Number.isFinite(Date.parse(verifiedAt))) return unchanged
      hops.push({
        word: current,
        targetWord,
        language: 'ja',
        kind: redirect.kind,
        sourceUrl: data.url,
        revisionId: data.revisionId,
        verifiedAt,
      })
      current = targetWord
    }
  })
}
