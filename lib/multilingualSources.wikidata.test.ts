import { afterEach, describe, expect, mock, test } from 'bun:test'
import { fetchWikidataLexeme } from './multilingualSources'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Wikidata Lexeme language identity', () => {
  test('searches broadly and retains only target-language lemma and form matches', async () => {
    const requestedUrls: URL[] = []
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString())
      if (url.hostname !== 'www.wikidata.org') return jsonResponse([{ result: null }])
      requestedUrls.push(url)

      if (url.searchParams.get('action') === 'wbsearchentities') {
        return jsonResponse({
          search: [
            { id: 'L1', label: 'vite' },
            { id: 'L2', label: 'vite' },
            { id: 'L3', label: 'vite' },
            { id: 'L4', label: 'vite' },
            { id: 'L5', label: 'vite' },
            { id: 'L6', label: 'vite' },
            { id: 'L7', label: 'vita' },
            { id: 'L8', label: 'vite' },
          ],
        })
      }

      return jsonResponse({
        entities: {
          L1: {
            id: 'L1',
            type: 'lexeme',
            language: 'Q150',
            lemmas: { fr: { language: 'fr', value: 'vite' } },
            marker: 'wrong-language',
          },
          L2: {
            id: 'L2',
            type: 'lexeme',
            language: 'Q11051',
            lemmas: { sv: { language: 'sv', value: 'vite' } },
            marker: 'wrong-language-2',
          },
          L3: {
            id: 'L3',
            type: 'lexeme',
            language: 'Q150',
            lemmas: { fr: { language: 'fr', value: 'vite' } },
            marker: 'wrong-language-3',
          },
          L4: {
            id: 'L4',
            type: 'lexeme',
            language: 'Q25167',
            lemmas: { nb: { language: 'nb', value: 'vite' } },
            marker: 'wrong-language-4',
          },
          L5: {
            id: 'L5',
            type: 'lexeme',
            language: 'Q188',
            lemmas: { de: { language: 'de', value: 'vite' } },
            marker: 'wrong-language-5',
          },
          L6: {
            id: 'L6',
            type: 'lexeme',
            language: 'Q652',
            lemmas: { it: { language: 'it', value: 'vite' } },
            marker: 'matching-lemma',
          },
          L7: {
            id: 'L7',
            type: 'lexeme',
            language: 'Q652',
            lemmas: { it: { language: 'it', value: 'vita' } },
            forms: [{ representations: { it: { language: 'it', value: 'VITE' } } }],
            marker: 'matching-form',
          },
          L8: {
            id: 'L8',
            type: 'lexeme',
            language: 'Q652',
            lemmas: { fr: { language: 'fr', value: 'vite' } },
            marker: 'wrong-text-language',
          },
        },
      })
    }) as unknown as typeof fetch

    const result = await fetchWikidataLexeme('vite', 'it')

    expect(requestedUrls).toHaveLength(2)
    expect(requestedUrls[0].searchParams.get('limit')).toBe('20')
    expect(requestedUrls[1].searchParams.get('ids')).toBe('L1|L2|L3|L4|L5|L6|L7|L8')
    expect(requestedUrls[1].searchParams.has('props')).toBe(false)
    expect(result?.url).toBe('https://www.wikidata.org/wiki/L6')

    const serialized = JSON.parse(result?.text ?? '{}') as {
      entities?: Record<
        string,
        { lemmas?: Record<string, { value?: string }>; forms?: Array<{ representations?: object }> }
      >
    }
    expect(Object.keys(serialized.entities ?? {})).toEqual(['L6', 'L7'])
    expect(serialized.entities?.L6?.lemmas?.it?.value).toBe('vite')
    expect(serialized.entities?.L7?.forms).toHaveLength(1)
    expect(result?.text.endsWith('}')).toBe(true)
    expect(result?.text).not.toContain('wrong-language')
    expect(result?.text).not.toContain('wrong-text-language')
  })

  test('rejects same-spelling entities when none belong to the requested language', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString())
      if (url.hostname !== 'www.wikidata.org') return jsonResponse([{ result: null }])
      if (url.searchParams.get('action') === 'wbsearchentities') {
        return jsonResponse({ search: [{ id: 'L10', label: 'sale' }] })
      }
      return jsonResponse({
        entities: {
          L10: {
            id: 'L10',
            type: 'lexeme',
            language: 'Q1321',
            lemmas: { es: { language: 'es', value: 'sale' } },
          },
        },
      })
    }) as unknown as typeof fetch

    expect(await fetchWikidataLexeme('sale', 'it')).toBeNull()
  })

  test('accepts a regional language tag whose primary language matches the request', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString())
      if (url.hostname !== 'www.wikidata.org') return jsonResponse([{ result: null }])
      if (url.searchParams.get('action') === 'wbsearchentities') {
        return jsonResponse({ search: [{ id: 'L20', label: 'saudade' }] })
      }
      return jsonResponse({
        entities: {
          L20: {
            id: 'L20',
            type: 'lexeme',
            language: 'Q5146',
            lemmas: { 'pt-br': { language: 'pt-BR', value: 'Saudade' } },
          },
        },
      })
    }) as unknown as typeof fetch

    const result = await fetchWikidataLexeme('saudade', 'pt')
    expect(result?.url).toBe('https://www.wikidata.org/wiki/L20')
  })
})
