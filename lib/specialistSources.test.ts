import { afterEach, expect, test } from 'bun:test'
import { parseDiscoveredSpecialist, SPECIALIST_PROVIDERS } from './specialistSources'
import { SourceFetchBudget } from './sourceFetchBudget'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function serve(resolve: (url: URL) => string | Response, status = 200) {
  const requests: URL[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    requests.push(url)
    const response = resolve(url)
    return response instanceof Response ? response : new Response(response, { status })
  }) as typeof fetch
  return requests
}

const provider = (id: string) => SPECIALIST_PROVIDERS.find((item) => item.id === id)!

test('AHD preserves independent exact homographs and excludes suggested compounds', async () => {
  const entry = (id: string, word: string, etymology: string) =>
    `<table><tr><td><a name="${id}"/><div class="rtseg"><b>${word}<sup>1</sup></b></div><div class="pseg">A definition.</div><div class="etyseg">${etymology}</div></td></tr></table>`
  serve(
    () =>
      `<div id="results">${entry('B1', 'bank', 'From Scandinavian.')}${entry('B2', 'bank', 'From Italian banca.')}${entry('B3', 'bank holiday', 'Excluded compound.')}</div>`
  )
  const [result] = await provider('americanHeritage').fetch('bank')
  expect(result.data.entryGroups?.map((group) => group.index)).toEqual(['B1', 'B2'])
  expect(result.data.text).not.toContain('Excluded compound')
  expect(result.data.entryGroups?.[1].sections[0].text).toBe('From Italian banca.')
})

test('De Mauro follows exact numbered entries, preserves inflections, and separates repeated lemma IDs', async () => {
  const requests = serve((url) =>
    url.pathname.startsWith('/cerca/')
      ? '<a class="serp-lemma-title" href="/parola/riso"><sup>1</sup>riso</a><a class="serp-lemma-title" href="/parola/riso_2"><sup>2</sup>riso</a><a class="serp-poli-title" href="/parola/riso-comune">riso comune</a><a class="serp-lemma-title" href="https://other.example/parola/riso">riso</a>'
      : `<h1><sup>${url.pathname.endsWith('_2') ? '2' : '1'}</sup>riso</h1><section id="lemma_lemma">rì|so</section><section id="lemma_qualifica">s.m.</section><section id="lemma_lemma">${url.pathname.endsWith('_2') ? 'Lat. rīsu(m), da ridēre.' : 'Lat. oryza.'}</section><section id="descrizione">Complete senses and examples.</section>`
  )
  const budget = new SourceFetchBudget(3)
  const [result] = await budget.run(() => provider('deMauro').fetch('riso'))
  expect(requests).toHaveLength(3)
  expect(result.data.entryGroups).toHaveLength(2)
  expect(result.data.entryGroups?.[0].sections[0].text).toBe('Lat. oryza.')
  expect(result.data.text).toContain('s.m.')
  expect(result.data.entryGroups?.[1].sourceUrl).toBe(
    'https://dizionario.internazionale.it/parola/riso_2'
  )
})

test('Spanish dictionaries retain lexical boundaries and a shared publishing family', async () => {
  serve((url) =>
    url.hostname === 'dle.rae.es'
      ? '<article data-word="llama" data-homonym-index="1" id="E1"><p data-dle-type="1">Del lat. flamma.</p>Fire</article><article data-word="llama" data-homonym-index="2" id="E2"><p data-dle-type="1">Del quechua llama.</p>Animal</article><article data-word="llamar" id="E3">Wrong lemma</article>'
      : '<entry header="llama" key="llama" id="A1">Regional usage.</entry>'
  )
  const [dle] = await provider('dle').fetch('llama')
  const [damer] = await provider('americanismos').fetch('llama')
  expect(dle.data.entryGroups).toHaveLength(2)
  expect(dle.data.text).not.toContain('Wrong lemma')
  expect(dle.sourceFamily).toBe(damer.sourceFamily)
  expect(damer.evidenceRole).toBe('lexical')
  expect(damer.data.entryGroups?.[0].sections).toEqual([])
})

