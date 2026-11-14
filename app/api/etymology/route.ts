import { after, NextRequest } from 'next/server'
import type {
  EtymologyResult,
  LanguageFailure,
  ScriptTarget,
  StreamEvent,
  WordEntry,
  LookupResolution,
} from '@/lib/types'
import { synthesizeFromResearch, getLlmUsageFromError, isTransientSynthesisError } from '@/lib/llm'
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
import { resolveLookup } from '@/lib/lookupResolution'
import { LookupProposalUnavailable } from '@/lib/lookupFallback'
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
  if (
    error instanceof Error &&
    /language resolution incomplete|source research incomplete/i.test(error.message)
  )
    return {
      message: 'Dictionary sources are temporarily unavailable or incomplete. Please try again.',
      status: 503,
      streamErrorType: 'network' as const,
    }
  return error instanceof EntryIdentityConflict
    ? { message: error.message, status: 409, streamErrorType: 'unknown' as const }
    : classifyApiError(error)
}
type Outcome =
  | { kind: 'result'; result: WordEntry }
  | { kind: 'no_sources'; otherScripts?: ScriptTarget[] }
  | { kind: 'holder_failed'; message: string; otherScripts?: ScriptTarget[] }
  | { kind: 'timeout' }

function languageFailure(error: unknown): LanguageFailure {
  const classified = classifyRouteError(error)
  const actual = safeError(error)
  const validation = /schema validation|failed to parse (?:streamed )?llm response/i.test(actual)
  const unavailable =
    /\b(?:401|403|quota|credits?|billing|balance|payment)\b|invalid_api_key|authentication|permission.denied|context[_ ](?:length|window|limit)/i.test(
      actual
    )
  return {
    kind: validation
      ? 'validation'
      : !unavailable &&
          (isTransientSynthesisError(error) ||
            /source research incomplete|language resolution incomplete/i.test(actual) ||
            classified.streamErrorType === 'rate_limit' ||
            classified.streamErrorType === 'network')
        ? 'transient'
        : 'unavailable',
    message: classified.message,
    retryAt: new Date(Date.now() + CONFIG.incompleteEtymologyCacheTTL * 1000).toISOString(),
  }
}

