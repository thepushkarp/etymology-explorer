import type { EtymologyResult, StreamEvent } from '@/lib/types'

const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const

type StreamErrorEvent = Extract<StreamEvent, { type: 'error' }>

function buildHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(STREAM_HEADERS)

  if (!headers) {
    return merged
  }

  const extraHeaders = new Headers(headers)
  extraHeaders.forEach((value, key) => {
    merged.set(key, value)
  })

  return merged
}

function serializeEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export function streamResultResponse(result: EtymologyResult, headers?: HeadersInit): Response {
  return new Response(serializeEvent({ type: 'result', data: result }), {
    status: 200,
    headers: buildHeaders(headers),
  })
}

export function streamErrorResponse(
  message: string,
  errorType: StreamErrorEvent['errorType'] = 'unknown',
  headers?: HeadersInit
): Response {
  return new Response(serializeEvent({ type: 'error', message, errorType }), {
    status: 200,
    headers: buildHeaders(headers),
  })
}
