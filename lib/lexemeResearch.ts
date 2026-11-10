import { CONFIG } from './config'
import { parseDictionaryText } from './etymologyParser'
import { fetchEtymonlineOutcome, parseRecoveredEtymonline } from './etymonline'
import { fetchIncelsWikiOutcome } from './incelsWiki'
import { fetchSelectedWiktionaryLanguage, fetchWiktionary } from './wiktionary'
import { fetchWikipedia } from './wikipedia'
import {
  fetchDicionarioAberto,
  fetchEnglishWiktionaryLanguage,
  fetchFreeDictionaryApi,
  fetchNativeWiktionary,
  fetchWikidataLexeme,
} from './multilingualSources'
import { SPECIALIST_PROVIDERS, parseDiscoveredSpecialist } from './specialistSources'
import { HISTORICAL_SOURCES } from './historicalSources'
import { LANGUAGES, languageFromName, lexicalLanguageName, type LanguageCode } from './languages'
import { canonicalizeWord } from './orthography'
import { sourceFamily } from './sourceProviders'
import { sourceEvidenceRole } from './researchSources'
import { cacheSource, cacheSourceBundle, getCachedSourceBundle } from './sourceCache'
import { createExaSession, type ExaResponse, type ExaDocument } from './exa'
import type { ExaBudgetRedis } from './exaBudget'
import { safeError } from './errorUtils'
import { SourceFetchBudget, SourceFetchBudgetExceeded } from './sourceFetchBudget'
import type {
  LexemeRef,
  SourceData,
  SourceFetchOutcome,
  SourceOutcome,
  SourceProviderId,
  SourceRecord,
  StreamEvent,
} from './types'

const SPECIALIST_DOMAINS: Record<LanguageCode, readonly string[]> = {
  en: ['www.etymonline.com', 'ahdictionary.com'],
  it: ['dizionario.internazionale.it'],
  es: ['dle.rae.es', 'www.asale.org'],
  fr: ['www.cnrtl.fr', 'www.dictionnaire-academie.fr'],
  pt: ['dicionario.priberam.org', 'michaelis.uol.com.br'],
}
const HISTORICAL_DOMAINS: Record<string, readonly string[]> = {
  'Old English': ['bosworthtoller.com'],
  Latin: ['logeion.uchicago.edu'],
  'Ancient Greek': ['logeion.uchicago.edu'],
}
const EXA_DOMAINS = [
  ...new Set([
    ...Object.values(SPECIALIST_DOMAINS).flat(),
    ...Object.values(HISTORICAL_DOMAINS).flat(),
  ]),
]

export interface LexemeLookupResult {
  lexeme: LexemeRef
  sources: SourceRecord[]
  outcomes: Array<{ source: string; outcome: SourceOutcome }>
  incomplete: boolean
}

interface SourceJob {
  id: string
  core?: boolean
  run(): Promise<{ records: SourceRecord[]; outcome: SourceOutcome }>
}

interface LookupOptions {
  primary?: boolean
  skipOptionalSources?: boolean
  /** Core dictionary evidence can start CPU/LLM root extraction while other sources finish. */
  onCore?: (sources: SourceRecord[]) => void
}

export function researchLexemeKey(lexeme: LexemeRef): string {
  return `${lexicalLanguageName(lexeme.language)}:${canonicalizeWord(lexeme.word)}`
}

function record(provider: SourceProviderId, data: SourceData): SourceRecord {
  return {
    provider,
    sourceFamily: data.sourceFamily ?? sourceFamily(provider),
    data,
    evidenceRole: data.evidenceRole,
  }
}

function found(records: SourceRecord[]): { records: SourceRecord[]; outcome: SourceOutcome } {
  return { records, outcome: { status: records.length ? 'found' : 'no_evidence' } }
}

function outcomeResult(provider: SourceProviderId, outcome: SourceFetchOutcome) {
  if (outcome.status === 'found') return found([record(provider, outcome.data)])
  return { records: [], outcome }
}