function failureCooldown(entry: WordEntry | undefined, hint: LanguageCode | undefined) {
  const failure = hint && entry?.failedLanguages?.[hint]
  if (!failure) return undefined
  const retryAfter = Math.ceil((Date.parse(failure.retryAt) - Date.now()) / 1000)
  return retryAfter > 0 ? { retryAfter } : undefined
}

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
  let lookupResolution: LookupResolution | undefined
  const respond = createResponseAdapter(shouldStream, () => lookupResolution)
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
    // Resolution can change the hint; the user's original search mode owns the budget.
    const baseFetches = hint ? CONFIG.maxTotalFetches : CONFIG.maxAutoFetches
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
          ? `No dictionary entry found for “${normalizedWord}” in ${LANGUAGES[hint].englishName}.`
          : `No dictionary entry found for “${normalizedWord}”.`,
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
      const proof = alias.entry.spellings?.find(
        (spelling) => spelling.word === requestedWord && spelling.kind === 'romanization'
      )
      if (proof) {
        const selected = {
          word: alias.word,
          language: alias.language,
          relationship: 'romanization' as const,
          provenance: [
            {
              sourceUrl: proof.sourceUrl,
              revisionId: proof.revisionId,
              verifiedAt: proof.verifiedAt,
              evidence: proof.readingEvidence!,
            },
          ],
        }
        lookupResolution = {
          originalInput: requestedWord,
          language: alias.language,
          candidates: [selected],
          selected,
        }
      }
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
    function hintedFailure(entry: WordEntry | undefined) {
      return !!hint && !!entry?.failedLanguages?.[hint]
    }
    function recoveryRequested(entry: WordEntry | undefined) {
      return hintedFailure(entry) && (requestedRefresh || (!!hint && !entry?.entries[hint]))
    }
    // A concurrent trace can settle the failure before a later cache read.
    let recoveringSavedFailure = recoveryRequested(oldEntry)
    let refresh = requestedRefresh && cached?.stale === true && !hintedFailure(oldEntry)
    let missingHint = !!hint && !oldEntry?.entries[hint]
    function settledHintRetry(entry: WordEntry | undefined) {
      return (
        (recoveringSavedFailure || (requestedRefresh && !refresh)) &&
        !!hint &&
        !!entry &&
        !entry.entries[hint] &&
        !entry.failedLanguages?.[hint] &&
        entry.attemptedLanguages?.includes(hint)
      )
    }
    const coolingResponse = (entry: WordEntry | undefined) => {
      const cooldown = recoveryRequested(entry)
        ? failureCooldown(entry, hint ?? undefined)
        : undefined
      return cooldown && entry
        ? respond.result(entry, {
            cached: true,
            identity,
            headers: { 'Retry-After': String(cooldown.retryAfter) },
          })
        : undefined
    }
    const earlyCooldown = coolingResponse(oldEntry)
    if (earlyCooldown) return earlyCooldown
    if (oldEntry && settledHintRetry(oldEntry))
      return respond.result(oldEntry, { cached: true, identity })
    if (oldEntry && !refresh) {
      if (!missingHint && !recoveryRequested(oldEntry)) {
        emitSecurityEvent({
          type: 'cache_hit',
          timestamp: Date.now(),
          detail: { word: normalizedWord, language: hint },
        })
        after(() => incrCounter('cache_hit'))
        return respond.result(oldEntry, { cached: true, identity })
      }
      if (
        hint &&
        (!['ja', 'hi', 'ur', 'sa'].includes(hint) ||
          oldEntry.revision >= CONFIG.pipelineRevision) &&
        !hintedFailure(oldEntry) &&
        oldEntry.attemptedLanguages?.includes(hint)
      )
        return noSources(knownOffers)
    }
    const requestedNegative =
      !alias && !refresh && !recoveringSavedFailure
        ? await getNegativeCache(requestedWord, hint)
        : null
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
    const initialIdentity = await resolveEntryIdentity(
      requestedWord,
      session,
      hint,
      alias ? undefined : oldEntry
    )
    const lookup =
      alias || initialIdentity.language ? {} : await resolveLookup(requestedWord, session, hint)
    lookupResolution = lookup.resolution ?? lookupResolution
    knownOffers = normalizeScriptTargets([...knownOffers, ...(lookupResolution?.candidates ?? [])])
    const selectedLookup = lookupResolution?.selected
    if (
      (lookupResolution?.candidates.length || lookupResolution?.sourceListed?.length) &&
      !selectedLookup &&
      !lookup.preserveExactEntry &&
      (hint || !lookup.originalTargets?.length)
    ) {
      return respond.error(
        `Choose a${hint ? ` ${LANGUAGES[hint].englishName}` : ''} dictionary entry for “${requestedWord}”.`,
        {
          status: 300,
          errorType: 'unknown',
          otherScripts: knownOffers,
        }
      )
    }
    const resolvedIdentity = selectedLookup
      ? await resolveEntryIdentity(
          selectedLookup.word,
          session,
          selectedLookup.language,
          alias ? undefined : oldEntry
        )
      : initialIdentity
    resolvedIdentity.incomplete ||=
      (!lookup.preserveExactEntry &&
        !(rawHint === null && lookup.originalTargets?.length) &&
        lookupResolution?.incomplete) ||
      initialIdentity.incomplete
    if (selectedLookup) {
      const targetWord = resolvedIdentity.word
      resolvedIdentity.language = selectedLookup.language
      if (
        selectedLookup.relationship === 'romanization' &&
        selectedLookup.language === 'ja' &&
        lookup.terminal
      ) {
        const first = selectedLookup.provenance[0]
        const terminal = resolvedIdentity.proofs[0]?.terminal ?? {
          word: targetWord,
          sourceUrl: lookup.terminal.url,
          revisionId: lookup.terminal.revisionId,
          verifiedAt: lookup.terminal.retrieval!.retrievedAt,
        }
        const proof = {
          word: requestedWord,
          targetWord: selectedLookup.word,
          language: 'ja' as const,
          kind: 'romanization' as const,
          sourceUrl: first.sourceUrl,
          revisionId: first.revisionId,
          verifiedAt: new Date(
            Math.min(...selectedLookup.provenance.map((item) => Date.parse(item.verifiedAt)))
          ).toISOString(),
          readingEvidence: selectedLookup.provenance.map((item) => item.evidence).join('; '),
          terminal,
        }
        resolvedIdentity.proofs.unshift(proof)
        resolvedIdentity.spellings.unshift({
          ...proof,
          verifiedAt: new Date(
            Math.min(Date.parse(proof.verifiedAt), Date.parse(terminal.verifiedAt))
          ).toISOString(),
        })
      }
      lookupResolution = { ...lookupResolution!, selected: { ...selectedLookup, word: targetWord } }
    }
    if (resolvedIdentity.language) {
      const originalTargets =
        normalizedWord !== resolvedIdentity.word
          ? (oldEntry?.languages ?? []).map((language) => ({ word: normalizedWord, language }))
          : []
      normalizedWord = resolvedIdentity.word
      hint = resolvedIdentity.language
      cached = await getCachedEntry(normalizedWord)
      oldEntry = cached?.entry
      recoveringSavedFailure ||= recoveryRequested(oldEntry)
      if (oldEntry?.entries[hint] && resolvedIdentity.proofs.length)
        requireSpellingEntry(oldEntry, hint)
      refresh = requestedRefresh && cached?.stale === true && !hintedFailure(oldEntry)
      missingHint = !oldEntry?.entries[hint]
      knownOffers = normalizeScriptTargets([
        ...(oldEntry?.otherScripts ?? []),
        ...(lookup.originalTargets ?? []),
        ...originalTargets,
        ...(lookupResolution?.candidates ?? []).filter(
          (candidate) => candidate.word !== normalizedWord
        ),
      ])
      identity = {
        type: 'entry_identity',
        word: normalizedWord,
        requestedWord,
        language: hint,
        spellings: resolvedIdentity.spellings,
      }
    }
    const canonicalCooldown = coolingResponse(oldEntry)
    if (canonicalCooldown) return canonicalCooldown
    if (oldEntry && settledHintRetry(oldEntry))
      return respond.result(oldEntry, { cached: true, identity })
    if (
      hint &&
      !oldEntry?.entries[hint] &&
      !hintedFailure(oldEntry) &&
      !refresh &&
      oldEntry?.attemptedLanguages?.includes(hint)
    )
      return noSources(knownOffers)
    const negative = !recoveringSavedFailure ? await getNegativeCache(normalizedWord, hint) : null
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
        if (latest && settledHintRetry(latest)) return { kind: 'result', result: latest }
        const recovering = recoveryRequested(latest)
        const cooldown = recovering ? failureCooldown(latest, hint) : undefined
        if (cooldown && latest) return { kind: 'result', result: latest }
        if (
          latest &&
          (!hint || latest.entries[hint]) &&
          !recovering &&
          (!refresh || latest.tracedAt !== oldEntry?.tracedAt)
        ) {
          return { kind: 'result', result: await registerSpellings(latest) }
        }
        knownOffers = normalizeScriptTargets([...knownOffers, ...(latest?.otherScripts ?? [])])
        if (hint && !refresh && !recovering && latest?.attemptedLanguages?.includes(hint)) {
          return { kind: 'no_sources', otherScripts: knownOffers }
        }
        const resolved = await budget.runLimited(
          Math.max(0, CONFIG.maxTotalFetches - budget.attempts),
          () => resolveEntryLanguages(normalizedWord, session, hint)
        )
        knownOffers = normalizeScriptTargets([...knownOffers, ...(resolved.otherScripts ?? [])])
        const selectedLanguages =
          latest && (missingHint || recovering) && !refresh && hint
            ? resolved.languages.filter((language) => language === hint)
            : resolved.languages
        const languages = selectedLanguages.filter((language) => !failureCooldown(latest, language))
        if (!languages.length && latest && selectedLanguages.length)
          return { kind: 'result', result: latest }
        // Resolution and primary research share the original search mode's ceiling.
        budget.tighten(
          Math.min(
            CONFIG.maxEntryFetches,
            baseFetches + CONFIG.maxFetchesPerExtraLanguage * Math.max(0, languages.length - 1)
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
        if (
          hint &&
          !resolved.incomplete &&
          !resolvedIdentity.incomplete &&
          !resolved.languages.includes(hint)
        )
          attempted.add(hint)
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
        const failedLanguages = { ...latest?.failedLanguages }
        const successfulLanguages = new Set<LanguageCode>()
        const failures: unknown[] = []
        const recordFailure = (language: LanguageCode, error: unknown) => {
          failures.push(error)
          failedLanguages[language] = languageFailure(error)
          console.error(
            '[Research] Language trace failed',
            JSON.stringify({ word: normalizedWord, language, cause: safeError(error) })
          )
          emit?.({
            type: 'language_failed',
            language,
            message: classifyRouteError(error).message,
          })
        }
        outcomes.forEach((outcome, index) => {
          const language = languages[index]
          if (outcome.status === 'fulfilled') {
            delete failedLanguages[language]
            if (outcome.value) {
              entries[language] = outcome.value
              successfulLanguages.add(language)
            }
          } else {
            recordFailure(language, outcome.reason)
          }
        })
        if (hint && !languages.includes(hint)) {
          if (resolved.incomplete || resolvedIdentity.incomplete) {
            const error = new Error(
              'Language resolution incomplete; source availability is unknown'
            )
            if (!latest?.failedLanguages?.[hint]) throw error
            recordFailure(hint, error)
          } else delete failedLanguages[hint]
        }
        if (!successfulLanguages.size && failures.length && !latest) throw failures[0]
        if (
          !successfulLanguages.size &&
          !failures.length &&
          (resolved.incomplete || resolvedIdentity.incomplete)
        )
          throw new Error('Language resolution incomplete; source availability is unknown')
        if (!successfulLanguages.size && !latest) {
          await cacheNegative(normalizedWord, 'no_sources', hint, knownOffers)
          return { kind: 'no_sources', otherScripts: knownOffers }
        }
        if (!successfulLanguages.size && refresh && !failures.length)
          throw new Error('Retrace found no supported sources; the saved entry remains available')
        const retained = latest?.languages.some((language) => !successfulLanguages.has(language))
        // Entries without source provenance retain uncertainty until every saved result is retraced.
        const researchIncomplete =
          (!!successfulLanguages.size &&
            (!!resolved.incomplete || !!resolvedIdentity.incomplete)) ||
          [...successfulLanguages].some((language) => incompleteLanguages.has(language)) ||
          !!(retained && (latest?.researchIncomplete ?? latest?.incomplete))
        const incomplete = researchIncomplete || Object.keys(failedLanguages).length > 0
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
            ...(Object.keys(failedLanguages).length ? { failedLanguages } : {}),
            researchIncomplete,
            ...(incomplete ? { incomplete: true } : {}),
            spellings: latest?.spellings,
          },
          resolvedIdentity.spellings
        )
        await cacheEntry(normalizedWord, result, { incomplete })
        if (resolvedIdentity.language && resolvedIdentity.proofs.length)
          requireSpellingEntry(result, resolvedIdentity.language)
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
        if (hint && result.failedLanguages?.[hint]) return { kind: 'result', result }
        if (hint && !result.entries[hint]) {
          if (!attempted.has(hint)) {
            throw new Error(`Source research incomplete for ${hint}`)
          }
          await cacheNegative(normalizedWord, 'no_sources', hint, knownOffers)
          if (recovering) return { kind: 'result', result }
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
        if (next && settledHintRetry(next.entry)) return { kind: 'result', result: next.entry }
        const cooldown = recoveryRequested(next?.entry)
          ? failureCooldown(next?.entry, hint)
          : undefined
        if (cooldown && next) return { kind: 'result', result: next.entry }
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
        if (
          next &&
          ((!refresh && !recoveryRequested(oldEntry)) || next.entry.tracedAt !== oldEntry?.tracedAt)
        ) {
          if (
            (!hint || next.entry.entries[hint]) &&
            hasEntrySpellings(next.entry, resolvedIdentity.spellings)
          ) {
            if (resolvedIdentity.language && resolvedIdentity.proofs.length)
              requireSpellingEntry(next.entry, resolvedIdentity.language)
            await publishSpellingAliases(next.entry, resolvedIdentity.proofs)
            return { kind: 'result', result: next.entry }
          }
          if (hint && !next.entry.entries[hint] && next.entry.attemptedLanguages?.includes(hint))
            return { kind: 'no_sources', otherScripts: next.entry.otherScripts }
        }
        const negative =
          !refresh && !recoveringSavedFailure ? await getNegativeCache(normalizedWord, hint) : null
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
            if (lookupResolution) emit({ type: 'lookup_resolution', resolution: lookupResolution })
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
    if (error instanceof LookupProposalUnavailable)
      return respond.error(error.message, {
        status: error.status,
        errorType: error.status === 429 ? 'rate_limit' : 'network',
        unaryHeaders: { 'Retry-After': '5' },
      })
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
