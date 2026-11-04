import { afterEach, expect, test } from 'bun:test'
import { fetchBosworthToller, HISTORICAL_SOURCES } from './historicalSources'
import { SourceFetchBudget } from './sourceFetchBudget'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function serve(payload: unknown, status = 200) {
  const requests: Array<{ url: URL; init?: RequestInit }> = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: new URL(String(input)), init })
    return Response.json(payload, { status })
  }) as typeof fetch
  return requests
}

const main = {
  id: 28714,
  orthographic: 'STÁN',
  is_deletion: 0,
  grammar: '<p>stán, es; m.</p>',
  body: '<p>A stone. Attested examples.</p>',
  etymology: '<p>Compare Gothic stains.</p>',
  der: '<p>Derived forms.</p>',
  see: '<p>Related entry.</p>',
  updated_at: '2020-06-27 21:27:48',
}

test('Old English lookup retains complete main and supplement entries with separate citations', async () => {
  const requests = serve({
    data: [
      main,
      { ...main, id: 58460, orthographic: 'stán', body: '<p>A milestone.</p>', etymology: null },
      { ...main, id: 3, orthographic: 'baswa stán' },
      { ...main, id: 4, is_deletion: 1 },
    ],
    last_page: 2,
    next_page_url: 'http://127.0.0.1:8081/private',
  })
  const budget = new SourceFetchBudget(1)
  const result = await budget.run(() => fetchBosworthToller('stān'))
  expect(requests).toHaveLength(1)
  expect(budget.attempts).toBe(1)
  expect(requests[0].init?.method).toBe('POST')
  expect(JSON.parse(requests[0].url.searchParams.get('q')!).fields).toEqual([
    { query: 'stan', field: 'headword', is_regex: false },
  ])
  expect(result?.requestedWord).toBe('stān')
  expect(result?.entryGroups).toHaveLength(2)
  expect(result?.entryGroups?.map((entry) => entry.sourceUrl)).toEqual([
    'https://bosworthtoller.com/28714',
    'https://bosworthtoller.com/58460',
  ])
  expect(result?.text).toContain('Compare Gothic stains.')
  expect(result?.text).toContain('Derived forms.')
  expect(result?.text).toContain('A milestone.')
  expect(result?.text).not.toContain('baswa stán')
  expect(result?.lexicalLanguage).toBe('Old English')
  expect(result?.incomplete).toBe(true)
})

test('Old English quantity normalization preserves distinct consonants and separators', async () => {
  serve({ data: [{ ...main, orthographic: 'þēod-hūs' }] })
  expect(await fetchBosworthToller('ðēod-hūs')).toBeNull()
  expect(await fetchBosworthToller('þēod hūs')).toBeNull()
  expect((await fetchBosworthToller('þéod-hús'))?.entryGroups).toHaveLength(1)
})

test('Logeion uses the requested dictionary and preserves complete independent entries', async () => {
  const ending = 'Full final attestation.'
  const text = `<p>λόγος, word. ${'An attested usage. '.repeat(4500)}${ending}</p>`
  const requests = serve({
    detail: {
      headword: 'λόγος',
      dicos: [
        { dname: 'LSJ', es: [text, '<p>Separate entry.</p>'] },
        { dname: 'LewisShort', es: ['Wrong language'] },
        { dname: 'Brill', es: ['Unselected dictionary'] },
      ],
    },
  })
  const result = await HISTORICAL_SOURCES.find((source) => source.id === 'lsj')!.fetch('λόγος')
  expect(requests[0].url.searchParams.get('w')).toBe('λόγος')
  expect(requests[0].url.searchParams.has('key')).toBe(false)
  expect(result?.entryGroups).toHaveLength(2)
  expect(result?.text).toContain(ending)
  expect(result?.text).not.toContain('Wrong language')
  expect(result?.text).not.toContain('Unselected dictionary')
  expect(result?.sourceFamily).toBe('lsj')
})

test('Latin quantity marks affect only provider lookup and Greek identities remain exact', async () => {
  const requests = serve({
    detail: { headword: 'nescius', dicos: [{ dname: 'LewisShort', es: ['Ignorant.'] }] },
  })
  const result = await HISTORICAL_SOURCES.find((source) => source.id === 'lewisShort')!.fetch(
    'nescĭus'
  )
  expect(requests[0].url.searchParams.get('w')).toBe('nescius')
  expect(result?.requestedWord).toBe('nescĭus')
  expect(result?.resolvedWord).toBe('nescius')
  serve({ detail: { headword: 'λόγος', dicos: [{ dname: 'LSJ', es: ['A word.'] }] } })
  expect(await HISTORICAL_SOURCES.find((source) => source.id === 'lsj')!.fetch('λόγου')).toBeNull()
})

test('missing entries are distinct from blocked and malformed source responses', async () => {
  serve({ data: [] })
  expect(await fetchBosworthToller('missing')).toBeNull()
  serve({}, 403)
  await expect(fetchBosworthToller('blocked')).rejects.toThrow('HTTP 403')
  serve({ unexpected: [] })
  await expect(fetchBosworthToller('broken')).rejects.toThrow('invalid entry collection')
  serve({ detail: { headword: 'missing', dicos: [] } })
  expect(await HISTORICAL_SOURCES[1].fetch('missing')).toBeNull()
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError('Connection reset'))
        },
      })
    )) as unknown as typeof fetch
  await expect(HISTORICAL_SOURCES[1].fetch('interrupted')).rejects.toThrow('response read failed')
})

test('caller cancellation and source budget exhaustion prevent HTTP attempts', async () => {
  const requests = serve({ data: [] })
  const controller = new AbortController()
  controller.abort()
  await expect(fetchBosworthToller('stone', controller.signal)).rejects.toThrow()
  await expect(new SourceFetchBudget(0).run(() => fetchBosworthToller('stone'))).rejects.toThrow(
    'Source HTTP request budget exhausted'
  )
  expect(requests).toHaveLength(0)
})
