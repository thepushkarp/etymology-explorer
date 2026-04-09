import { describe, expect, test } from 'bun:test'
import { streamErrorResponse, streamResultResponse } from '@/lib/streamingResponse'
import type { EtymologyResult } from '@/lib/types'

const ETYMOLOGY_FIXTURE: EtymologyResult = {
  word: 'love',
  pronunciation: '/lʌv/',
  definition: 'strong affection',
  roots: [],
  ancestryGraph: {
    branches: [],
  },
  lore: 'A compact fixture for stream response tests.',
  sources: [],
}

describe('streamingResponse', () => {
  test('streamResultResponse emits a one-shot SSE result payload', async () => {
    const response = streamResultResponse(ETYMOLOGY_FIXTURE, {
      'X-Protection-Mode': 'normal',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(response.headers.get('x-protection-mode')).toBe('normal')
    expect(await response.text()).toBe(
      `data: ${JSON.stringify({ type: 'result', data: ETYMOLOGY_FIXTURE })}\n\n`
    )
  })

  test('streamErrorResponse keeps SSE-compatible 200 status for EventSource', async () => {
    const response = streamErrorResponse(
      'Monthly budget reached. Cached words still work.',
      'budget'
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(await response.text()).toBe(
      'data: {"type":"error","message":"Monthly budget reached. Cached words still work.","errorType":"budget"}\n\n'
    )
  })
})
