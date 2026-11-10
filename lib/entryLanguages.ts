import { CONFIG } from './config'
import { safeError } from './errorUtils'
import {
  LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  candidateLanguages,
  detectScripts,
  type LanguageCode,
} from './languages'
import type { LexemeResearchSession } from './lexemeResearch'
import { canonicalizeWord } from './orthography'
import { cacheSource, getCachedWiktionaryToc, type WiktionaryToc } from './sourceCache'
import { extractWiktionaryLanguage, fetchWiktionaryPage, wiktionaryPageToc } from './wiktionary'

export interface EntryLanguages {
  languages: LanguageCode[]
  otherLanguages: string[]
  /** A failed page lookup cannot establish that its languages are absent. */
  incomplete?: boolean
}

/** Resolve source-attested languages without memoizing a reduced lexeme lookup. */
async function resolveLanguages(
  word: string,
  session: LexemeResearchSession,
  hint?: LanguageCode
): Promise<EntryLanguages> {
  const normalized = canonicalizeWord(word)
  const candidates = candidateLanguages(normalized)
  if (!candidates.length) return { languages: [], otherLanguages: [] }
  let incomplete = false
  const editions = new Map<string, Promise<WiktionaryToc | null>>()
  const pageToc = (edition: string): Promise<WiktionaryToc | null> => {
    const existing = editions.get(edition)
    if (existing) return existing
    const pending = (async () => {
      const cached = await getCachedWiktionaryToc(normalized, edition)
      if (cached) return cached
      try {
        const page = await fetchWiktionaryPage(normalized, edition, session.signal, {
          fetchOnce: session.fetchOnce,
        })
        if (!page) return { headings: [], nonemptyHeadings: [] }
        // Full lookups share the extracted sections as well as the raw request promise.
        await Promise.all(
          candidates.map(async (language) => {
            const definition = LANGUAGES[language]
            const heading =
              edition === 'en'
                ? definition.englishWiktionaryHeading
                : definition.nativeWiktionary?.edition === edition
                  ? definition.nativeWiktionary.heading
                  : undefined
            if (!heading) return
            const data = extractWiktionaryLanguage(page, heading, edition)
            if (data)
              await cacheSource(
                edition === 'en'
                  ? `wiktionaryLanguage:${encodeURIComponent(heading)}`
                  : 'wiktionaryNative',
                normalized,
                data,
                undefined,
                edition === 'en' ? 'en' : language
              )
          })
        )
        return wiktionaryPageToc(page)
      } catch (error) {
        session.signal?.throwIfAborted()
        console.error(
          '[Research] Language resolution failed for %s:%s:',
          edition,
          normalized,
          safeError(error)
        )
        incomplete = true
        return null
      }
    })()
    editions.set(edition, pending)
    return pending
  }
  const english = pageToc('en')
  const native = await Promise.all(
    candidates.map(async (language) => {
      const edition = LANGUAGES[language].nativeWiktionary?.edition
      return [language, edition ? await pageToc(edition) : null] as const
    })
  )
  const englishToc = await english
  const languages = candidates.filter((language) => {
    const definition = LANGUAGES[language]
    return (
      language === hint ||
      englishToc?.nonemptyHeadings.includes(definition.englishWiktionaryHeading) ||
      native
        .find(([code]) => code === language)?.[1]
        ?.nonemptyHeadings.includes(definition.nativeWiktionary?.heading ?? '')
    )
  })
  if (!languages.length && !hint && detectScripts(normalized).includes('Latin'))
    languages.push('en')
  // A manual hint admits specialist-only words, while tab order remains registry-defined.
  if (hint && !languages.includes(hint)) languages.push(hint)
  languages.sort((a, b) => LANGUAGES[a].priority - LANGUAGES[b].priority)
  const supportedHeadings = new Set(
    SUPPORTED_LANGUAGE_CODES.map((code) => LANGUAGES[code].englishWiktionaryHeading)
  )
  return {
    languages,
    otherLanguages: englishToc?.headings.filter((heading) => !supportedHeadings.has(heading)) ?? [],
    ...(incomplete ? { incomplete: true } : {}),
  }
}

export function resolveEntryLanguages(
  word: string,
  session: LexemeResearchSession,
  hint?: LanguageCode
): Promise<EntryLanguages> {
  // The phase cap includes redirects while preserving the entry-wide counter for research.
  return session
    .getBudget()
    .runLimited(CONFIG.maxTotalFetches, () => resolveLanguages(word, session, hint))
}
