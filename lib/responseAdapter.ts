/**
 * Response adapter for routes that serve both SSE (`?stream=true`) and
 * plain JSON from the same handler. Collapses the per-early-return
 * `shouldStream ? streamX(...) : NextResponse.json(...)` duplication:
 * build the adapter once from the stream flag, then every early return
 * states its message/status/headers a single time.
 *
 * Streaming errors always ship as HTTP 200 with a terminal `error` event
 * (EventSource cannot read non-2xx bodies); the `status` option applies
 * to the unary JSON response only.
 */

import { NextResponse } from 'next/server'
import type {
  ApiResponse,
  ScriptTarget,
  WordEntry,
  StreamEvent,
  LookupResolution,
} from '@/lib/types'
import { streamErrorResponse, streamResultResponse } from '@/lib/streamingResponse'

type StreamErrorType = Extract<StreamEvent, { type: 'error' }>['errorType']

/** CDN caching for unary etymology payloads; SSE responses are never cached. */
const UNARY_RESULT_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
} as const

export interface AdapterErrorOptions {
  /** HTTP status for the unary JSON response. */
  status: number
  /** Terminal SSE error event type (streaming mode only). Defaults to 'unknown'. */
  errorType?: StreamErrorType
  /** Headers applied in both modes (e.g. X-Protection-Mode). */
  headers?: Record<string, string>
  /** Headers for the unary JSON response only (e.g. Retry-After). */
  unaryHeaders?: Record<string, string>
  /** Extra payload for the unary JSON body only (e.g. typo suggestions). */
  unaryData?: unknown
  suggestions?: string[]
  otherScripts?: ScriptTarget[]
}

export interface AdapterResultOptions {
  cached: boolean
  identity?: Extract<StreamEvent, { type: 'entry_identity' }>
  /** Headers applied in both modes. */
  headers?: Record<string, string>
}

export interface ResponseAdapter {
  error(message: string, options: AdapterErrorOptions): Response
  result(result: WordEntry, options: AdapterResultOptions): Response
}

export function createResponseAdapter(
  stream: boolean,
  resolution: () => LookupResolution | undefined = () => undefined
): ResponseAdapter {
  return {
    error(
      message,
      { status, errorType = 'unknown', headers, unaryHeaders, unaryData, suggestions, otherScripts }
    ) {
      if (stream) {
        return streamErrorResponse(
          message,
          errorType,
          headers,
          suggestions,
          otherScripts,
          resolution()
        )
      }
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          ...(resolution() ? { lookupResolution: resolution() } : {}),
          error: message,
          ...(suggestions || otherScripts
            ? {
                data: {
                  ...(unaryData && typeof unaryData === 'object' ? unaryData : {}),
                  ...(suggestions ? { suggestions } : {}),
                  ...(otherScripts ? { otherScripts } : {}),
                },
              }
            : unaryData !== undefined
              ? { data: unaryData }
              : {}),
        },
        { status, headers: { ...headers, ...unaryHeaders } }
      )
    },

    result(result, { cached, headers, identity }) {
      if (stream) {
        return streamResultResponse(result, headers, identity, resolution())
      }
      return NextResponse.json<ApiResponse<WordEntry> & { cached: boolean }>(
        {
          success: true,
          data: result,
          cached,
          ...(resolution() ? { lookupResolution: resolution() } : {}),
        },
        {
          headers: {
            ...UNARY_RESULT_HEADERS,
            ...(result.incomplete || resolution() ? { 'Cache-Control': 'no-store' } : {}),
            ...headers,
          },
        }
      )
    },
  }
}