test('CNRTL selects complete dictionary payloads, preserving two histories without duplicate Wiktionary', async () => {
  const entry = (id: string, etymology: string) =>
    `<div id="${id}"><h2 class="s-entry">AVOCAT</h2><p>${'Definition. '.repeat(1500)}Final attestation.</p><div class="s-section"><h3 class="s-section-title">Étymologie et histoire</h3>${etymology}</div></div>`
  const payload = {
    payload: {
      responses: {
        'entry:avocat::': {
          header: { form: 'avocat' },
          content: [
            {
              id: 'tlfi',
              content: [entry('TLFI_1', 'Latin advocatus.'), entry('TLFI_2', 'Spanish aguacate.')],
            },
            { id: 'etymology', content: ['Duplicate TLFi excerpt.'] },
            { id: 'wiktionnaire', content: ['Duplicate Wiktionary.'] },
            { id: 'littre', content: [entry('LITTRE_1', 'Latin advocatus.')] },
            {
              id: 'academie9',
              content: ['<div id="ACA9_1"><h2 class="s-entry">AVOCAT</h2>A definition.</div>'],
            },
          ],
        },
      },
    },
  }
  const requests = serve(
    () =>
      `<div>Only first history in SSR</div><script>window.__PINIA__=${JSON.stringify(payload)};</script>`
  )
  const results = await provider('cnrtl').fetch('avocat')
  expect(requests).toHaveLength(1)
  expect(results.map((item) => item.provider)).toEqual(['tlfi', 'littre', 'academie'])
  expect(results[0].data.entryGroups).toHaveLength(2)
  expect(results[0].data.entryGroups?.[0].text).not.toContain('aguacate')
  expect(results[0].data.entryGroups?.[1].sections[0].text).toContain('aguacate')
  expect(results[0].data.text).toContain('Final attestation.')
  expect(results[0].data.text.length).toBeGreaterThan(30000)
  expect(results[2].evidenceRole).toBe('lexical')
})

test('Priberam excludes other entries and duplicate locale presentations, including nested variants', async () => {
  const entry = (word: string) =>
    `<div class="dp-definicao"><div class="dp-definicao-header"><span class="varpt">${word}</span><span class="varpb">${word}</span></div><p>Portuguese sense.</p><span class="varpb">Duplicate <span class="varpb">nested duplicate</span></span><div class="dp-seccao-icon"><strong>Origem:</strong>latim.</div><p>Last attestation.</p></div>`
  serve(
    () =>
      `<div id="resultados">${entry('banco')}${entry('banca')}</div><aside>Word of the day</aside>`
  )
  const [result] = await provider('priberam').fetch('banco')
  expect(result.data.entryGroups).toHaveLength(1)
  expect(result.data.text).not.toContain('Duplicate')
  expect(result.data.text).toContain('Last attestation.')
  expect(result.data.entryGroups?.[0].sections[0].text).toContain('latim')
})

test('Michaelis uses the entry rather than the body class and follows only exact homographs', async () => {
  const requests = serve(
    (url) =>
      `<body class="verbete"><nav>Etimologia navigation</nav><div class="verbete bs-component"><E1>manga</E1><Ei>${url.pathname.startsWith('/palavra/') ? '2' : '1'}</Ei><p>Definition.</p><SM>ETIMOLOGIA</SM>${url.pathname.startsWith('/palavra/') ? 'malaiala mangā.' : 'lat manicam.'}</div><ul id="lista_verbetes_links"><li><a href="/palavra/abc/manga-2/">manga<Ei>2</Ei></a></li><li><a href="/palavra/xyz/mangá/">mangá</a></li></ul></body>`
  )
  const [result] = await provider('michaelis').fetch('manga')
  expect(requests).toHaveLength(2)
  expect(result.data.entryGroups).toHaveLength(2)
  expect(result.data.text).not.toContain('navigation')
  expect(result.data.entryGroups?.map((group) => group.sections[0].text)).toEqual([
    'lat manicam.',
    'malaiala mangā.',
  ])
})

