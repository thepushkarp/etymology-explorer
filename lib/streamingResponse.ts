import type { WordEntry, ScriptTarget, StreamEvent } from '@/lib/types'

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

export function streamResultResponse(result: WordEntry, headers?: HeadersInit): Response {
  return new Response(serializeEvent({ type: 'result', data: result }), {
    status: 200,
    headers: buildHeaders(headers),
  })
}

export function streamErrorResponse(
  message: string,
  errorType: StreamErrorEvent['errorType'] = 'unknown',
  headers?: HeadersInit,
  suggestions?: string[],
  otherScripts?: ScriptTarget[]
): Response {
  return new Response(
    serializeEvent({
      type: 'error',
      message,
      errorType,
      ...(suggestions ? { suggestions } : {}),
      ...(otherScripts ? { otherScripts } : {}),
    }),
    {
      status: 200,
      headers: buildHeaders(headers),
    }
  )
}