function classifyFailure(error: unknown): SourceOutcome {
  if (error instanceof SourceFetchBudgetExceeded)
    return { status: 'budget_skipped', reason: error.message }
  const reason = safeError(error)
  const httpStatus = Number(reason.match(/(?:HTTP|returned|error:)\s*(\d{3})/i)?.[1]) || undefined
  return {
    status: httpStatus === 403 ? 'blocked' : httpStatus === 404 ? 'not_found' : 'unavailable',
    reason,
    httpStatus,
  }
}

function hasEtymologicalText(records: SourceRecord[]): boolean {
  return records.some((source) => {
    if (sourceEvidenceRole(source) !== 'etymology') return false
    const texts = source.data.entryGroups?.length
      ? source.data.entryGroups.map((group) => group.text)
      : [source.data.text]
    return texts.some(
      (text) =>
        parseDictionaryText(text, source.data.requestedWord ?? '', source.provider).links.length >
          0 ||
        /\b(?:from|borrowed from|derived from|inherited from|equivalent to|compound of|dal latino|del latín|do latim|du latin|emprunté|derivato|derivado)\s+[\p{L}*]|\b(?:lat|gr|germ)\.\s+\p{L}/iu.test(
          text
        )
    )
  })
}

/** A verified exact entry URL can supply context without inventing source-local histories. */
function discoveredContext(lexeme: LexemeRef, document: ExaDocument): SourceRecord | undefined {
  if (
    /cloudflare|verify you are human|access denied|no word definition found|verbete não foi encontrado/i.test(
      document.text
    )
  )
    return
  let url: URL
  try {
    url = new URL(document.url)
  } catch {
    return
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return
  const language = languageFromName(lexeme.language)
  let provider: SourceProviderId | undefined
  let form: string | undefined
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return
  }
  if (language === 'en' && url.hostname === 'ahdictionary.com' && path === '/word/search.html') {
    provider = 'americanHeritage'
    form = url.searchParams.get('q') ?? undefined
  }
  if (language === 'it' && url.hostname === 'dizionario.internazionale.it') {
    provider = 'deMauro'
    form = /^\/parola\/(.+)$/.exec(path)?.[1].replace(/_\d+$/, '')
  }
  if (language === 'es' && url.hostname === 'dle.rae.es') {
    provider = 'dle'
    form = /^\/([^/]+)\/?$/.exec(path)?.[1]
  }
  if (language === 'es' && url.hostname === 'www.asale.org') {
    provider = 'americanismos'
    form = /^\/damer\/([^/]+)\/?$/.exec(path)?.[1]
  }
  if (language === 'pt' && url.hostname === 'dicionario.priberam.org') {
    provider = 'priberam'
    form = /^\/(?:pt-pt\/)?([^/]+)\/?$/.exec(path)?.[1]
  }
  if (language === 'pt' && url.hostname === 'michaelis.uol.com.br') {
    provider = 'michaelis'
    form =
      /^\/moderno-portugues\/busca\/portugues-brasileiro\/([^/]+)\/?$/.exec(path)?.[1] ??
      /^\/palavra\/[^/]+\/([^/]+)\/?$/.exec(path)?.[1].replace(/-\d+$/, '')
  }
  if (!language && url.hostname === 'logeion.uchicago.edu') {
    const heading = lexicalLanguageName(lexeme.language)
    provider = heading === 'Latin' ? 'lewisShort' : heading === 'Ancient Greek' ? 'lsj' : undefined
    form = /^\/([^/]+)\/?$/.exec(path)?.[1]
  }
  if (!provider || !form || canonicalizeWord(form) !== canonicalizeWord(lexeme.word)) return
  const target = canonicalizeWord(lexeme.word)
  const title = canonicalizeWord(document.title ?? '')
  const titleMatches =
    title === target ||
    (title.startsWith(target) && /^[\s|:;>(–—-]/.test(title.slice(target.length)))
  const headingMatches = document.text
    .split('\n')
    .some(
      (line) => canonicalizeWord(line.replace(/<[^>]*>/g, '').replace(/^#{1,6}\s*/, '')) === target
    )
  if (!titleMatches && !headingMatches) return
  return record(provider, {
    text: document.text,
    url: document.url,
    requestedWord: lexeme.word,
    resolvedWord: lexeme.word,
    lexicalLanguage: lexicalLanguageName(lexeme.language),
    evidenceRole: 'context',
  })
}

/** One session shares transport, source promises, and Exa allowance across every lexical purpose. */
export function createLexemeResearchSession(options: {
  budget: SourceFetchBudget
  signal?: AbortSignal
  onProgress?: (event: StreamEvent) => void
  exaBudgetClient?: ExaBudgetRedis | null
}) {
  const { budget, signal } = options
  const memo = new Map<string, Promise<LexemeLookupResult>>()
  const fetchMemo = new Map<string, Promise<unknown>>()
  function fetchOnce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = fetchMemo.get(key)
    if (existing) return existing as Promise<T>
    const pending = (async () => budget.run(fetcher))()
    fetchMemo.set(key, pending)
    // Rejections remain memoized: every subscriber observes the same source attempt.
    void pending.catch(() => {})
    return pending
  }
  let etymonlineBlocked = false
  let recoveryPages = 0
  const exa = createExaSession({
    allowedDomains: EXA_DOMAINS,
    sourceBudget: budget,
    signal,
    budgetClient: options.exaBudgetClient,
  })
  const emit = (event: StreamEvent) => {
    try {
      options.onProgress?.(event)
    } catch (error) {
      console.error('[Research] Progress callback failed:', safeError(error))
    }
  }

  function jobs(lexeme: LexemeRef, settings: LookupOptions): SourceJob[] {
    const language = languageFromName(lexeme.language)
    const heading = lexicalLanguageName(lexeme.language)
    const word = canonicalizeWord(lexeme.word)
    const general: SourceJob[] = []
    const simple = (
      id: SourceProviderId,
      fetcher: () => Promise<SourceData | null>,
      core = false
    ): SourceJob => ({
      id,
      core,
      run: async () => {
        const data = await fetcher()
        return found(data ? [record(id, { ...data, lexicalLanguage: heading })] : [])
      },
    })
    if (language === 'en') {
      general.push(
        simple(
          'wiktionary',
          () =>
            fetchOnce(`wiktionaryLanguage:English:${word}`, () =>
              fetchWiktionary(word, signal, { retryTransient: !settings.primary, fetchOnce })
            ),
          true
        )
      )
      general.push({
        id: 'etymonline',
        core: true,
        run: async () => {
          const outcome = await fetchEtymonlineOutcome(word, signal, {
            skipDirect: etymonlineBlocked,
          })
          if (outcome.status === 'blocked') etymonlineBlocked = true
          return outcomeResult('etymonline', outcome)
        },
      })
    } else if (language) {
      general.push(
        simple(
          'wiktionaryEnglish',
          () =>
            fetchOnce(`wiktionaryLanguage:${heading}:${word}`, () =>
              fetchEnglishWiktionaryLanguage(word, language, signal, { fetchOnce })
            ),
          true
        )
      )
      if (LANGUAGES[language].nativeWiktionary)
        general.push(
          simple(
            'wiktionaryNative',
            () =>
              fetchOnce(`wiktionaryNative:${language}:${word}`, () =>
                fetchNativeWiktionary(word, language, signal, { fetchOnce })
              ),
            true
          )
        )
    } else {
      general.push(
        simple(
          'wiktionary',
          () =>
            fetchOnce(`wiktionaryLanguage:${heading}:${word}`, () =>
              fetchSelectedWiktionaryLanguage(word, heading, signal, {
                retryTransient: true,
                fetchOnce,
              })
            ),
          true
        )
      )
    }
    if (!settings.skipOptionalSources) {
      if (!language || LANGUAGES[language].wikipediaEdition)
        general.push(simple('wikipedia', () => fetchWikipedia(word, signal, language ?? 'en')))
      if (language === 'en')
        general.push({
          id: 'incelsWiki',
          run: async () => outcomeResult('incelsWiki', await fetchIncelsWikiOutcome(word, signal)),
        })
    }
    if (language && language !== 'en') {
      if (LANGUAGES[language].wikidataEntity)
        general.push(simple('wikidataLexeme', () => fetchWikidataLexeme(word, language, signal)))
      if (language === 'pt')
        general.push(simple('dicionarioAberto', () => fetchDicionarioAberto(word, signal)))
    }
    const specialized: SourceJob[] = language
      ? SPECIALIST_PROVIDERS.filter((provider) => provider.languages.includes(language)).map(
          (provider) => ({
            id: provider.id,
            run: async () => {
              const cached = await getCachedSourceBundle(provider.id, word, heading)
              if (cached) return found(cached)
              const records = await provider.fetch(word, signal)
              await cacheSourceBundle(provider.id, word, heading, records)
              return found(records)
            },
          })
        )
      : HISTORICAL_SOURCES.filter((provider) => provider.languages.includes(heading)).map(
          (provider) => ({
            id: provider.id,
            run: async () => {
              const cached = await getCachedSourceBundle(provider.id, word, heading)
              if (cached) return found(cached)
              const data = await provider.fetch(word, signal)
              const records = data ? [record(provider.id, data)] : []
              await cacheSourceBundle(provider.id, word, heading, records)
              return found(records)
            },
          })
        )
    // Interleave source groups before network dispatch; no language gets an arbitrary dictionary cap.
    return general
      .flatMap((job, index) => [job, ...(specialized[index] ? [specialized[index]] : [])])
      .concat(specialized.slice(general.length))
  }

  async function runJob(lexeme: LexemeRef, job: SourceJob, primary: boolean) {
    const start = Date.now()
    const language = languageFromName(lexeme.language)
    if (primary) emit({ type: 'source_started', source: job.id, language })
    let result: { records: SourceRecord[]; outcome: SourceOutcome }
    try {
      signal?.throwIfAborted()
      const budgetWasExhausted = budget.exhausted
      result = await budget.run(job.run)
      if (!result.records.length && budgetWasExhausted)
        result.outcome = {
          status: 'budget_skipped',
          reason: 'Source HTTP request budget exhausted',
        }
      signal?.throwIfAborted()
    } catch (error) {
      signal?.throwIfAborted()
      const outcome = classifyFailure(error)
      result = {
        records: [],
        outcome: {
          ...outcome,
          reason: `${job.id} lookup for ${lexeme.language}:${lexeme.word}: ${outcome.reason}`,
        },
      }
    }
    if (primary) {
      if (result.records.length)
        emit({
          type: 'source_complete',
          language,
          source: job.id,
          timing: Date.now() - start,
          preview: result.records[0].data.text.slice(0, 100),
        })
      emit({
        type: 'source_outcome',
        language,
        source: job.id,
        outcome: result.outcome,
        timing: Date.now() - start,
      })
    }
    return result
  }

  function addRecords(result: LexemeLookupResult, records: SourceRecord[]) {
    for (const source of records) {
      if (
        !result.sources.some(
          (existing) =>
            existing.provider === source.provider && existing.data.url === source.data.url
        )
      )
        result.sources.push(source)
    }
  }

  function recoveryOutcome(response: ExaResponse): SourceOutcome {
    return response.status === 'success'
      ? {
          status: 'no_evidence',
          reason: 'Retrieved content did not establish the requested entry boundaries',
        }
      : {
          status:
            response.status === 'skipped' &&
            /^(source_budget|request_limit|content_limit|search_limit|budget_exhausted|budget_stopped)$/.test(
              response.reason
            )
              ? 'budget_skipped'
              : 'unavailable',
          reason: response.reason,
          httpStatus: response.httpStatus,
        }
  }

  async function recover(results: LexemeLookupResult[], settings: LookupOptions) {
    const blocked = results.filter((result) =>
      result.outcomes.some(
        (entry) => entry.source === 'etymonline' && entry.outcome.status === 'blocked'
      )
    )
    if (!blocked.length) return
    const admitted = blocked.slice(0, Math.max(0, CONFIG.exa.maxContentPages - recoveryPages))
    for (const skipped of blocked.slice(admitted.length))
      skipped.outcomes.push({
        source: 'etymonlineRecovery',
        outcome: { status: 'budget_skipped', reason: 'content_limit' },
      })
    if (!admitted.length) return
    recoveryPages += admitted.length
    const urls = admitted.map(
      (result) =>
        `https://www.etymonline.com/word/${encodeURIComponent(canonicalizeWord(result.lexeme.word))}`
    )
    const response = await exa.contents(urls)
    for (const result of admitted) {
      let outcome = recoveryOutcome(response)
      if (response.status === 'success') {
        const document = response.documents.find(
          (item) =>
            item.url ===
            `https://www.etymonline.com/word/${encodeURIComponent(canonicalizeWord(result.lexeme.word))}`
        )
        const data = document && parseRecoveredEtymonline(result.lexeme.word, document)
        if (data) {
          data.retrieval = {
            method: 'exa',
            retrievedAt: new Date().toISOString(),
            requestId: response.requestId,
            cacheStatus: response.statuses.find((item) => item.id === document.url)?.source,
          }
          addRecords(result, [record('etymonline', data)])
          await cacheSource('etymonline', result.lexeme.word, data)
          outcome = { status: 'found' }
        }
      }
      result.outcomes.push({ source: 'etymonlineRecovery', outcome })
      if (settings.primary && outcome.status === 'found')
        emit({
          type: 'source_outcome',
          language: languageFromName(result.lexeme.language),
          source: 'etymonline',
          outcome,
        })
    }
  }

  async function discover(result: LexemeLookupResult, settings: LookupOptions) {
    if (hasEtymologicalText(result.sources)) return
    const heading = lexicalLanguageName(result.lexeme.language)
    const language = languageFromName(result.lexeme.language)
    const domains = language
      ? SPECIALIST_DOMAINS[language]
      : heading === 'Latin' || heading === 'Ancient Greek'
        ? HISTORICAL_DOMAINS[heading]
        : []
    if (!domains.length) return
    const cached = await getCachedSourceBundle('discovery', result.lexeme.word, heading)
    if (cached) {
      addRecords(result, cached)
      return
    }
    const response = await exa.search(
      `Dictionary etymology and historical origin of the exact ${heading} word "${result.lexeme.word}"; separate homographs and cite attested source forms.`,
      domains
    )
    const records: SourceRecord[] = []
    if (response.status === 'success') {
      for (const document of response.documents) {
        if (language === 'en') {
          const data = parseRecoveredEtymonline(result.lexeme.word, document)
          if (data) records.push(record('etymonline', data))
        }
        const parsed = language
          ? parseDiscoveredSpecialist(result.lexeme.word, language, document)
          : []
        records.push(...parsed)
        if (!parsed.length) {
          const context = discoveredContext(result.lexeme, document)
          if (context) records.push(context)
        }
      }
      for (const source of records)
        source.data.retrieval = {
          method: 'exa',
          retrievedAt: new Date().toISOString(),
          requestId: response.requestId,
          cacheStatus: response.statuses.find((item) => item.id === source.data.url)?.source,
        }
      addRecords(result, records)
      await cacheSourceBundle('discovery', result.lexeme.word, heading, records)
    }
    const outcome = records.length ? { status: 'found' as const } : recoveryOutcome(response)
    result.outcomes.push({ source: 'discovery', outcome })
    if (settings.primary && records.length)
      for (const source of records)
        emit({ type: 'source_outcome', language, source: source.provider, outcome })
  }

  async function lookupMany(
    lexemes: LexemeRef[],
    settings: LookupOptions = {}
  ): Promise<LexemeLookupResult[]> {
    const fresh: Array<{
      key: string
      result: LexemeLookupResult
      jobs: SourceJob[]
      pending: Array<Promise<{ records: SourceRecord[]; outcome: SourceOutcome }>>
      resolve: (result: LexemeLookupResult) => void
      reject: (error: unknown) => void
    }> = []
    for (const lexeme of lexemes) {
      const key = researchLexemeKey(lexeme)
      if (memo.has(key)) continue
      let resolve!: (value: LexemeLookupResult) => void
      let reject!: (error: unknown) => void
      const promise = new Promise<LexemeLookupResult>((res, rej) => {
        resolve = res
        reject = rej
      })
      // The caller below observes all failures, including a cancellation before another wave joins.
      void promise.catch(() => {})
      memo.set(key, promise)
      fresh.push({
        key,
        result: { lexeme, sources: [], outcomes: [], incomplete: false },
        jobs: jobs(lexeme, settings),
        pending: [],
        resolve,
        reject,
      })
    }
    try {
      // Admit the same provider position across all lexemes before moving to the next position.
      const width = Math.max(0, ...fresh.map((entry) => entry.jobs.length))
      for (let index = 0; index < width; index++)
        for (const entry of fresh) {
          const job = entry.jobs[index]
          if (job)
            entry.pending[index] = runJob(entry.result.lexeme, job, Boolean(settings.primary))
        }
      const core = Promise.all(
        fresh.map(async (entry) => {
          const outcomes = await Promise.all(
            entry.jobs.flatMap((job, index) => (job.core ? [entry.pending[index]] : []))
          )
          return outcomes.flatMap((outcome) => outcome.records)
        })
      ).then((records) => settings.onCore?.(records.flat()))
      void core.catch(() => {})
      await Promise.all(
        fresh.map(async (entry) => {
          const outcomes = await Promise.all(entry.pending)
          outcomes.forEach((outcome, index) => {
            addRecords(entry.result, outcome.records)
            entry.result.outcomes.push({ source: entry.jobs[index].id, outcome: outcome.outcome })
          })
          const language = languageFromName(entry.result.lexeme.language)
          if (
            language &&
            LANGUAGES[language].freeDictionary &&
            !entry.result.sources.some((source) =>
              ['wiktionary', 'wiktionaryEnglish', 'wiktionaryNative'].includes(source.provider)
            )
          ) {
            const fallback = await runJob(
              entry.result.lexeme,
              {
                id: 'multilingualDictionary',
                run: async () => {
                  const data = await fetchFreeDictionaryApi(
                    entry.result.lexeme.word,
                    language,
                    signal
                  )
                  return found(data ? [record('multilingualDictionary', data)] : [])
                },
              },
              Boolean(settings.primary)
            )
            addRecords(entry.result, fallback.records)
            entry.result.outcomes.push({
              source: 'multilingualDictionary',
              outcome: fallback.outcome,
            })
          }
        })
      )
      await core
      await recover(
        fresh.map((entry) => entry.result),
        settings
      )
      // A deterministic queue gives the query, then earlier ancestor lexemes, first access to discovery.
      for (const entry of fresh) await discover(entry.result, settings)
      for (const entry of fresh) {
        signal?.throwIfAborted()
        entry.result.incomplete =
          entry.result.sources.some((source) => source.data.incomplete) ||
          entry.result.outcomes.some(
            ({ source, outcome }) =>
              source !== 'discovery' &&
              ['blocked', 'unavailable', 'budget_skipped'].includes(outcome.status) &&
              !(
                source === 'etymonline' &&
                entry.result.sources.some((record) => record.provider === 'etymonline')
              )
          )
        entry.resolve(entry.result)
      }
    } catch (error) {
      for (const entry of fresh) entry.reject(error)
      throw error
    }
    return Promise.all(lexemes.map((lexeme) => memo.get(researchLexemeKey(lexeme))!))
  }

  return {
    fetchOnce,
    signal,
    getBudget: () => budget,
    lookupMany,
    lookup: async (lexeme: LexemeRef, settings?: LookupOptions) =>
      (await lookupMany([lexeme], settings))[0],
  }
}

export type LexemeResearchSession = ReturnType<typeof createLexemeResearchSession>
