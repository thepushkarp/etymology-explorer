import { afterEach, describe, expect, test } from 'bun:test'
import { fetchSelectedWiktionaryLanguage } from './wiktionary'
import { extractWiktionaryVariants, type WiktionaryTocSection } from './wiktionaryEntryGroups'
import { fetchEtymonline } from './etymonline'
import { fetchIncelsWiki } from './incelsWiki'
import { fetchEnglishWiktionaryLanguage, fetchFreeDictionaryApi } from './multilingualSources'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})
function respond(data: unknown) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const redisUrl = process.env.ETYMOLOGY_KV_REST_API_URL
    if (redisUrl && url.startsWith(redisUrl)) {
      const commands = JSON.parse(String(init?.body))
      return Response.json(
        Array.isArray(commands[0]) ? commands.map(() => ({ result: null })) : { result: null }
      )
    }
    return Response.json(data)
  }) as typeof fetch
}
function section(line: string, index: number, level = 3): WiktionaryTocSection {
  return {
    index: `${index}`,
    number: `${index}`,
    anchor: line.replaceAll(' ', '_'),
    line,
    hLevel: level,
  }
}

describe('complete admitted source retention', () => {
  test('retains every etymology, definition, example and tail reference in selected language', async () => {
    const sections = [section('English', 0, 2)]
    const html = ['<h2 id="English">English</h2>']
    for (let i = 1; i <= 6; i++) {
      sections.push(section(`Etymology ${i}`, i))
      html.push(
        `<h3 id="Etymology_${i}">Etymology ${i}</h3><p>BEGIN${i} ${'full evidence '.repeat(600)} MIDDLE${i}</p><ol>${Array.from({ length: 5 }, (_, d) => `<li>definition ${d}<dl><dd>example ${d}</dd></dl></li>`).join('')}</ol><p>TAIL${i} Reference</p>`
      )
    }
    sections.push(section('French', 7, 2))
    html.push('<h2 id="French">French</h2><p>wrong-language</p>')
    respond({ parse: { title: 'a phrase', revid: 77, text: html.join(''), tocdata: { sections } } })
    const result = await fetchSelectedWiktionaryLanguage('a phrase', 'English')
    expect(result?.entryGroups).toHaveLength(6)
    for (let i = 1; i <= 6; i++) {
      expect(result?.text).toContain(
        `BEGIN${i} ${'full evidence '.repeat(600).trimEnd()} MIDDLE${i}`
      )
      expect(result?.text).toContain(`TAIL${i}`)
    }
    expect(result?.text).toContain('definition 4')
    expect(result?.text).toContain('example 4')
    expect(result?.text).not.toContain('wrong-language')
    expect(result?.revisionId).toBe(77)
  })

  test('definition-only phrase survives and historical lookup never substitutes English', async () => {
    respond({
      parse: {
        title: 'red herring',
        text: '<h2 id="English">English</h2><h3 id="Noun">Noun</h3><ol><li>A misleading clue.</li></ol>',
        tocdata: { sections: [section('English', 0, 2), section('Noun', 1)] },
      },
    })
    expect((await fetchSelectedWiktionaryLanguage('red herring', 'English'))?.text).toContain(
      'misleading clue'
    )
    expect(await fetchSelectedWiktionaryLanguage('red herring', 'Latin')).toBeNull()
  })

  test('admits changed titles only when the API provides an exact redirect relationship', async () => {
    const page = {
      title: 'armor',
      text: '<h2 id="English">English</h2><p>A covering.</p>',
      tocdata: { sections: [section('English', 0, 2)] },
    }
    respond({ parse: page })
    expect(await fetchSelectedWiktionaryLanguage('armour', 'English')).toBeNull()
    respond({ parse: { ...page, redirects: [{ from: 'armour', to: 'armor' }] } })
    const result = await fetchSelectedWiktionaryLanguage('armour', 'English')
    expect(result?.resolvedWord).toBe('armor')
    expect(result?.variants?.[0].relationship).toBe('redirect')
  })

  test('spelling variants are explicit links in the selected language, not inferred replacements', () => {
    const html =
      '<h2 id="English">English</h2><li><span class="form-of-definition use-with-mention"><a href="https://en.wikipedia.org/wiki/American_and_British_English_spelling_differences" class="extiw">British</a> standard spelling of <span class="form-of-definition-link"><i class="Latn mention" lang="en"><a href="/wiki/armor#English">armor</a></i></span></span>.</li><li>Alternative form of <a href="/wiki/arm">arm</a>.</li><h2 id="French">French</h2><li>American spelling of <a href="/wiki/wrong">wrong</a>.</li>'
    const variants = extractWiktionaryVariants(
      html,
      [section('English', 0, 2), section('French', 1, 2)],
      'English'
    )
    expect(variants.map((v) => v.word)).toEqual(['armor'])
  })

  test('multilingual adapters retain more than four groups and complete valid JSON', async () => {
    const sections = [section('Italian', 0, 2)]
    const html = ['<h2 id="Italian">Italian</h2>']
    for (let i = 1; i <= 6; i++) {
      sections.push(section(`Etymology ${i}`, i))
      html.push(
        `<h3 id="Etymology_${i}">Etymology ${i}</h3><p>${'evidence '.repeat(900)} TAIL${i}</p>`
      )
    }
    respond({ parse: { title: 'ferro da stiro', text: html.join(''), tocdata: { sections } } })
    const result = await fetchEnglishWiktionaryLanguage('ferro da stiro', 'it')
    expect(result?.entryGroups).toHaveLength(6)
    expect(result?.text).toContain('TAIL6')
    respond({
      word: 'ferro da stiro',
      entries: Array.from({ length: 5 }, (_, i) => ({
        word: 'ferro da stiro',
        definition: `${'definition '.repeat(800)} TAIL${i}`,
      })),
    })
    const dictionary = await fetchFreeDictionaryApi('ferro da stiro', 'it')
    expect(JSON.parse(dictionary!.text).entries).toHaveLength(5)
    expect(dictionary?.text).toContain('TAIL4')
  })

  test('Etymonline preserves phrase spelling in requested URL and complete entry bodies', async () => {
    let requested = ''
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      requested = String(url)
      return new Response(
        '<h1><em>red herring</em></h1><section class="prose-lg">1590 from Old English BEGIN</section><section class="prose-lg"><div><div>Latin MIDDLE</div></div><div>TAIL</div></section>'
      )
    }) as unknown as typeof fetch
    const result = await fetchEtymonline('red herring')
    expect(requested).toEndWith('/red%20herring')
    expect(result?.text).toContain('BEGIN')
    expect(result?.text).toContain('TAIL')
  })

  test('complete supplemental extracts survive', async () => {
    respond({
      query: {
        pages: { 1: { title: 'phrase', extract: 'BEGIN ' + 'context '.repeat(500) + ' TAIL' } },
      },
    })
    expect((await fetchIncelsWiki('phrase'))?.text).toContain('TAIL')
  })
})
