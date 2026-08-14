import type { NextRequest } from 'next/server'
import type { ResponseAdapter } from '@/lib/responseAdapter'
import type { LearnerEtymologyResult, LookupContext, StreamEvent } from '@/lib/types'
import { getCostMode, recordSpend } from '@/lib/costGuard'
import {
  markLockFailure,
  pollForResult,
  releaseLock,
  startLockHeartbeat,
  tryAcquireLock,
} from '@/lib/singleflight'
import { classifyApiError } from '@/lib/apiError'
import { safeError } from '@/lib/errorUtils'
import { incrCounter, incrLanguageCounter } from '@/lib/counters'
import { CONFIG } from '@/lib/config'
import {
  cacheJapaneseNegativeResolution,
  cacheJapaneseResolution,
  cacheJapaneseResult,
  getCachedJapaneseResolution,
  getCachedJapaneseResult,
  getJapaneseNegativeResolution,
} from './cache'
import { resolveJapaneseLexeme, selectJapaneseCandidate } from './resolver'
import { conductJapaneseResearch, hasJapaneseEtymologyEvidence } from './research'
import { buildJapaneseLexicalOnlyResult, synthesizeJapaneseFromResearch } from './synthesis'

const REDIS_DOWN_MESSAGE =
  'New Japanese lookups are temporarily unavailable because the cache service is unreachable.'

function streamResponse(
  run: (emit: (event: StreamEvent) => void) => Promise<LearnerEtymologyResult>,
  headers: Record<string, string>
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const emit = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Client disconnects are handled by the request AbortSignal in the pipeline.
        }
      }
      try {
        const result = await run(emit)
        emit({ type: 'result', data: result })
      } catch (error) {
        const classified = classifyApiError(error)
        emit({ type: 'error', message: classified.message, errorType: classified.streamErrorType })
      }
      try {
        controller.close()
      } catch {
        // The reader may already have cancelled the stream.
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...headers,
    },
  })
}

export async function handleJapaneseEtymology(
  request: NextRequest,
  respond: ResponseAdapter,
  query: string,
  shouldStream: boolean
): Promise<Response> {
  let resolution = await getCachedJapaneseResolution(query)
  if (!resolution && (await getJapaneseNegativeResolution(query))) {
    return respond.error(`No Japanese dictionary entry was found for “${query}”.`, {
      status: 404,
      errorType: 'nonsense',
    })
  }
  if (!resolution) {
    resolution = await resolveJapaneseLexeme(query)
    await cacheJapaneseResolution(query, resolution)
  }
  if (resolution.status === 'not_found') {
    await cacheJapaneseNegativeResolution(query)
    return respond.error(`No Japanese dictionary entry was found for “${query}”.`, {
      status: 404,
      errorType: 'nonsense',
    })
  }

  const requestedEntry = request.nextUrl.searchParams.get('entry')
  const selection = selectJapaneseCandidate(resolution, requestedEntry)
  if (selection.status === 'selection_required') {
    return Response.json(
      { success: false, error: 'selection_required', data: resolution },
      { status: 409 }
    )
  }
  if (selection.status === 'entry_mismatch') {
    return respond.error('The selected Japanese entry does not match this spelling or reading.', {
      status: 404,
      errorType: 'nonsense',
    })
  }
  const candidate = selection.candidate

  const cached = await getCachedJapaneseResult(candidate.entryId)
  if (cached) return respond.result(cached, { cached: true })

  const costMode = await getCostMode()
  if (costMode === 'cache_only') {
    return respond.error('Monthly budget reached. Cached entries still work.', {
      status: 503,
      errorType: 'budget',
      headers: { 'X-Protection-Mode': costMode },
    })
  }

  const lockKey = `lock:etymology:ja:${candidate.entryId}`
  const acquisition = await tryAcquireLock(lockKey)
  if (acquisition.status === 'unavailable' || acquisition.status === 'error') {
    return respond.error(REDIS_DOWN_MESSAGE, { status: 503, errorType: 'network' })
  }

  const lookupContext: LookupContext = {
    query,
    entryId: candidate.entryId,
    canonicalLemma: candidate.lemma,
    canonicalReading: candidate.reading,
    matchType: candidate.matchType,
    matchExplanation: candidate.matchExplanation,
  }

  const runHolder = async (
    token: string,
    emit?: (event: StreamEvent) => void
  ): Promise<LearnerEtymologyResult> => {
    const stopHeartbeat = startLockHeartbeat(lockKey, token)
    try {
      emit?.({ type: 'source_started', source: 'jmdict' })
      const context = await conductJapaneseResearch(candidate, lookupContext, request.signal, emit)
      let result: LearnerEtymologyResult
      if (hasJapaneseEtymologyEvidence(context)) {
        emit?.({ type: 'synthesis_started' })
        try {
          const synthesis = await synthesizeJapaneseFromResearch(context, {
            signal: request.signal,
            onSection: emit
              ? (section, data) => emit({ type: 'synthesis_section', section, data })
              : undefined,
          })
          await recordSpend(synthesis.usage)
          result = synthesis.result
        } catch (error) {
          const usage =
            error && typeof error === 'object' && 'usage' in error
              ? (error as { usage?: Parameters<typeof recordSpend>[0] }).usage
              : undefined
          if (usage) await recordSpend(usage)
          throw error
        }
      } else {
        result = buildJapaneseLexicalOnlyResult(context)
      }
      await cacheJapaneseResult(result)
      await incrCounter('cache_miss')
      await incrLanguageCounter('ja', 'cache_miss')
      return result
    } catch (error) {
      if (!request.signal.aborted) await markLockFailure(lockKey, classifyApiError(error).message)
      throw error
    } finally {
      stopHeartbeat()
      await releaseLock(lockKey, token)
    }
  }

  if (acquisition.status === 'busy') {
    if (shouldStream) {
      return streamResponse(
        async (emit) => {
          emit({ type: 'singleflight_wait', waitedMs: 0 })
          const result = await pollForResult(() => getCachedJapaneseResult(candidate.entryId), {
            maxWaitMs: CONFIG.singleflight.streamWaiterMaxWaitMs,
          })
          if (!result) throw new Error('Request in progress, please retry in a few seconds.')
          return result
        },
        { 'X-Protection-Mode': costMode }
      )
    }
    const result = await pollForResult(() => getCachedJapaneseResult(candidate.entryId))
    if (result) return respond.result(result, { cached: true })
    return respond.error('Request in progress, please retry in a few seconds.', {
      status: 429,
      errorType: 'rate_limit',
      unaryHeaders: { 'Retry-After': '15' },
    })
  }

  if (shouldStream) {
    return streamResponse((emit) => runHolder(acquisition.token, emit), {
      'X-Protection-Mode': costMode,
    })
  }

  try {
    const result = await runHolder(acquisition.token)
    return respond.result(result, {
      cached: false,
      headers: { 'X-Protection-Mode': costMode },
    })
  } catch (error) {
    console.error('[Japanese etymology] Pipeline failed:', safeError(error))
    await incrCounter('error')
    const classified = classifyApiError(error)
    return respond.error(classified.message, {
      status: classified.status,
      errorType: classified.streamErrorType,
    })
  }
}
