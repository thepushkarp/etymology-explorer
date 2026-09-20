import { afterEach, describe, expect, test } from 'bun:test'
import { fetchWiktionary } from './wiktionary'
import { fetchEtymonline } from './etymonline'
import { fetchFreeDictionary } from './freeDictionary'
import { fetchNativeWiktionary, fetchFreeDictionaryApi } from './multilingualSources'
import { getWordSuggestions } from './wordSuggestions'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})
function reply(data: unknown) {
  globalThis.fetch = (async () => Response.json(data)) as unknown as typeof fetch
}

describe('source spelling boundaries', () => {
  test('rejects a different Wiktionary headword and a foreign-only entry', async () => {
    reply({
      query: {
        pages: {
          '1': { title: 'cote', extract: '== English ==\n=== Etymology ===\nFrom Latin costa.' },
        },
      },
    })
    expect(await fetchWiktionary('côte')).toBeNull()
    reply({
      query: {
        pages: {
          '1': { title: 'côte', extract: '== French ==\n=== Etymology ===\nFrom Latin costa.' },
        },
      },
    })
    expect(await fetchWiktionary('côte')).toBeNull()
  })

  test('accepts canonically equivalent headwords', async () => {
    reply({
      query: {
        pages: {
          '1': {
            title: 'cafe\u0301',
            extract: '== English ==\n=== Etymology ===\nBorrowed from French café.',
          },
        },
      },
    })
    expect((await fetchWiktionary('café'))?.text).toContain('French café')
  })

  test('checks a native Wiktionary response title', async () => {
    reply({
      parse: {
        title: 'cote',
        text: '<h2 id="Français">Français</h2><h3 id="Étymologie">Étymologie</h3><p>Du latin costa.</p>',
        tocdata: {
          sections: [
            { index: '1', line: 'Français', anchor: 'Français', hLevel: 2, number: '1' },
            { index: '2', line: 'Étymologie', anchor: 'Étymologie', hLevel: 3, number: '1.1' },
          ],
        },
      },
    })
    expect(await fetchNativeWiktionary('côte', 'fr')).toBeNull()
  })

  test('checks the headword inside the current Etymonline heading', async () => {
    globalThis.fetch = (async () =>
      new Response(
        '<h1>Origin and history of <em> <!-- -->cote<!-- --> </em></h1><section class="prose-lg">From Latin costa, 1600.</section>'
      )) as unknown as typeof fetch
    expect(await fetchEtymonline('côte')).toBeNull()
    expect((await fetchEtymonline('cote'))?.text).toContain('From Latin costa')
  })

  test('dictionary arrays select the exact entry instead of their first result', async () => {
    reply([
      { word: 'cafe', phonetics: [], meanings: [] },
      { word: 'café', phonetics: [], meanings: [] },
    ])
    expect((await fetchFreeDictionary('café'))?.word).toBe('café')
    reply([{ word: 'cafe', phonetics: [], meanings: [] }])
    expect(await fetchFreeDictionary('café')).toBeNull()
    reply({ word: 'cote', entries: [{ word: 'cote' }] })
    expect(await fetchFreeDictionaryApi('côte', 'fr')).toBeNull()
  })

  test('accent-insensitive suggestions stay explicit, deduplicated choices', async () => {
    const terms: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString())
      expect(url.hostname).toBe('fr.wiktionary.org')
      terms.push(url.searchParams.get('search')!)
      return Response.json(['', ['cote', 'côte', 'co\u0302te', 'côté', '<invalid>']])
    }) as unknown as typeof fetch
    const all = await getWordSuggestions('côte', 'fr')
    expect(all.map((item) => item.word)).toEqual(['côte', 'cote', 'côté'])
    expect(terms.sort()).toEqual(['cote', 'côte'])
    const alternatives = await getWordSuggestions('côte', 'fr', true)
    expect(alternatives.map((item) => item.word)).toEqual(['cote', 'côté'])
  })
})
