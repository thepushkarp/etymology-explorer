import { beforeEach, expect, mock, spyOn, test } from 'bun:test'
import { NextRequest } from 'next/server'
import * as nextServer from 'next/server'
import { CONFIG } from '@/lib/config'
import type { LanguageCode } from '@/lib/languages'
import type { EtymologyResult, ScriptTarget, WordEntry } from '@/lib/types'
import { etymologyResult } from '@/lib/testSupport/etymologyResult'
import { LookupProposalUnavailable } from '@/lib/lookupFallback'
import type { SourceFetchBudget } from '@/lib/sourceFetchBudget'

// Module mocks stay in a child process so this suite cannot replace cache,
// research, or accounting implementations for unrelated tests.
if (process.env.ENTRY_ROUTE_TEST_WORKER !== '1') {
  test('merged route cache, accounting, refresh, hint, and cancellation boundaries', async () => {
    const child = Bun.spawn([process.execPath, '--no-env-file', 'test', import.meta.path], {
      env: { ...process.env, ENTRY_ROUTE_TEST_WORKER: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(code, stdout + stderr).toBe(0)
  }, 30_000)
} else {
  const { mergeEntrySpellings, hasEntrySpellings, isSpellingEntry } = await import('@/lib/cache')
  let saved: { entry: WordEntry; stale: boolean } | null = null
  let read: ((word: string) => typeof saved) | undefined
  let identityTarget: string | undefined
  let identityIncomplete = false
  let lookupResult: import('@/lib/lookupResolution').ResolvedLookup = {}
  let lookupError: Error | undefined
  let aliasHit: { entry: WordEntry; stale: boolean } | null = null
  let resultWord = 'chat'
  let exclusiveLock = false
  let held = false
  let synthesisGate: Promise<void> | undefined
  let onLockAttempt: ((busy: boolean) => void) | undefined
  let onSynthesisStarted: (() => void) | undefined
  let costMode = 'normal'
  let languages: LanguageCode[] = ['en', 'fr']
  let otherScripts: ScriptTarget[] = []
  let resolutionIncomplete = false
  let failLanguage: LanguageCode | undefined
  let failureMessage = 'Schema validation failed'
  let credible = true
  let researchIncomplete = false
  let rootUsage = false
  let rootError = false
  let writeError = false
  let lock: 'acquired' | 'busy' = 'acquired'
  let promotion: () => Promise<unknown> = async () => ({ status: 'held' })
  const negatives = new Map<LanguageCode | undefined, { otherScripts?: ScriptTarget[] }>()
  const calls = {
    research: 0,
    synthesis: 0,
    writes: 0,
    negative: [] as unknown[],
    spend: [] as unknown[],
    released: 0,
    failure: 0,
    locks: [] as string[],
    reads: 0,
    researchLanguages: [] as LanguageCode[],
    failureMetadata: undefined as unknown,
    published: 0,
    identity: 0,
    budgets: [] as number[],
  }
  const usage = { inputTokens: 10, outputTokens: 5 }
  const result = (language: LanguageCode): EtymologyResult =>
    etymologyResult({ word: resultWord, language, definition: `new ${language}` })
  const entry = (): WordEntry => ({
    word: 'chat',
    languages: ['en', 'fr'],
    entries: { en: result('en'), fr: result('fr') },
    otherLanguages: [],
    tracedAt: '2020-01-01T00:00:00.000Z',
    revision: 0,
    attemptedLanguages: ['en', 'fr'],
  })
  mock.module('next/server', () => ({ ...nextServer, after: () => {} }))
  mock.module('@/lib/env', () => ({ getEnv: () => ({}) }))
  mock.module('@/lib/config', () => ({
    CONFIG: {
      ...CONFIG,
      singleflight: {
        ...CONFIG.singleflight,
        waiterPollIntervalMs: 1,
        unaryWaiterMaxWaitMs: 12,
        streamWaiterMaxWaitMs: 12,
      },
    },
  }))
  mock.module('@/lib/cache', () => ({
    getCachedEntry: async (word: string) => {
      calls.reads++
      return read ? read(word) : saved?.entry.word === word ? saved : null
    },
    getCachedSpellingEntry: async () =>
      aliasHit && { ...aliasHit, word: aliasHit.entry.word, language: 'ja' },
    mergeEntrySpellings,
    hasEntrySpellings,
    isSpellingEntry,
    publishSpellingAliases: async () => {
      calls.published++
    },
    cacheEntry: async (_word: string, value: WordEntry) => {
      calls.writes++
      if (writeError) throw new Error('Cache persistence failed')
      saved = { entry: value, stale: false }
    },
    getNegativeCache: async (_word: string, hint?: LanguageCode) => {
      calls.negative.push(['read', hint])
      return negatives.get(hint) ?? null
    },
    cacheNegative: async (
      _word: string,
      _type: string,
      hint?: LanguageCode,
      offers?: ScriptTarget[]
    ) => {
      calls.negative.push(['write', hint])
      if (!saved) negatives.set(hint, offers?.length ? { otherScripts: offers } : {})
    },
  }))
  mock.module('@/lib/lookupResolution', () => ({
    resolveLookup: async () => {
      if (lookupError) throw lookupError
      return lookupResult
    },
  }))
  mock.module('@/lib/entryIdentity', () => ({
    resolveEntryIdentity: async (word: string) => {
      calls.identity++
      if (!identityTarget || word === identityTarget)
        return { word, spellings: [], proofs: [], incomplete: identityIncomplete }
      resultWord = identityTarget
      return {
        word: identityTarget,
        language: 'ja',
        proofs: [],
        spellings: [
          {
            word,
            language: 'ja',
            kind: 'spelling',
            sourceUrl: 'https://en.wiktionary.org/wiki/' + encodeURIComponent(word),
            verifiedAt: new Date(Date.now()).toISOString(),
          },
        ],
      }
    },
  }))
  mock.module('@/lib/costGuard', () => ({
    getCostMode: async () => costMode,
    recordSpend: async (value: unknown) => {
      calls.spend.push(value)
    },
  }))
  mock.module('@/lib/counters', () => ({
    incrCounter: async () => {},
    incrLanguageCounter: async () => {},
  }))
  mock.module('@/lib/singleflight', () => ({
    tryAcquireLock: async (key: string) => {
      calls.locks.push(key)
      const busy = lock === 'busy' || (exclusiveLock && held)
      onLockAttempt?.(busy)
      if (busy) return { status: 'busy' }
      held = true
      return { status: 'acquired', token: 'token' }
    },
    startLockHeartbeat: () => () => {},
    releaseLock: async () => {
      calls.released++
      held = false
    },
    markLockFailure: async (_key: string, metadata: unknown) => {
      calls.failureMetadata = metadata
      calls.failure++
    },
    attemptPromotion: () => promotion(),
  }))
  mock.module('@/lib/lexemeResearch', () => ({
    createLexemeResearchSession: () => ({ lookupMany: async () => [] }),
  }))
  mock.module('@/lib/entryLanguages', () => ({
    resolveEntryLanguages: async () => ({
      languages,
      otherLanguages: ['Dutch'],
      otherScripts,
      incomplete: resolutionIncomplete,
    }),
  }))
  mock.module('@/lib/research', () => ({
    conductAgenticResearch: async (
      _word: string,
      options: { language: LanguageCode; signal: AbortSignal; budget: SourceFetchBudget }
    ) => {
      calls.research++
      calls.budgets.push(options.budget.maximum)
      calls.researchLanguages.push(options.language)
      options.signal.throwIfAborted()
      if (rootError) throw Object.assign(new Error('Root lookup failed'), { usage })
      return {
        language: options.language,
        incompleteResearch: researchIncomplete,
        llmUsage: rootUsage ? usage : undefined,
      }
    },
    hasCredibleMainSource: () => credible,
  }))
  mock.module('@/lib/llm', () => ({
    getLlmUsageFromError: (error: unknown) => (error as { usage?: unknown })?.usage,
    isTransientSynthesisError: () => false,
    synthesizeFromResearch: async (context: { language: LanguageCode }) => {
      calls.synthesis++
      onSynthesisStarted?.()
      await synthesisGate
      if (context.language === failLanguage) {
        throw Object.assign(new Error(failureMessage), { usage })
      }
      return { result: result(context.language), usage }
    },
  }))
  const { GET } = await import('./route')
  const get = (query = '', signal?: AbortSignal, word = 'chat') =>
    GET(
      new NextRequest('http://localhost/api/etymology?word=' + encodeURIComponent(word) + query, {
        signal,
      })
    )

  beforeEach(() => {
    saved = null
    read = undefined
    identityTarget = undefined
    identityIncomplete = false
    lookupResult = {}
    lookupError = undefined
    calls.budgets = []
    aliasHit = null
    resultWord = 'chat'
    exclusiveLock = held = false
    synthesisGate = undefined
    onLockAttempt = onSynthesisStarted = undefined
    costMode = 'normal'
    calls.identity = 0
    calls.published = 0
    languages = ['en', 'fr']
    otherScripts = []
    resolutionIncomplete = false
    failLanguage = undefined
    failureMessage = 'Schema validation failed'
    credible = true
    researchIncomplete = false
    rootUsage = false
    rootError = false
    writeError = false
    lock = 'acquired'
    promotion = async () => ({ status: 'held' })
    calls.research =
      calls.synthesis =
      calls.writes =
      calls.released =
      calls.failure =
      calls.reads =
        0
    calls.negative = []
    calls.spend = []
    calls.locks = []
    calls.researchLanguages = []
    calls.failureMetadata = undefined
    negatives.clear()
  })

  test.each([
    ['', ['en'], 64],
    ['', ['en', 'fr'], 80],
    ['', ['en', 'fr', 'it'], 96],
    ['&language=en', ['en'], 32],
    ['&language=en', ['en', 'fr'], 48],
  ] as const)(
    'source allowance respects original search mode %s and languages %j',
    async (query, resolved, expected) => {
      languages = [...resolved]
      expect((await get(query)).status).toBe(200)
      expect(calls.budgets).toEqual(resolved.map(() => expected))
    }
  )

  test('optional alternatives do not mark Auto incomplete, but hinted resolution failures do', async () => {
    languages = ['en']
    lookupResult = {
      originalTargets: [{ word: 'chat', language: 'en' }],
      resolution: {
        originalInput: 'chat',
        language: 'ja',
        candidates: [],
        incomplete: true,
      },
    }
    expect((await (await get()).json()).data.incomplete).toBeUndefined()
    saved = null
    languages = ['ja']
    expect((await (await get('&language=ja')).json()).data.incomplete).toBe(true)
  })

  test.each([429, 503] as const)(
    'proposal contention/outage returns retry guidance with SSE parity: %i',
    async (status) => {
      lookupError = new LookupProposalUnavailable(status)
      const response = await get()
      expect(response.status).toBe(status)
      expect(response.headers.get('retry-after')).toBe('5')
      const payload = await response.json()
      const stream = await (await get('&stream=true')).text()
      expect(stream).toContain(payload.error)
      expect(stream).toContain(payload.errorType)
      expect(calls.synthesis).toBe(0)
      expect(calls.negative.some((call) => (call as string[])[0] === 'write')).toBe(false)
    }
  )

  test('form resolution has JSON/SSE parity, shares the lemma lock and never stores the conjugation as a spelling', async () => {
    resultWord = 'たたかう'
    languages = ['ja']
    const candidate = {
      word: resultWord,
      language: 'ja' as const,
      relationship: 'form' as const,
      provenance: [
        {
          sourceUrl: 'https://en.wiktionary.org/wiki/たたかう',
          verifiedAt: new Date().toISOString(),
          evidence: 'たたかえ in conjugation table',
        },
      ],
    }
    lookupResult = {
      resolution: {
        originalInput: 'tatakae',
        language: 'ja',
        candidates: [candidate],
        selected: candidate,
      },
    }
    const first = await (await get('&language=ja', undefined, 'tatakae')).json()
    expect(first.lookupResolution).toEqual(lookupResult.resolution)
    expect(first.data.word).toBe('たたかう')
    expect(first.data.spellings).toEqual([])
    expect(calls.locks).toEqual(['lock:etymology:たたかう'])
    const events = await sseEvents(await get('&language=ja&stream=true', undefined, 'tatakae'))
    expect(events.find((event) => event.type === 'lookup_resolution').resolution).toEqual(
      first.lookupResolution
    )
    expect(events.at(-1).data.word).toBe('たたかう')
    expect(calls.synthesis).toBe(1)
  })

  for (const stream of [false, true]) {
    test(`independent exact entries retain form choices without redirecting (${stream ? 'SSE' : 'JSON'})`, async () => {
      resultWord = 'しろ'
      languages = ['ja']
      lookupResult = {
        preserveExactEntry: true,
        resolution: {
          originalInput: 'しろ',
          language: 'ja',
          candidates: [
            {
              word: 'する',
              language: 'ja',
              relationship: 'form',
              provenance: [
                {
                  sourceUrl: 'https://en.wiktionary.org/wiki/しろ',
                  verifiedAt: new Date().toISOString(),
                  evidence: 'imperative of する',
                },
              ],
            },
          ],
        },
      }
      const response = await get(`&language=ja${stream ? '&stream=true' : ''}`, undefined, 'しろ')
      expect(response.status).toBe(200)
      const payload = stream ? (await sseEvents(response)).at(-1) : await response.json()
      expect(payload.data.word).toBe('しろ')
      expect(payload.data.otherScripts).toContainEqual(
        expect.objectContaining({ word: 'する', language: 'ja' })
      )
      expect(calls.locks).toEqual(['lock:etymology:しろ'])
      expect(calls.synthesis).toBe(1)
    })
  }

  test('ambiguous Japanese choices retain cached English without taking a word lock or synthesizing', async () => {
    const original = entry()
    original.word = 'shiro'
    original.languages = ['en']
    original.entries = { en: etymologyResult({ word: 'shiro', language: 'en' }) }
    original.attemptedLanguages = ['en']
    saved = { entry: original, stale: false }
    const candidates = ['白', '城'].map((word) => ({
      word,
      language: 'ja' as const,
      relationship: 'romanization' as const,
      provenance: [
        {
          sourceUrl: 'https://en.wiktionary.org/wiki/しろ',
          verifiedAt: new Date().toISOString(),
          evidence: 'explicit reading link',
        },
      ],
    }))
    lookupResult = { resolution: { originalInput: 'shiro', language: 'ja', candidates } }
    const response = await get('&language=ja', undefined, 'shiro')
    expect(response.status).toBe(300)
    const payload = await response.json()
    expect(payload.lookupResolution.candidates).toEqual(candidates)
    expect(payload.data.otherScripts.map((target: ScriptTarget) => target.word)).toEqual([
      '白',
      '城',
    ])
    expect(saved.entry).toEqual(original)
    expect(calls.locks).toEqual([])
    expect(calls.synthesis).toBe(0)
  })

  test('deferred dictionary links have JSON/SSE parity without synthesis or alias publication', async () => {
    const sourceListed = [
      {
        word: '橋',
        language: 'ja' as const,
        relationship: 'romanization' as const,
        sourceUrl: 'https://en.wiktionary.org/wiki/はし',
        provenance: [
          {
            sourceUrl: 'https://en.wiktionary.org/wiki/はし',
            verifiedAt: new Date().toISOString(),
            evidence: 'はし spelling of 橋',
          },
        ],
      },
    ]
    lookupResult = {
      resolution: {
        originalInput: 'hashi',
        language: 'ja',
        candidates: [],
        sourceListed,
        incomplete: true,
      },
    }
    const response = await get('&language=ja', undefined, 'hashi')
    expect(response.status).toBe(300)
    const payload = await response.json()
    expect(payload.lookupResolution.sourceListed).toEqual(sourceListed)
    expect(payload.data.otherScripts).toEqual([])
    const events = await sseEvents(await get('&language=ja&stream=true', undefined, 'hashi'))
    expect(events.find((event) => event.type === 'lookup_resolution').resolution).toEqual(
      payload.lookupResolution
    )
    expect(calls.locks).toEqual([])
    expect(calls.synthesis).toBe(0)
    expect(calls.writes).toBe(0)
    expect(calls.published).toBe(0)
    expect(calls.negative.some((item) => (item as string[])[0] === 'write')).toBe(false)
  })

  test('cached aliases precede absence and concurrent spellings share the canonical lock', async () => {
    resultWord = '津波'
    const canonical: WordEntry = {
      ...entry(),
      word: resultWord,
      languages: ['ja'],
      entries: { ja: result('ja') },
    }
    aliasHit = { entry: canonical, stale: false }
    negatives.set('ja', {})
    const warm = await get('&language=ja&stream=true', undefined, 'つなみ')
    const events = (await warm.text())
      .split('\n\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line.slice(6)))
    expect(events.map((event) => event.type)).toEqual(['entry_identity', 'result'])
    expect(events[0].word).toBe('津波')
    expect(calls.negative).toEqual([])
    expect(calls.research).toBe(0)

    aliasHit = null
    for (const mode of ['normal', 'cache_only']) {
      costMode = mode
      expect((await get('&language=ja', undefined, 'つなみ')).status).toBe(404)
    }
    expect(calls.identity).toBe(0)
    costMode = 'normal'
    negatives.clear()
    identityTarget = '津波'
    languages = ['ja']
    saved = { entry: canonical, stale: true }
    lock = 'busy'
    const waiting = Promise.withResolvers<void>()
    onLockAttempt = (busy) => {
      if (busy) waiting.resolve()
    }
    const now = Date.now()
    const clock = spyOn(Date, 'now').mockReturnValue(now)
    try {
      const refresh = get('&language=ja&refresh=1', undefined, '津波')
      await waiting.promise
      onLockAttempt = undefined
      lock = 'acquired'
      expect((await get('&language=ja', undefined, 'つなみ')).status).toBe(200)
      expect(saved!.entry.tracedAt).toBe(canonical.tracedAt)
      clock.mockReturnValue(now + 1000)
      expect((await refresh).status).toBe(429)
    } finally {
      clock.mockRestore()
    }
    const ambiguous = structuredClone(canonical)
    ambiguous.entries.ja!.histories.push({ ...ambiguous.entries.ja!.histories[0], id: 'other' })
    let canonicalReads = 0
    read = (word) =>
      word === canonical.word
        ? { entry: ++canonicalReads === 1 ? canonical : ambiguous, stale: true }
        : null
    const conflict = await get('&language=ja', undefined, 'つなみ')
    expect(conflict.status).toBe(409)
    expect((await conflict.json()).data.otherScripts).toEqual([{ word: '津波', language: 'ja' }])
    read = undefined
    saved = null
    exclusiveLock = true
    let release!: () => void
    synthesisGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const synthesizing = Promise.withResolvers<void>()
    const contended = Promise.withResolvers<void>()
    onSynthesisStarted = synthesizing.resolve
    onLockAttempt = (busy) => {
      if (busy) contended.resolve()
    }
    const concurrentClock = spyOn(Date, 'now').mockReturnValue(Date.now())
    let results: Response[]
    try {
      const first = get('&language=ja', undefined, 'つなみ')
      const second = get('&language=ja', undefined, 'ツナミ')
      await Promise.all([synthesizing.promise, contended.promise])
      onLockAttempt = onSynthesisStarted = undefined
      release()
      results = await Promise.all([first, second])
    } finally {
      concurrentClock.mockRestore()
    }
    expect(results.map((response) => response.status)).toEqual([200, 200])
    expect(new Set(calls.locks)).toEqual(new Set(['lock:etymology:津波']))
    expect(calls.synthesis).toBe(1)
    expect(saved!.entry.word).toBe('津波')
    expect(saved!.entry.spellings?.map((spelling) => spelling.word).sort()).toEqual([
      'つなみ',
      'ツナミ',
    ])
  })

  test('partial refresh keeps the failed language and its original freshness', async () => {
    const original = entry()
    saved = { entry: original, stale: true }
    failLanguage = 'fr'
    rootUsage = true
    const response = await get('&refresh=1&stream=true')
    const events = (await response.text())
      .split('\n\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line.slice(6)))
    const value = events.find((event) => event.type === 'result').data as WordEntry
    expect(value.entries.fr).toEqual(original.entries.fr)
    expect(value.entries.en?.definition).toBe('new en')
    expect(value.freshnessAt).toBe(original.tracedAt)
    expect(value.revision).toBe(0)
    expect(value.incomplete).toBe(true)
    expect(
      events.some((event) => event.type === 'language_failed' && event.language === 'fr')
    ).toBe(true)
    expect(calls.spend).toHaveLength(4)
    expect(calls.locks).toEqual(['lock:etymology:chat'])
  })
  test('fresh refresh requests use the existing entry without research', async () => {
    saved = { entry: entry(), stale: false }
    expect((await get('&refresh=1')).status).toBe(200)
    expect(calls.research).toBe(0)
    expect(calls.locks).toEqual([])
  })
  test('fresh missing hint augments only that language and preserves the others', async () => {
    const original = entry()
    original.languages = ['en']
    delete original.entries.fr
    original.attemptedLanguages = ['en']
    saved = { entry: original, stale: false }
    const payload = await (await get('&language=fr')).json()
    expect(payload.data.languages).toEqual(['en', 'fr'])
    expect(payload.data.entries.en).toEqual(original.entries.en)
    expect(calls.research).toBe(1)
    expect(payload.data.freshnessAt).toBe(original.tracedAt)
  })
  test('confirmed absent hint returns no sources without research', async () => {
    const original = entry()
    original.languages = ['en']
    delete original.entries.fr
    saved = { entry: original, stale: false }
    costMode = 'cache_only'
    expect((await get('&language=fr')).status).toBe(404)
    expect(calls.identity).toBe(0)
    expect(calls.research).toBe(0)
    expect(calls.spend).toHaveLength(0)
  })
  test('failed refresh preserves saved results and persists its language failure', async () => {
    const original = entry()
    saved = { entry: original, stale: true }
    languages = ['fr']
    failLanguage = 'fr'
    expect((await get('&refresh=1')).status).toBe(200)
    expect(saved.entry.entries).toEqual(original.entries)
    expect(saved.entry.freshnessAt).toBe(original.tracedAt)
    expect(saved.entry.failedLanguages?.fr).toMatchObject({ kind: 'validation' })
    expect(calls.writes).toBe(1)
    expect(calls.negative.some((item) => (item as string[])[0] === 'write')).toBe(false)
    expect(calls.failure).toBe(0)
    expect(calls.spend).toHaveLength(1)
  })
  test('failed-language cooldown precedes source work and recovery targets only its hint', async () => {
    failLanguage = 'fr'
    const first = await (await get()).json()
    expect(first.data.languages).toEqual(['en'])
    expect(first.data.attemptedLanguages).toEqual(['en'])
    expect(first.data.failedLanguages.fr).toMatchObject({ kind: 'validation' })
    const originalEnglish = structuredClone(saved!.entry.entries.en)
    const originalFreshness = saved!.entry.tracedAt
    const identityCalls = calls.identity
    const researchCalls = calls.research
    const lockCalls = calls.locks.length
    const cooldown = await get('&language=fr&refresh=1')
    expect(cooldown.status).toBe(200)
    expect(Number(cooldown.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await cooldown.json()).data.failedLanguages).toEqual(saved!.entry.failedLanguages)
    expect(calls.identity).toBe(identityCalls)
    expect(calls.research).toBe(researchCalls)
    expect(calls.locks).toHaveLength(lockCalls)
    expect(calls.negative.some((item) => (item as string[])[0] === 'write')).toBe(false)

    saved!.entry.failedLanguages!.fr!.retryAt = new Date(0).toISOString()
    saved!.stale = true
    costMode = 'cache_only'
    expect((await get('&language=fr&refresh=1')).status).toBe(503)
    expect(calls.research).toBe(researchCalls)
    costMode = 'normal'
    const unrelatedFailure = {
      kind: 'transient' as const,
      message: 'A source is unavailable.',
      retryAt: new Date(Date.now() + 300_000).toISOString(),
    }
    saved!.entry.failedLanguages!.it = unrelatedFailure
    failLanguage = undefined
    calls.researchLanguages = []
    const recovered = await (await get('&language=fr&refresh=1')).json()
    expect(calls.researchLanguages).toEqual(['fr'])
    expect(recovered.data.entries.en).toEqual(originalEnglish)
    expect(recovered.data.freshnessAt).toBe(originalFreshness)
    expect(recovered.data.failedLanguages).toEqual({ it: unrelatedFailure })
    expect(recovered.data.languages).toEqual(['en', 'fr'])
  })
  test('holder and waiter recheck a newly saved failure cooldown', async () => {
    const original = entry()
    original.languages = ['en']
    delete original.entries.fr
    original.attemptedLanguages = ['en']
    original.failedLanguages = {
      fr: { kind: 'validation', message: 'Please try again.', retryAt: new Date(0).toISOString() },
    }
    const updated = structuredClone(original)
    updated.tracedAt = new Date().toISOString()
    updated.failedLanguages!.fr!.retryAt = new Date(Date.now() + 300_000).toISOString()
    for (const state of ['acquired', 'busy'] as const) {
      lock = state
      let reads = 0
      read = () => ({ entry: ++reads === 1 ? original : updated, stale: true })
      const response = await get('&language=fr&refresh=1')
      expect(response.status).toBe(200)
      expect((await response.json()).data.failedLanguages).toEqual(updated.failedLanguages)
    }
    expect(calls.research).toBe(0)
    expect(calls.synthesis).toBe(0)
  })
  test('failed recovery renews only its failure and never records an absence', async () => {
    failLanguage = 'fr'
    await get()
    const originalEnglish = structuredClone(saved!.entry.entries.en)
    saved!.entry.failedLanguages!.fr!.retryAt = new Date(0).toISOString()
    failureMessage = 'OpenRouter returned 429: quota exceeded'
    resolutionIncomplete = true
    calls.researchLanguages = []
    expect((await get('&language=fr&refresh=1')).status).toBe(200)
    expect(calls.researchLanguages).toEqual(['fr'])
    expect(saved!.entry.entries.en).toEqual(originalEnglish)
    expect(saved!.entry.failedLanguages?.fr?.kind).toBe('unavailable')
    expect(Date.parse(saved!.entry.failedLanguages!.fr!.retryAt)).toBeGreaterThan(Date.now())
    expect(calls.negative.some((item) => (item as string[])[0] === 'write')).toBe(false)
    const researchCalls = calls.research
    const cooldown = await get('&language=fr')
    expect(cooldown.status).toBe(200)
    expect((await cooldown.json()).data.failedLanguages).toEqual(saved!.entry.failedLanguages)
    expect(calls.research).toBe(researchCalls)
  })
  test.each([false, true, 'legacy'] as const)(
    'recovery preserves source uncertainty independently of failures: %s',
    async (sourcePartial) => {
      failLanguage = 'fr'
      researchIncomplete = sourcePartial === true
      await get()
      expect(saved!.entry.researchIncomplete).toBe(sourcePartial === true)
      if (sourcePartial === 'legacy') delete saved!.entry.researchIncomplete
      saved!.entry.failedLanguages!.fr!.retryAt = new Date(0).toISOString()
      researchIncomplete = false
      failLanguage = undefined
      const payload = await (await get('&language=fr&refresh=1')).json()
      expect(payload.data.failedLanguages).toBeUndefined()
      expect(payload.data.researchIncomplete).toBe(sourcePartial !== false)
      expect(payload.data.incomplete === true).toBe(sourcePartial !== false)
      expect(calls.researchLanguages).toEqual(['en', 'fr', 'fr'])
    }
  )
  test('hint resolution without an outcome preserves entries and settles prior failures', async () => {
    const original = entry()
    original.languages = ['en']
    delete original.entries.fr
    original.attemptedLanguages = ['en']
    saved = { entry: original, stale: false }
    languages = []
    resolutionIncomplete = true
    expect((await get('&language=fr')).status).toBe(503)
    expect(saved.entry).toEqual(original)
    expect(calls.writes).toBe(0)

    saved.entry = {
      ...original,
      researchIncomplete: false,
      incomplete: true,
      failedLanguages: {
        fr: { kind: 'validation', message: 'Please retry.', retryAt: new Date(0).toISOString() },
      },
    }
    const unresolved = await (await get('&language=fr&refresh=1')).json()
    expect(unresolved.data.failedLanguages.fr.kind).toBe('transient')
    expect(Date.parse(unresolved.data.failedLanguages.fr.retryAt)).toBeGreaterThan(Date.now())
    expect(unresolved.data.researchIncomplete).toBe(false)
    expect(unresolved.data.entries.en).toEqual(original.entries.en)
    expect(calls.negative.some((item) => (item as string[])[0] === 'write')).toBe(false)

    saved.entry.failedLanguages!.fr!.retryAt = new Date(0).toISOString()
    const pendingRecovery = structuredClone(saved.entry)
    resolutionIncomplete = false
    const absent = await get('&language=fr&refresh=1')
    expect(absent.status).toBe(200)
    const settled = (await absent.json()).data
    expect(settled.failedLanguages).toBeUndefined()
    expect(settled.attemptedLanguages).toContain('fr')
    expect(settled.incomplete).not.toBe(true)
    expect((await get('&language=fr')).status).toBe(404)
    const identityCalls = calls.identity
    expect((await (await get('&language=fr&refresh=1')).json()).data).toEqual(settled)
    expect(calls.identity).toBe(identityCalls)
    for (const state of ['acquired', 'busy'] as const) {
      lock = state
      let reads = 0
      read = () => ({ entry: ++reads === 1 ? pendingRecovery : settled, stale: false })
      const concurrent = await get('&language=fr&refresh=1')
      expect(concurrent.status).toBe(200)
      expect((await concurrent.json()).data).toEqual(settled)
    }
    expect(calls.research).toBe(0)
    read = undefined
    lock = 'acquired'
    saved.stale = true
    languages = ['fr']
    expect((await get('&language=fr&refresh=1')).status).toBe(200)
    expect(calls.researchLanguages).toEqual(['fr'])
  })
  test('roots are accounted before no-source admission and failures account once', async () => {
    languages = ['en']
    credible = false
    rootUsage = true
    expect((await get()).status).toBe(404)
    expect(calls.spend).toHaveLength(1)
    expect(calls.synthesis).toBe(0)
    expect(calls.negative).toContainEqual(['write', undefined])
    rootError = true
    negatives.clear()
    calls.spend = []
    calls.negative = []
    await get()
    expect(calls.spend).toHaveLength(1)
    expect(calls.negative.some((item) => (item as string[])[0] === 'write')).toBe(false)
  })
  test('an automatic miss cannot block an explicitly hinted specialist entry', async () => {
    languages = ['en']
    credible = false
    expect((await get()).status).toBe(404)
    languages = ['fr']
    credible = true
    const payload = await (await get('&language=fr')).json()
    expect(payload.data.languages).toEqual(['fr'])
    expect(calls.negative).toContainEqual(['read', 'fr'])
    expect(calls.synthesis).toBe(1)
  })
  test('unknown source availability never writes negative cache', async () => {
    languages = []
    resolutionIncomplete = true
    const unavailable = await get()
    expect(unavailable.status).toBe(503)
    expect((await unavailable.json()).error).toContain(
      'Dictionary sources are temporarily unavailable'
    )
    resolutionIncomplete = false
    identityIncomplete = true
    expect((await get()).status).toBe(503)
    expect(calls.negative.some((item) => (item as string[])[0] === 'write')).toBe(false)
    languages = ['ja']
    resultWord = '電話'
    const response = await get('&language=ja', undefined, resultWord)
    expect(response.status).toBe(200)
    expect((await response.json()).data.incomplete).toBe(true)
  })
  test('refresh waiters ignore the prior cached generation', async () => {
    const original = entry()
    saved = { entry: original, stale: true }
    lock = 'busy'
    const updated = { ...original, tracedAt: '2026-11-10T00:00:00.000Z' }
    read = () => (calls.reads >= 4 ? { entry: updated, stale: false } : saved)
    // This checks cache generations; scheduler delays must not expire the fixture's 12 ms window.
    const clock = spyOn(Date, 'now').mockReturnValue(0)
    try {
      const response = await get('&refresh=1')
      expect(response.status).toBe(200)
      const payload = await response.json()
      expect(payload.data.tracedAt).toBe(updated.tracedAt)
      expect(calls.reads).toBeGreaterThanOrEqual(4)
      expect(calls.research).toBe(0)
    } finally {
      clock.mockRestore()
    }
  })
  test('lock reread avoids spending when another holder already saved the entry', async () => {
    const completed = { entry: entry(), stale: false }
    read = () => (calls.reads === 1 ? null : completed)
    expect((await get()).status).toBe(200)
    expect(calls.research).toBe(0)
    expect(calls.released).toBe(1)
  })
  test('failed persistence never returns a completed result', async () => {
    writeError = true
    expect((await get()).status).toBe(500)
    expect(calls.failure).toBe(1)
    expect(calls.released).toBe(1)
  })
  const offers: ScriptTarget[] = [{ word: 'नमस्ते', language: 'hi' }]
  const sseEvents = async (response: Response) =>
    (await response.text())
      .split('\n\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line.slice(6)))

  test('successful spelling entry stores offers without tracing their targets', async () => {
    languages = ['en']
    otherScripts = offers
    const events = await sseEvents(await get('&stream=true'))
    expect(events.find((event) => event.type === 'languages_resolved').otherScripts).toEqual(offers)
    expect(events.find((event) => event.type === 'result').data.otherScripts).toEqual(offers)
    expect(saved?.entry.otherScripts).toEqual(offers)
    expect(calls.researchLanguages).toEqual(['en'])
    expect(calls.synthesis).toBe(1)
  })

  test('no-source offers survive negative cache with JSON and SSE parity and no repeat research', async () => {
    languages = []
    otherScripts = offers
    const first = await (await get()).json()
    expect(first.data.otherScripts).toEqual(offers)
    expect(negatives.get(undefined)).toEqual({ otherScripts: offers })
    const second = await sseEvents(await get('&stream=true'))
    expect(second.at(-1)).toMatchObject({ type: 'error', otherScripts: offers })
    expect(calls.research).toBe(0)
    expect(calls.synthesis).toBe(0)
    expect(calls.failure).toBe(0)
    expect(calls.reads).toBe(3)
  })

  test('retained English merges newly resolved offers when the hinted script has no entry', async () => {
    const original = entry()
    original.languages = ['en']
    delete original.entries.fr
    original.attemptedLanguages = ['en']
    saved = { entry: original, stale: false }
    languages = []
    otherScripts = offers
    const payload = await (await get('&language=hi')).json()
    expect(payload.data.otherScripts).toEqual(offers)
    expect(saved?.entry.entries.en).toEqual(original.entries.en)
    expect(saved?.entry.otherScripts).toEqual(offers)
    expect(saved?.entry.attemptedLanguages).toContain('hi')
    expect(negatives.has('hi')).toBe(false)
    expect(calls.synthesis).toBe(0)
    expect(calls.research).toBe(0)
    const cached = await sseEvents(await get('&language=hi&stream=true'))
    expect(cached.at(-1).otherScripts).toEqual(offers)
    negatives.set('ja', {})
    const olderNegative = await (await get('&language=ja')).json()
    expect(olderNegative.data.otherScripts).toEqual(offers)
    expect(calls.writes).toBe(1)
  })

  test('lock recheck preserves offers for a completed missing hint', async () => {
    const completed = entry()
    completed.languages = ['en']
    delete completed.entries.fr
    completed.otherScripts = offers
    read = () => (calls.reads === 1 ? null : { entry: completed, stale: false })
    const payload = await (await get('&language=fr')).json()
    expect(payload.data.otherScripts).toEqual(offers)
    expect(calls.research).toBe(0)
    expect(calls.reads).toBe(2)
  })

  test('waiters preserve offers from durable missing hints and negative metadata', async () => {
    lock = 'busy'
    const completed = entry()
    completed.languages = ['en']
    delete completed.entries.fr
    completed.otherScripts = offers
    read = () => (calls.reads > 1 ? { entry: completed, stale: false } : null)
    expect((await (await get('&language=fr')).json()).data.otherScripts).toEqual(offers)
    read = () => null
    promotion = async () => {
      negatives.set(undefined, { otherScripts: offers })
      return { status: 'held' }
    }
    const events = await sseEvents(await get('&stream=true'))
    expect(events.at(-1)).toMatchObject({ type: 'error', otherScripts: offers })
    expect(calls.research).toBe(0)
  })

  test('real holder failures preserve already resolved offers for holder and waiters', async () => {
    languages = ['en']
    otherScripts = offers
    rootError = true
    expect((await (await get()).json()).data.otherScripts).toEqual(offers)
    expect(calls.failureMetadata).toMatchObject({ otherScripts: offers })
    lock = 'busy'
    promotion = async () => ({ status: 'holder_failed', ...(calls.failureMetadata as object) })
    const events = await sseEvents(await get('&stream=true'))
    expect(events.at(-1)).toMatchObject({ type: 'error', otherScripts: offers })
    expect(calls.research).toBe(1)
    expect(calls.synthesis).toBe(0)
  })

  test('cancelled refresh waiter never promotes or overwrites the old entry', async () => {
    const original = entry()
    saved = { entry: original, stale: true }
    lock = 'busy'
    const controller = new AbortController()
    promotion = async () => {
      controller.abort()
      return { status: 'held' }
    }
    expect((await get('&refresh=1', controller.signal)).status).toBe(499)
    expect(calls.research).toBe(0)
    expect(calls.writes).toBe(0)
    expect(saved.entry).toEqual(original)
  })
}
