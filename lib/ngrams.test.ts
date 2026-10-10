import { expect, test } from 'bun:test'
import { fetchNgram } from './ngrams'

test('ngram fetch preserves a canonical phrase as one encoded query', async () => {
  const originalFetch = globalThis.fetch
  const requests: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input))
    return Response.json([{ ngram: 'pomme de terre', timeseries: [0.01] }])
  }) as typeof fetch
  try {
    const result = await fetchNgram('  POMME\u00a0de  terre ', { corpus: 'fre-2019' })
    expect(result?.word).toBe('pomme de terre')
    expect(new URL(requests[0]).searchParams.get('content')).toBe('pomme de terre')
    expect(new URL(requests[0]).searchParams.get('corpus')).toBe('fre-2019')
    expect(await fetchNgram('\npomme de terre')).toBeNull()
    expect(requests).toHaveLength(1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
