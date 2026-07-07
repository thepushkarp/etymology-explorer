import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { EtymologyResult } from './types'

/**
 * New-cache path: storing a freshly synthesized result must revalidate the
 * word page's cache tag so /word/{word} stops serving the miss page.
 */

interface FakeRedis {
  set: ReturnType<typeof mock>
  get: ReturnType<typeof mock>
}

let currentRedis: FakeRedis | null = null
const revalidateTagMock = mock(() => undefined)

mock.module('@/lib/redis', () => ({
  getRedis: () => currentRedis,
}))

// Superset of the surface other tests mock, so cross-file module mocks in
// bun's shared registry stay compatible.
mock.module('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: revalidateTagMock,
}))

const { cacheEtymology } = await import('./cache')

const RESULT: EtymologyResult = {
  word: 'nice',
  pronunciation: '/naɪs/',
  definition: 'Pleasant; agreeable.',
  roots: [],
  ancestryGraph: { branches: [] },
  lore: 'From Latin nescius, ignorant.',
  sources: [],
}

function fakeRedis(overrides: Partial<FakeRedis> = {}): FakeRedis {
  return {
    set: mock(async () => 'OK'),
    get: mock(async () => null),
    ...overrides,
  }
}

beforeEach(() => {
  revalidateTagMock.mockClear()
  currentRedis = null
})

describe('cacheEtymology word-page revalidation', () => {
  test('revalidates the normalized per-word tag after a successful write', async () => {
    currentRedis = fakeRedis()

    await cacheEtymology('  NiCe ', RESULT)

    expect(currentRedis.set).toHaveBeenCalledTimes(1)
    expect(revalidateTagMock).toHaveBeenCalledTimes(1)
    expect(revalidateTagMock).toHaveBeenCalledWith('etymology-word:nice', 'max')
  })

  test('does not revalidate when the Redis write fails', async () => {
    currentRedis = fakeRedis({
      set: mock(async () => {
        throw new Error('redis down')
      }),
    })

    await cacheEtymology('nice', RESULT)

    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  test('does not revalidate when Redis is not configured', async () => {
    currentRedis = null

    await cacheEtymology('nice', RESULT)

    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  test('a revalidateTag failure (no request scope) does not break caching', async () => {
    currentRedis = fakeRedis()
    revalidateTagMock.mockImplementationOnce(() => {
      throw new Error('static generation store missing')
    })

    await expect(cacheEtymology('nice', RESULT)).resolves.toBeUndefined()
    expect(currentRedis.set).toHaveBeenCalledTimes(1)
  })
})
