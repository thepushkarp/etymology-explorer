import { describe, expect, test } from 'bun:test'
import { createResponseAdapter } from '@/lib/responseAdapter'
import type { EtymologyResult } from '@/lib/types'

const RESULT_FIXTURE: EtymologyResult = {
  word: 'bread',
  pronunciation: '/brɛd/',
  definition: 'staple baked food',
  roots: [],
  ancestryGraph: { branches: [] },
  lore: 'A compact fixture for adapter tests.',
  sources: [],
}

async function readSseEvent(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text()
  expect(body.startsWith('data: ')).toBe(true)
  expect(body.endsWith('\n\n')).toBe(true)
  return JSON.parse(body.slice('data: '.length)) as Record<string, unknown>
}

describe('createResponseAdapter — error parity', () => {
  test('unary errors carry the HTTP status, message, and merged headers', async () => {
    const response = createResponseAdapter(false).error('Redis is down', {
      status: 503,
      errorType: 'network',
      headers: { 'X-Protection-Mode': 'normal' },
      unaryHeaders: { 'Retry-After': '60' },
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('x-protection-mode')).toBe('normal')
    expect(response.headers.get('retry-after')).toBe('60')
    expect(await response.json()).toEqual({ success: false, error: 'Redis is down' })
  })

  test('streaming errors ship as 200 SSE with a terminal error event', async () => {
    const response = createResponseAdapter(true).error('Redis is down', {
      status: 503,
      errorType: 'network',
      headers: { 'X-Protection-Mode': 'normal' },
      unaryHeaders: { 'Retry-After': '60' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('x-protection-mode')).toBe('normal')
    // Unary-only headers must not leak into the SSE response.
    expect(response.headers.get('retry-after')).toBeNull()
    expect(await readSseEvent(response)).toEqual({
      type: 'error',
      message: 'Redis is down',
      errorType: 'network',
    })
  })

  test('unaryData rides the JSON body but never the SSE event', async () => {
    const options = {
      status: 404,
      errorType: 'nonsense',
      unaryData: { suggestion: 'perfidious' },
    } as const

    const unary = createResponseAdapter(false).error('Not a word', options)
    expect(unary.status).toBe(404)
    expect(await unary.json()).toEqual({
      success: false,
      error: 'Not a word',
      data: { suggestion: 'perfidious' },
    })

    const streamed = createResponseAdapter(true).error('Not a word', options)
    expect(await readSseEvent(streamed)).toEqual({
      type: 'error',
      message: 'Not a word',
      errorType: 'nonsense',
    })
  })

  test('errorType defaults to unknown for streaming errors', async () => {
    const response = createResponseAdapter(true).error('Boom', { status: 500 })
    expect((await readSseEvent(response)).errorType).toBe('unknown')
  })
})

describe('createResponseAdapter — result parity', () => {
  test('unary results include cached flag, CDN cache headers, and extra headers', async () => {
    const response = createResponseAdapter(false).result(RESULT_FIXTURE, {
      cached: true,
      headers: { 'X-Protection-Mode': 'normal' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=86400, stale-while-revalidate=604800'
    )
    expect(response.headers.get('x-protection-mode')).toBe('normal')
    expect(await response.json()).toEqual({
      success: true,
      data: RESULT_FIXTURE as unknown as Record<string, unknown>,
      cached: true,
    })
  })

  test('streaming results are one-shot SSE result events without CDN caching', async () => {
    const response = createResponseAdapter(true).result(RESULT_FIXTURE, {
      cached: true,
      headers: { 'X-Protection-Mode': 'normal' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(response.headers.get('x-protection-mode')).toBe('normal')
    expect(await readSseEvent(response)).toEqual({
      type: 'result',
      data: RESULT_FIXTURE as unknown as Record<string, unknown>,
    })
  })
})
