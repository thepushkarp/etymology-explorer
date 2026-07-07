import { afterEach, describe, expect, test } from 'bun:test'
import {
  compactFreeDictionary,
  fetchFreeDictionary,
  type FreeDictionaryEntry,
} from '@/lib/freeDictionary'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('fetchFreeDictionary timeout', () => {
  test('aborts a hanging upstream instead of blocking the research phase', async () => {
    // A fetch that never resolves unless the abort signal fires.
    globalThis.fetch = ((_url: unknown, options?: RequestInit) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })) as typeof fetch

    const startedAt = Date.now()
    const result = await fetchFreeDictionary('telephone', 50)
    const elapsed = Date.now() - startedAt

    expect(result).toBeNull() // fails soft
    expect(elapsed).toBeLessThan(1000) // did not hang past the timeout
  })

  test('returns the first entry from a healthy response', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify([{ word: 'telephone', phonetics: [], meanings: [] }]), {
          status: 200,
        })
      )) as unknown as typeof fetch

    const result = await fetchFreeDictionary('telephone', 1000)

    expect(result?.word).toBe('telephone')
  })

  test('returns null on 404 without throwing', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response('not found', { status: 404 }))) as unknown as typeof fetch

    expect(await fetchFreeDictionary('zzzzz', 1000)).toBeNull()
  })
})

describe('compactFreeDictionary', () => {
  test('keeps origin, phonetics, and up to three definitions per POS — drops the rest', () => {
    const entry: FreeDictionaryEntry = {
      word: 'telephone',
      phonetic: '/ˈtɛlɪfoʊn/',
      phonetics: [
        { text: '/ˈtɛlɪfoʊn/', audio: 'https://example.com/telephone-us.mp3' },
        { text: '/ˈtelɪfəʊn/' },
      ],
      meanings: [
        {
          partOfSpeech: 'noun',
          definitions: [
            { definition: 'first', example: 'example one' },
            { definition: 'second' },
            { definition: 'third' },
            { definition: 'fourth must be dropped' },
          ],
        },
        { partOfSpeech: 'verb', definitions: [{ definition: 'to call' }] },
      ],
      origin: 'late 19th century: from French téléphone',
    }

    const compact = compactFreeDictionary(entry)

    expect(compact).toBe(
      [
        'Phonetics: /ˈtɛlɪfoʊn/, /ˈtelɪfəʊn/',
        'Origin: late 19th century: from French téléphone',
        'noun: first | second | third',
        'verb: to call',
      ].join('\n')
    )
    expect(compact).not.toContain('.mp3')
    expect(compact).not.toContain('example one')
  })

  test('tolerates malformed entries missing arrays', () => {
    const entry = { word: 'x' } as FreeDictionaryEntry

    expect(compactFreeDictionary(entry)).toBe('')
  })
})
