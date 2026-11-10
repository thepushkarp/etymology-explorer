import { after, NextRequest } from 'next/server'
import type { EtymologyResult, ScriptTarget, StreamEvent, WordEntry } from '@/lib/types'
import { synthesizeFromResearch, getLlmUsageFromError } from '@/lib/llm'
import { conductAgenticResearch, hasCredibleMainSource } from '@/lib/research'
import { createLexemeResearchSession } from '@/lib/lexemeResearch'
import { resolveEntryLanguages } from '@/lib/entryLanguages'
import { SourceFetchBudget } from '@/lib/sourceFetchBudget'
import { getSuggestions } from '@/lib/spellcheck'
import { getQuirkyMessage } from '@/lib/prompts'
import {
  getCachedEntry,
  cacheEntry,
  getNegativeCache,
  cacheNegative,
  getCachedSpellingEntry,
  mergeEntrySpellings,
  hasEntrySpellings,
  publishSpellingAliases,
  isSpellingEntry,
} from '@/lib/cache'
import { resolveEntryIdentity } from '@/lib/entryIdentity'
import { isValidWord, canonicalizeWord } from '@/lib/validation'
import { getCostMode, recordSpend } from '@/lib/costGuard'
import {
  tryAcquireLock,
  releaseLock,
  startLockHeartbeat,
  markLockFailure,
  attemptPromotion,
} from '@/lib/singleflight'
import { incrCounter, incrLanguageCounter } from '@/lib/counters'
import { safeError } from '@/lib/errorUtils'
import { getEnv } from '@/lib/env'
import { CONFIG } from '@/lib/config'
import { emitSecurityEvent } from '@/lib/telemetry'
import { createResponseAdapter } from '@/lib/responseAdapter'
import { classifyApiError } from '@/lib/apiError'
import { LANGUAGES, parseLanguageCode, type LanguageCode } from '@/lib/languages'
import { normalizeScriptTargets } from '@/lib/scriptTargets'

export const maxDuration = 300
const IN_PROGRESS_MESSAGE = 'Request in progress, please retry in a few seconds.'
class EntryIdentityConflict extends Error {}

function classifyRouteError(error: unknown) {
  return error instanceof EntryIdentityConflict
    ? { message: error.message, status: 409, streamErrorType: 'unknown' as const }
    : classifyApiError(error)
}
type Outcome =
  | { kind: 'result'; result: WordEntry }
  | { kind: 'no_sources'; otherScripts?: ScriptTarget[] }
  | { kind: 'holder_failed'; message: string; otherScripts?: ScriptTarget[] }
  | { kind: 'timeout' }

