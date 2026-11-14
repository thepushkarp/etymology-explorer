import type { WordEntry, ScriptTarget, StreamEvent, LookupResolution } from '@/lib/types'

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

export function streamResultResponse(
  result: WordEntry,
  headers?: HeadersInit,
  identity?: Extract<StreamEvent, { type: 'entry_identity' }>,
  resolution?: LookupResolution
): Response {
  return new Response(
    (resolution ? serializeEvent({ type: 'lookup_resolution', resolution }) : '') +
      (identity ? serializeEvent(identity) : '') +
      serializeEvent({ type: 'result', data: result }),
    {
      status: 200,
      headers: buildHeaders(headers),
    }
  )
}

export function streamErrorResponse(
  message: string,
  errorType: StreamErrorEvent['errorType'] = 'unknown',
  headers?: HeadersInit,
  suggestions?: string[],
  otherScripts?: ScriptTarget[],
  resolution?: LookupResolution
): Response {
  return new Response(
    (resolution ? serializeEvent({ type: 'lookup_resolution', resolution }) : '') +
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
