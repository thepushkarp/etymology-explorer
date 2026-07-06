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
import type { ApiResponse, EtymologyResult, StreamEvent } from '@/lib/types'
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
}

export interface AdapterResultOptions {
  cached: boolean
  /** Headers applied in both modes. */
  headers?: Record<string, string>
}

export interface ResponseAdapter {
  error(message: string, options: AdapterErrorOptions): Response
  result(result: EtymologyResult, options: AdapterResultOptions): Response
}

export function createResponseAdapter(stream: boolean): ResponseAdapter {
  return {
    error(message, { status, errorType = 'unknown', headers, unaryHeaders, unaryData }) {
      if (stream) {
        return streamErrorResponse(message, errorType, headers)
      }
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: message,
          ...(unaryData !== undefined ? { data: unaryData } : {}),
        },
        { status, headers: { ...headers, ...unaryHeaders } }
      )
    },

    result(result, { cached, headers }) {
      if (stream) {
        return streamResultResponse(result, headers)
      }
      return NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
        { success: true, data: result, cached },
        { headers: { ...UNARY_RESULT_HEADERS, ...headers } }
      )
    },
  }
}