test('advertised homographs that are missing or mismatched make retained dictionary evidence incomplete', async () => {
  const requests = serve((url) => {
    if (url.hostname === 'michaelis.uol.com.br') {
      if (url.pathname.startsWith('/palavra/')) return new Response('Not found', { status: 404 })
      return '<div class="verbete bs-component"><E1>manga</E1><Ei>1</Ei><SM>ETIMOLOGIA</SM>lat manicam.</div><ul id="lista_verbetes_links"><li><a href="/palavra/w48WD/manga<Ei>3</Ei>/">manga<Ei>3</Ei></a></li></ul>'
    }
    if (url.pathname.startsWith('/cerca/'))
      return '<a class="serp-lemma-title" href="/parola/riso">riso</a><a class="serp-lemma-title" href="/parola/riso_2"><sup>2</sup>riso</a>'
    return `<h1>${url.pathname.endsWith('_2') ? 'wrong lemma' : 'riso'}</h1><section id="lemma_lemma">rì|so</section><section id="lemma_lemma">Latin.</section><section id="descrizione">Complete available entry.</section>`
  })
  const [michaelis] = await provider('michaelis').fetch('manga')
  expect(michaelis.data.incomplete).toBe(true)
  expect(michaelis.data.entryGroups).toHaveLength(1)
  expect(michaelis.data.text).toContain('manicam')
  expect(decodeURIComponent(requests[1].pathname)).toBe('/palavra/w48WD/manga<Ei>3</Ei>/')
  const [deMauro] = await provider('deMauro').fetch('riso')
  expect(deMauro.data.incomplete).toBe(true)
  expect(deMauro.data.entryGroups).toHaveLength(1)
  expect(deMauro.data.text).toContain('Complete available entry.')
  expect(deMauro.data.text).not.toContain('wrong lemma')
})

test('misses, HTTP failures, caller cancellation, and HTTP budget exhaustion stay distinct', async () => {
  serve(() => '<h1>Verbete não encontrado</h1>')
  expect(await provider('michaelis').fetch('missing')).toEqual([])
  serve(() => 'Blocked', 403)
  await expect(provider('dle').fetch('llama')).rejects.toThrow('HTTP 403')
  const requests = serve(() => 'unused')
  await expect(new SourceFetchBudget(0).run(() => provider('dle').fetch('llama'))).rejects.toThrow(
    'budget exhausted'
  )
  await expect(provider('dle').fetch('llama', AbortSignal.abort())).rejects.toThrow()
  expect(requests).toHaveLength(0)
})

function homographFixture(id: string, url: URL): string {
  if (id === 'deMauro') {
    return url.pathname.startsWith('/cerca/')
      ? '<a class="serp-lemma-title" href="/parola/banco">banco</a><a class="serp-lemma-title" href="/parola/banco_2">banco</a>'
      : '<h1>banco</h1><section id="lemma_lemma">banco</section><section id="lemma_lemma">Latin.</section><section id="descrizione">Complete available entry.</section>'
  }
  return '<div class="verbete bs-component"><E1>banco</E1><p>Complete available entry.</p><SM>ETIMOLOGIA</SM>Latin.</div><ul id="lista_verbetes_links"><a href="/palavra/banco_2">banco</a></ul>'
}

