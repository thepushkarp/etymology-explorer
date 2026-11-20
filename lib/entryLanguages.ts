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
import { canonicalizeWord, initialCapitalTitle } from './orthography'
import { normalizeScriptTargets } from './scriptTargets'
import type { ScriptTarget } from './types'
import {
  cacheSource,
  getCachedSource,
  getCachedWiktionaryToc,
  type WiktionaryToc,
} from './sourceCache'
import { extractWiktionaryLanguage, fetchWiktionaryPage, wiktionaryPageToc } from './wiktionary'
import { comparableHeading } from './wiktionaryEntryGroups'

export interface EntryLanguages {
  languages: LanguageCode[]
  otherLanguages: string[]
  otherScripts?: ScriptTarget[]
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
  async function pageToc(title: string, edition: string): Promise<WiktionaryToc | null> {
    const cached = await getCachedWiktionaryToc(title, edition)
    if (cached) return cached
    try {
      const page = await fetchWiktionaryPage(title, edition, session.signal, {
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
              title,
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
        title,
        safeError(error)
      )
      incomplete = true
      return null
    }
  }
  const editionNames = [
    ...new Set([
      'en',
      ...candidates.flatMap((language) => {
        const native = LANGUAGES[language].nativeWiktionary
        return native ? [native.edition] : []
      }),
    ]),
  ]
  const capital = initialCapitalTitle(normalized)
  const tables: { edition: string; title: string; toc: WiktionaryToc | null }[] = []
  // Reserve the ordinary pages first when the resolution budget is tight.
  for (const title of capital ? [normalized, capital] : [normalized]) {
    tables.push(
      ...(await Promise.all(
        editionNames.map(async (edition) => ({
          edition,
          title,
          toc: await pageToc(title, edition),
        }))
      ))
    )
  }
  const englishToc = tables.find((row) => row.edition === 'en' && row.title === normalized)?.toc
  const languages = candidates.filter((language) => {
    const definition = LANGUAGES[language]
    return (
      language === hint ||
      tables.some(({ edition, toc }) => {
        const heading =
          edition === 'en'
            ? definition.englishWiktionaryHeading
            : edition === definition.nativeWiktionary?.edition
              ? definition.nativeWiktionary.heading
              : undefined
        return (
          heading &&
          toc?.nonemptyHeadings.some(
            (name) => comparableHeading(name) === comparableHeading(heading)
          )
        )
      })
    )
  })
  if (!languages.length && !hint && detectScripts(normalized).includes('Latin'))
    languages.push('en')
  // A manual hint admits specialist-only words, while tab order remains registry-defined.
  if (hint && candidates.includes(hint) && !languages.includes(hint)) languages.push(hint)
  languages.sort((a, b) => LANGUAGES[a].priority - LANGUAGES[b].priority)
  const supportedHeadings = new Set(
    SUPPORTED_LANGUAGE_CODES.map((code) =>
      comparableHeading(LANGUAGES[code].englishWiktionaryHeading)
    )
  )
  const romanizations = detectScripts(normalized).includes('Latin')
    ? normalizeScriptTargets(englishToc?.otherScripts)
    : []
  // Cached redirect proof can enrich offers. Live alternative verification
  // belongs to the explicit-search batch, after this entry's primary research.
  const writtenForms = await Promise.allSettled(
    romanizations.map(async (target) => {
      const heading = LANGUAGES[target.language].englishWiktionaryHeading
      const key = `wiktionaryLanguage:${encodeURIComponent(heading)}` as const
      const source = await getCachedSource(key, target.word)
      const redirects = source?.variants?.filter((variant) => variant.relationship === 'redirect')
      return redirects?.length === 1 ? [{ word: redirects[0].word, language: target.language }] : []
    })
  )
  session.signal?.throwIfAborted()
  const redirects: ScriptTarget[] = []
  for (const outcome of writtenForms) {
    if (outcome.status === 'fulfilled') redirects.push(...outcome.value)
    else {
      console.error('[Research] Romanization redirect lookup failed:', safeError(outcome.reason))
    }
  }
  const otherScripts = normalizeScriptTargets([...romanizations, ...redirects])
  return {
    languages,
    otherLanguages: [
      ...new Set(
        tables.filter((row) => row.edition === 'en').flatMap((row) => row.toc?.headings ?? [])
      ),
    ].filter((heading) => !supportedHeadings.has(comparableHeading(heading))),
    ...(otherScripts.length ? { otherScripts } : {}),
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