/** Interrupt waiter sleeps immediately when their client disconnects. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function GET(request: NextRequest) {
  const shouldStream = request.nextUrl.searchParams.get('stream') === 'true'
  const respond = createResponseAdapter(shouldStream)
  let knownOffers: ScriptTarget[] = []
  const requireSpellingEntry = (entry: WordEntry, language: LanguageCode) => {
    if (isSpellingEntry(entry, language)) return
    knownOffers = normalizeScriptTargets([...knownOffers, { word: entry.word, language }])
    throw new EntryIdentityConflict(
      `The saved entry for “${entry.word}” cannot safely be combined with this spelling. Open it to explore its word histories or retrace it when the option is available.`
    )
  }
  try {
    try {
      getEnv()
    } catch {
      return respond.error('Service configuration error', { status: 503 })
    }
    if (!CONFIG.features.publicSearchEnabled || CONFIG.features.forceCacheOnly) {
      return respond.error('Service temporarily unavailable', { status: 503 })
    }
    const word = request.nextUrl.searchParams.get('word')
    const rawHint = request.nextUrl.searchParams.get('language')
    let hint = rawHint === null ? undefined : parseLanguageCode(rawHint)
    if (hint === null) return respond.error('Unsupported language', { status: 400 })
    if (!word) return respond.error('Word is required', { status: 400 })
    const requestedWord = canonicalizeWord(word)
    let normalizedWord = requestedWord
    if (!normalizedWord) return respond.error(getQuirkyMessage('empty'), { status: 400 })
    if (!isValidWord(normalizedWord)) {
      return respond.error(getQuirkyMessage('nonsense'), { status: 400, errorType: 'nonsense' })
    }
    if (hint) {
      const requestLanguage = hint
      after(() => incrLanguageCounter(requestLanguage, 'request'))
    }
    const noSources = (otherScripts?: ScriptTarget[]) => {
      const suggestions = !hint || hint === 'en' ? getSuggestions(normalizedWord) : []
      const offers = normalizeScriptTargets([...knownOffers, ...(otherScripts ?? [])])
      return respond.error(
        hint
          ? `No supported ${LANGUAGES[hint].englishName} entry was found for “${normalizedWord}”.`
          : `No supported entry was found for “${normalizedWord}”.`,
        {
          status: 404,
          errorType: suggestions.length ? 'typo' : 'nonsense',
          suggestions: suggestions.map((suggestion) => suggestion.word),
          ...(offers.length ? { otherScripts: offers } : {}),
        }
      )
    }
    const alias = await getCachedSpellingEntry(requestedWord, hint)
    if (alias) {
      normalizedWord = alias.word
      hint = alias.language
    }
    let cached = alias ?? (await getCachedEntry(normalizedWord))
    let oldEntry = cached?.entry
    let identity: Extract<StreamEvent, { type: 'entry_identity' }> | undefined = alias
      ? {
          type: 'entry_identity',
          word: normalizedWord,
          requestedWord,
          language: alias.language,
          spellings: alias.entry.spellings,
        }
      : undefined
    knownOffers = normalizeScriptTargets(oldEntry?.otherScripts)
    const requestedRefresh = request.nextUrl.searchParams.get('refresh') === '1'
    let refresh = requestedRefresh && cached?.stale === true
    let missingHint = !!hint && !oldEntry?.entries[hint]
    if (oldEntry && !refresh) {
      if (!missingHint) {
        emitSecurityEvent({
          type: 'cache_hit',
          timestamp: Date.now(),
          detail: { word: normalizedWord, language: hint },
        })
        after(() => incrCounter('cache_hit'))
        return respond.result(oldEntry, { cached: true, identity })
      }
      if (hint && oldEntry.attemptedLanguages?.includes(hint)) return noSources(knownOffers)
    }
    const requestedNegative =
      !alias && !refresh ? await getNegativeCache(requestedWord, hint) : null
    if (requestedNegative) return noSources(requestedNegative.otherScripts)
    // Automatic absence cannot exclude a specialist-only explicitly hinted entry.
    const costMode = await getCostMode()
    if (costMode === 'cache_only') {
      emitSecurityEvent({
        type: 'budget_check',
        timestamp: Date.now(),
        detail: { word: normalizedWord, mode: costMode, action: 'rejected' },
      })
      return respond.error(
        'Monthly budget reached. Cached words still work — try again next month for new ones.',
        { status: 503, errorType: 'budget', headers: { 'X-Protection-Mode': costMode } }
      )
    }
    const budget = new SourceFetchBudget(CONFIG.maxEntryFetches)
    let emitProgress: ((event: StreamEvent) => void) | undefined
    const session = createLexemeResearchSession({
      signal: request.signal,
      budget,
      onProgress: (event) => emitProgress?.(event),
    })
    const resolvedIdentity = await resolveEntryIdentity(
      requestedWord,
      session,
      hint,
      alias ? undefined : oldEntry
    )
    if (resolvedIdentity.language) {
      normalizedWord = resolvedIdentity.word
      hint = resolvedIdentity.language
      cached = await getCachedEntry(normalizedWord)
      oldEntry = cached?.entry
      if (oldEntry?.entries[hint]) requireSpellingEntry(oldEntry, hint)
      refresh = requestedRefresh && cached?.stale === true
      missingHint = !oldEntry?.entries[hint]
      knownOffers = normalizeScriptTargets(oldEntry?.otherScripts)
      identity = {
        type: 'entry_identity',
        word: normalizedWord,
        requestedWord,
        language: hint,
        spellings: resolvedIdentity.spellings,
      }
    }
    if (
      hint &&
      !oldEntry?.entries[hint] &&
      !refresh &&
      oldEntry?.attemptedLanguages?.includes(hint)
    )
      return noSources(knownOffers)
    const negative = await getNegativeCache(normalizedWord, hint)
    if (negative && !refresh && !(hint && oldEntry?.entries[hint]))
      return noSources(negative.otherScripts)
    const lockKey = `lock:etymology:${normalizedWord}`
    const acquisition = await tryAcquireLock(lockKey)
    if (acquisition.status === 'unavailable' || acquisition.status === 'error') {
      return respond.error(
        'New word lookups are temporarily unavailable — our cache service is unreachable. Please try again in a few minutes.',
        { status: 503, errorType: 'network', unaryHeaders: { 'Retry-After': '60' } }
      )
    }

    const registerSpellings = async (entry: WordEntry): Promise<WordEntry> => {
      if (!resolvedIdentity.spellings.length) return entry
      if (resolvedIdentity.language) requireSpellingEntry(entry, resolvedIdentity.language)
      const merged = mergeEntrySpellings(entry, resolvedIdentity.spellings)
      if (!hasEntrySpellings(entry, resolvedIdentity.spellings))
        await cacheEntry(normalizedWord, merged)
      await publishSpellingAliases(merged, resolvedIdentity.proofs)
      return merged
    }

    const runHolder = async (
      token: string,
      emit?: (event: StreamEvent) => void
    ): Promise<Outcome> => {
      const stopHeartbeat = startLockHeartbeat(lockKey, token)
      emitProgress = emit
      try {
        request.signal.throwIfAborted()
        // Merge the latest durable generation after acquiring the word lock.
        const latest = (await getCachedEntry(normalizedWord))?.entry ?? oldEntry
        if (
          latest &&
          (!hint || latest.entries[hint]) &&
          (!refresh || latest.tracedAt !== oldEntry?.tracedAt)
        ) {
          return { kind: 'result', result: await registerSpellings(latest) }
        }
        knownOffers = normalizeScriptTargets(latest?.otherScripts ?? knownOffers)
        if (hint && !refresh && latest?.attemptedLanguages?.includes(hint)) {
          return { kind: 'no_sources', otherScripts: knownOffers }
        }
        const resolved = await budget.runLimited(
          Math.max(0, CONFIG.maxTotalFetches - budget.attempts),
          () => resolveEntryLanguages(normalizedWord, session, hint)
        )
        knownOffers = normalizeScriptTargets([...knownOffers, ...(resolved.otherScripts ?? [])])
        const languages =
          latest && missingHint && !refresh && hint
            ? resolved.languages.filter((language) => language === hint)
            : resolved.languages
        // Resolution shares the ceiling: 32 attempts plus 16 per extra language.
        budget.tighten(
          Math.min(
            CONFIG.maxEntryFetches,
            CONFIG.maxTotalFetches +
              CONFIG.maxFetchesPerExtraLanguage * Math.max(0, languages.length - 1)
          )
        )
        emit?.({
          type: 'languages_resolved',
          languages: [...new Set([...(latest?.languages ?? []), ...languages])].sort(
            (a, b) => LANGUAGES[a].priority - LANGUAGES[b].priority
          ),
          otherLanguages: resolved.otherLanguages,
          ...(knownOffers.length ? { otherScripts: knownOffers } : {}),
        })
        // The shared wave resolves every primary before enrichment, while core
        // subscribers can start root extraction before optional sources finish.
        const primaryLookup = session.lookupMany(
          languages.map((language) => ({ word: normalizedWord, language })),
          { primary: true, skipOptionalSources: false }
        )
        void primaryLookup.catch(() => {})
        const attempted = new Set(latest?.attemptedLanguages ?? latest?.languages ?? [])
        if (hint && !resolved.incomplete && !resolved.languages.includes(hint)) attempted.add(hint)
        const incompleteLanguages = new Set<LanguageCode>()
        const outcomes = await Promise.allSettled(
          languages.map(async (language): Promise<EtymologyResult | null> => {
            const progress = emit ? (event: StreamEvent) => emit({ ...event, language }) : undefined
            let research
            try {
              research = await conductAgenticResearch(
                normalizedWord,
                { signal: request.signal, language, session, budget },
                progress
              )
            } catch (error) {
              const usage = getLlmUsageFromError(error)
              if (usage) await recordSpend(usage)
              throw error
            }
            if (resolvedIdentity.incomplete) research.incompleteResearch = true
            // Root extraction can spend before the whole-word admission check.
            if (research.llmUsage) await recordSpend(research.llmUsage)
            if (research.incompleteResearch) incompleteLanguages.add(language)
            if (!hasCredibleMainSource(research)) {
              if (research.incompleteResearch)
                throw new Error(`Source research incomplete for ${language}`)
              attempted.add(language)
              await incrLanguageCounter(language, 'no_source')
              return null
            }
            progress?.({ type: 'synthesis_started' })
            try {
              const synthesis = await synthesizeFromResearch(research, {
                signal: request.signal,
                ...(progress
                  ? {
                      onSection: (section: string, data: unknown) =>
                        progress({ type: 'synthesis_section', section, data }),
                    }
                  : {}),
              })
              await recordSpend(synthesis.usage)
              attempted.add(language)
              return synthesis.result
            } catch (error) {
              const usage = getLlmUsageFromError(error)
              if (usage) await recordSpend(usage)
              if (safeError(error).toLowerCase().includes('schema validation')) {
                await incrLanguageCounter(language, 'schema_failure')
              }
              throw error
            }
          })
        )
        await primaryLookup
        request.signal.throwIfAborted()
        const entries = { ...latest?.entries }
        const successfulLanguages = new Set<LanguageCode>()
        const failures: unknown[] = []
        outcomes.forEach((outcome, index) => {
          const language = languages[index]
          if (outcome.status === 'fulfilled') {
            if (outcome.value) {
              entries[language] = outcome.value
              successfulLanguages.add(language)
            }
          } else {
            failures.push(outcome.reason)
            emit?.({
              type: 'language_failed',
              language,
              message: classifyRouteError(outcome.reason).message,
            })
          }
        })
        if (!successfulLanguages.size && failures.length) throw failures[0]
        if (!successfulLanguages.size && (resolved.incomplete || resolvedIdentity.incomplete))
          throw new Error('Language resolution incomplete; source availability is unknown')
        if (!successfulLanguages.size && !latest) {
          await cacheNegative(normalizedWord, 'no_sources', hint, knownOffers)
          return { kind: 'no_sources', otherScripts: knownOffers }
        }
        if (!successfulLanguages.size && refresh)
          throw new Error('Retrace found no supported sources; the saved entry remains available')
        const retained = latest?.languages.some((language) => !successfulLanguages.has(language))
        const incomplete =
          !!resolved.incomplete ||
          !!resolvedIdentity.incomplete ||
          failures.length > 0 ||
          incompleteLanguages.size > 0 ||
          !!(retained && latest?.incomplete)
        const result: WordEntry = mergeEntrySpellings(
          {
            word: normalizedWord,
            languages: (Object.keys(entries) as LanguageCode[]).sort(
              (a, b) => LANGUAGES[a].priority - LANGUAGES[b].priority
            ),
            entries,
            otherLanguages: [
              ...new Set([...(latest?.otherLanguages ?? []), ...resolved.otherLanguages]),
            ],
            ...(knownOffers.length ? { otherScripts: knownOffers } : {}),
            tracedAt: new Date(
              Math.max(Date.now(), (Date.parse(latest?.tracedAt ?? '') || 0) + 1)
            ).toISOString(),
            ...(retained && latest ? { freshnessAt: latest.freshnessAt ?? latest.tracedAt } : {}),
            revision:
              retained && latest
                ? Math.min(latest.revision, CONFIG.pipelineRevision)
                : CONFIG.pipelineRevision,
            attemptedLanguages: [...attempted],
            ...(incomplete ? { incomplete: true } : {}),
            spellings: latest?.spellings,
          },
          resolvedIdentity.spellings
        )
        await cacheEntry(normalizedWord, result, { incomplete })
        if (resolvedIdentity.language) requireSpellingEntry(result, resolvedIdentity.language)
        await publishSpellingAliases(result, resolvedIdentity.proofs)
        emitSecurityEvent({
          type: 'cache_miss',
          timestamp: Date.now(),
          detail: {
            word: normalizedWord,
            languages: result.languages,
            sourceAttempts: budget.attempts,
          },
        })
        await incrCounter('cache_miss')
        if (hint && !result.entries[hint]) {
          if (!attempted.has(hint)) {
            throw new Error(`Source research incomplete for ${hint}`)
          }
          await cacheNegative(normalizedWord, 'no_sources', hint, knownOffers)
          return { kind: 'no_sources', otherScripts: knownOffers }
        }
        return { kind: 'result', result }
      } catch (error) {
        if (!request.signal.aborted)
          await markLockFailure(lockKey, {
            message: classifyRouteError(error).message,
            ...(knownOffers.length ? { otherScripts: knownOffers } : {}),
          })
        throw error
      } finally {
        stopHeartbeat()
        await releaseLock(lockKey, token)
      }
    }

    const waitForHolder = async (emit?: (event: StreamEvent) => void): Promise<Outcome> => {
      const started = Date.now()
      const maximum = shouldStream
        ? CONFIG.singleflight.streamWaiterMaxWaitMs
        : CONFIG.singleflight.unaryWaiterMaxWaitMs
      while (Date.now() - started < maximum) {
        await sleep(CONFIG.singleflight.waiterPollIntervalMs, request.signal)
        const next = await getCachedEntry(normalizedWord)
        if (
          !refresh &&
          next?.entry.entries[hint ?? next.entry.languages[0]] &&
          resolvedIdentity.spellings.length &&
          !hasEntrySpellings(next.entry, resolvedIdentity.spellings)
        ) {
          const registration = await tryAcquireLock(lockKey)
          if (registration.status === 'acquired') return runHolder(registration.token, emit)
        }
        // Refresh waiters must observe a new generation of the durable entry.
        if (next && (!refresh || next.entry.tracedAt !== oldEntry?.tracedAt)) {
          if (
            (!hint || next.entry.entries[hint]) &&
            hasEntrySpellings(next.entry, resolvedIdentity.spellings)
          ) {
            if (resolvedIdentity.language)
              requireSpellingEntry(next.entry, resolvedIdentity.language)
            await publishSpellingAliases(next.entry, resolvedIdentity.proofs)
            return { kind: 'result', result: next.entry }
          }
          if (hint && !next.entry.entries[hint] && next.entry.attemptedLanguages?.includes(hint))
            return { kind: 'no_sources', otherScripts: next.entry.otherScripts }
        }
        const negative = !refresh ? await getNegativeCache(normalizedWord, hint) : null
        if (negative) return { kind: 'no_sources', otherScripts: negative.otherScripts }
        const promotion = await attemptPromotion(lockKey)
        if (promotion.status === 'holder_failed')
          return {
            kind: 'holder_failed',
            message: promotion.message,
            otherScripts: normalizeScriptTargets([
              ...knownOffers,
              ...(promotion.otherScripts ?? []),
            ]),
          }
        if (promotion.status === 'promoted') return runHolder(promotion.token, emit)
        emit?.({ type: 'singleflight_wait', waitedMs: Date.now() - started })
      }
      return { kind: 'timeout' }
    }
    if (shouldStream) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          const emit = (event: StreamEvent) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            } catch {
              /* request.signal cancels disconnected-client work. */
            }
          }
          try {
            if (identity) emit(identity)
            const outcome =
              acquisition.status === 'acquired'
                ? await runHolder(acquisition.token, emit)
                : await waitForHolder(emit)
            if (outcome.kind === 'result') emit({ type: 'result', data: outcome.result })
            else if (outcome.kind === 'no_sources') {
              controller.enqueue(
                new Uint8Array(await (await noSources(outcome.otherScripts)).arrayBuffer())
              )
            } else
              emit({
                type: 'error',
                message: outcome.kind === 'holder_failed' ? outcome.message : IN_PROGRESS_MESSAGE,
                errorType: outcome.kind === 'timeout' ? 'rate_limit' : 'unknown',
                ...(outcome.kind === 'holder_failed' && outcome.otherScripts?.length
                  ? { otherScripts: outcome.otherScripts }
                  : {}),
              })
          } catch (error) {
            if (!request.signal.aborted) {
              await incrCounter('error')
              const classified = classifyRouteError(error)
              emit({
                type: 'error',
                message: classified.message,
                errorType: classified.streamErrorType,
                ...(knownOffers.length ? { otherScripts: knownOffers } : {}),
              })
            }
          } finally {
            try {
              controller.close()
            } catch {
              /* Cancellation already closed the stream. */
            }
          }
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Protection-Mode': costMode,
        },
      })
    }
    const outcome =
      acquisition.status === 'acquired' ? await runHolder(acquisition.token) : await waitForHolder()
    if (outcome.kind === 'no_sources') return noSources(outcome.otherScripts)
    if (outcome.kind === 'holder_failed')
      return respond.error(outcome.message, {
        status: 503,
        otherScripts: outcome.otherScripts,
      })
    if (outcome.kind === 'timeout')
      return respond.error(IN_PROGRESS_MESSAGE, {
        status: 429,
        errorType: 'rate_limit',
        unaryHeaders: { 'Retry-After': '15' },
      })
    return respond.result(outcome.result, {
      cached: false,
      identity,
      headers: { 'X-Protection-Mode': costMode },
    })
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 })
    console.error('Etymology API error:', safeError(error))
    await incrCounter('error')
    const classified = classifyRouteError(error)
    return respond.error(classified.message, {
      status: classified.status,
      errorType: classified.streamErrorType,
      ...(knownOffers.length ? { otherScripts: knownOffers } : {}),
    })
  }
}