test.each(['deMauro', 'michaelis'])(
  '%s retains fetched homographs when a sibling request fails or exceeds the budget',
  async (id) => {
    for (const failure of [429, 503, new Error('Request timeout after 5000ms'), 'budget']) {
      const requests = serve((url) => {
        if (url.pathname.endsWith('_2')) {
          if (failure instanceof Error) throw failure
          return new Response('Unavailable', { status: Number(failure) })
        }
        return homographFixture(id, url)
      })
      const budget = new SourceFetchBudget(failure === 'budget' ? (id === 'deMauro' ? 2 : 1) : 3)
      const [result] = await budget.run(() => provider(id).fetch('banco'))
      expect(result.data.entryGroups).toHaveLength(1)
      expect(result.data.text).toContain('Complete available entry.')
      expect(result.data.incomplete).toBe(true)
      if (failure === 'budget') expect(requests).toHaveLength(budget.maximum)
    }
    if (id === 'deMauro') {
      serve((url) =>
        url.pathname.startsWith('/cerca/')
          ? homographFixture(id, url)
          : new Response('Unavailable', { status: 429 })
      )
      await expect(provider(id).fetch('banco')).rejects.toThrow('HTTP 429')
    }
  }
)

test.each(['deMauro', 'michaelis'])(
  '%s propagates caller cancellation during a sibling request',
  async (id) => {
    const controller = new AbortController()
    const reason = new Error('Caller disconnected')
    serve((url) => {
      if (url.pathname.endsWith('_2')) {
        controller.abort(reason)
        throw reason
      }
      return homographFixture(id, url)
    })
    await expect(provider(id).fetch('banco', controller.signal)).rejects.toBe(reason)
  }
)

test('recovered Académie entries scope explicit etymology while retaining unaligned document text', () => {
  const document = {
    url: 'https://www.dictionnaire-academie.fr/article/A9A3457',
    text: '# avocat\n\n- DÉFINITION\n- VOISINAGE ALPHABÉTIQUE\n\n## ✻ II. AVOCAT\n\nnom masculin\n\nÉtymologie : Borrowed through Spanish, from Nahuatl.\n\nFruit definition.\n\n- avitaminose, n. f.\n- avocatier, n. m.',
  }
  const [record] = parseDiscoveredSpecialist('avocat', 'fr', document)
  expect(record.sourceFamily).toBe('academieFrancaise')
  expect(record.data.text).toBe(document.text)
  expect(record.data.entryGroups?.[0].sections[0].text).toContain('Nahuatl')
  expect(record.data.entryGroups?.[0].text).not.toContain('avitaminose')
  expect(parseDiscoveredSpecialist('avocate', 'fr', document)).toEqual([])
  expect(parseDiscoveredSpecialist('avocat', 'en', document)).toEqual([])
  expect(
    parseDiscoveredSpecialist('avocat', 'fr', {
      ...document,
      url: 'https://evil.example/article/A9A3457',
    })
  ).toEqual([])
  expect(
    parseDiscoveredSpecialist('avocat', 'fr', {
      ...document,
      text: `${document.text}\n\n## ANOTHER ENTRY`,
    })
  ).toEqual([])
})

test('recovered Académie HTML uses its exact article container and retains complete entry text', () => {
  const document = {
    url: 'https://www.dictionnaire-academie.fr/article/A9A3457',
    text: '<nav>Nearby words.</nav><div class="s_Article" id="A9A3457"><div class="s_EnTete"><h2 class="s_Entree"><span>✻</span><span>II.</span>&nbsp;AVOCAT</h2><span>nom masculin</span><div class="s_zEtym"><span class="sr-only">&Eacute;tymologie : </span>From Nahuatl through Spanish.</div></div><p>Complete fruit definition.</p></div><aside>Alphabetical neighbors.</aside>',
  }
  const [record] = parseDiscoveredSpecialist('avocat', 'fr', document)
  expect(record.data.entryGroups?.[0].text).toContain('Complete fruit definition.')
  expect(record.data.entryGroups?.[0].sections[0].text).toContain('Nahuatl')
  expect(record.data.text).not.toContain('Alphabetical neighbors')
  expect(record.data.text).not.toContain('Nearby words')
  expect(parseDiscoveredSpecialist('avocate', 'fr', document)).toEqual([])
})
