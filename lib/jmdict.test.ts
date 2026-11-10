import { afterEach, expect, test } from 'bun:test'
import fixtures from './__fixtures__/jmdict/jisho.json'
import { parseDictionaryText } from './etymologyParser'
import { fetchJmdict, parseJmdictResponse, type JmdictGateRedis } from './jmdict'
import { SourceFetchBudget } from './sourceFetchBudget'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('reading-only matches preserve all exact homographs and exclude approximate suggestions', () => {
  const [record] = parseJmdictResponse(' パン ', fixtures['パン'].response)
  expect(record.data.entryGroups?.map((group) => group.index)).toEqual([
    'jmdict:パン:sense:1',
    'jmdict:パン:sense:2',
    'jmdict:パン-2:sense:1',
    'jmdict:パン-1:sense:1',
    'jmdict:パン-1:sense:2',
    'jmdict:パーン-1:sense:1',
  ])
  expect(record.data.text).toContain('“pão”')
  expect(record.data.text).toContain('originally written 麺麭 or 麪包')
  expect(record.data.text).not.toContain('underpants')
  expect(record.data.entryGroups?.[2].sourceUrl).toBe('https://jisho.org/word/%E3%83%91%E3%83%B3-2')
  expect(record.data.license).toContain('Electronic Dictionary Research and Development Group')
  expect(record.data.license).toContain('https://creativecommons.org/licenses/by-sa/4.0/')
  expect(parseJmdictResponse('パンツー', fixtures['パン'].response)).toEqual([])
})

test('JMdict attribution and lexical sense classes exclude mixed name and Wikipedia evidence', () => {
  for (const query of ['津波', 'つなみ']) {
    const [record] = parseJmdictResponse(query, fixtures['津波'].response)
    expect(record.data.entryGroups).toHaveLength(1)
    expect(record.data.text).toContain('tidal wave')
    expect(record.data.text).not.toContain('"parts_of_speech":["Place"]')
    expect(record.data.text).not.toContain('Wikipedia definition')
  }
  const namesOnly = structuredClone(fixtures['津波'].response)
  namesOnly.data[0].attribution.jmdict = false
  expect(parseJmdictResponse('津波', namesOnly)).toEqual([])
})

test('lexical verb classes retain their conjugation-ending qualifiers', () => {
  // First lexical sense of Jisho's recorded 買う response.
  const response = {
    meta: { status: 200 },
    data: [
      {
        slug: '買う',
        japanese: [{ word: '買う', reading: 'かう' }],
        attribution: { jmdict: true, jmnedict: false, dbpedia: false },
        senses: [
          {
            english_definitions: ['to buy', 'to purchase'],
            parts_of_speech: ["Godan verb with 'u' ending", 'Transitive verb'],
            links: [],
            tags: [],
            restrictions: [],
            see_also: [],
            antonyms: [],
            source: [],
            info: [],
          },
        ],
      },
    ],
  }
  const [record] = parseJmdictResponse('買う', response)
  expect(record.data.entryGroups).toHaveLength(1)
  expect(record.data.text).toContain("Godan verb with 'u' ending")
  expect(record.data.text).toContain('to purchase')
  for (const nonlexical of ['Place', 'Person', 'Wikipedia definition']) {
    response.data[0].senses[0].parts_of_speech = [nonlexical]
    expect(parseJmdictResponse('買う', response)).toEqual([])
  }
})

test('sense restrictions apply to query-matching spelling/reading pairs', () => {
  const original = fixtures['津波'].response
  const response = {
    ...original,
    data: [
      {
        ...original.data[0],
        japanese: [
          { word: '津波', reading: 'つなみ' },
          { word: '海嘯', reading: 'かいしょう' },
        ],
        senses: [{ ...original.data[0].senses[0], restrictions: ['海嘯'] }],
      },
    ],
  }
  expect(parseJmdictResponse('津波', response)).toEqual([])
  expect(parseJmdictResponse('つなみ', response)).toEqual([])
  const [admitted] = parseJmdictResponse('かいしょう', response)
  expect(admitted.data.text).toContain('"restrictions":["海嘯"]')
  response.data[0].senses[0].restrictions = ['つなみ']
  expect(parseJmdictResponse('津波', response)).toHaveLength(1)
  expect(parseJmdictResponse('海嘯', response)).toEqual([])
})

test('source material, wasei, and abbreviation metadata never manufacture donor ancestry', () => {
  const cases = [
    ['アルバイト', '“Arbeit”'],
    ['サラリーマン', '“salaryman”'],
    ['ナイター', '“nighter”'],
    ['コンセント', '“concent(ric plug)”'],
    ['マイブーム', '“my boom”'],
    ['テレビ', 'Abbreviation'],
  ] as const
  for (const [query, material] of cases) {
    const [record] = parseJmdictResponse(query, fixtures[query].response)
    expect(record.evidenceRole).toBe('lexical')
    expect(record.data.text).toContain(material)
    expect(record.data.text).toContain('extent: unknown')
    expect(record.data.entryGroups?.every((group) => group.sections.length === 0)).toBe(true)
    expect(parseDictionaryText(record.data.text, query, 'jmdict').links).toEqual([])
  }
  expect(parseJmdictResponse('テレビ', fixtures['テレビ'].response)[0].data.text).toContain(
    '"source":[]'
  )
})

function gate(clock: () => number): JmdictGateRedis {
  const expirations = new Map<string, number>()
  return {
    async set(key, _value, options) {
      if ((expirations.get(key) ?? -1) > clock()) return null
      expirations.set(key, clock() + options.ex * 1000)
      return 'OK'
    },
  }
}

test('one global gate paces concurrent words and permits the next request after clock expiry', async () => {
  let now = 0
  const redis = gate(() => now)
  const requests: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input))
    return Response.json(fixtures['パン'].response)
  }) as typeof fetch
  const budget = new SourceFetchBudget(3)
  const concurrent = await budget.run(() =>
    Promise.allSettled([
      fetchJmdict('パン', undefined, redis),
      fetchJmdict('テレビ', undefined, redis),
      fetchJmdict('津波', undefined, redis),
    ])
  )
  expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(requests).toHaveLength(1)
  expect(budget.attempts).toBe(1)
  now = 39_999
  await expect(fetchJmdict('パン', undefined, redis)).rejects.toThrow('crawl delay active')
  now = 40_000
  const [record] = await budget.run(() => fetchJmdict('パン', undefined, redis))
  expect(requests).toHaveLength(2)
  expect(budget.attempts).toBe(2)
  expect(record.data.retrieval?.method).toBe('direct')
})

test('an unavailable or denied Redis gate fails closed without source HTTP attempts', async () => {
  const requests: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input))
    return Response.json(fixtures['パン'].response)
  }) as typeof fetch
  await expect(fetchJmdict('パン', undefined, null)).rejects.toThrow('not configured')
  await expect(
    fetchJmdict('パン', undefined, {
      set: async () => {
        throw new Error('Redis offline')
      },
    })
  ).rejects.toThrow('Redis crawl gate failed: Redis offline')
  await expect(fetchJmdict('パン', undefined, { set: async () => null })).rejects.toThrow(
    'crawl delay active'
  )
  const budget = new SourceFetchBudget(0)
  await expect(
    budget.run(() =>
      fetchJmdict(
        'パン',
        undefined,
        gate(() => 0)
      )
    )
  ).rejects.toThrow('budget exhausted')
  expect(requests).toEqual([])
})

test('blocked/rate-limited HTTP responses remain failures and cancellation stops dispatch', async () => {
  for (const status of [403, 429]) {
    globalThis.fetch = (async () => new Response('', { status })) as unknown as typeof fetch
    await expect(
      fetchJmdict(
        'パン',
        undefined,
        gate(() => 0)
      )
    ).rejects.toThrow(`HTTP ${status}`)
  }
  const controller = new AbortController()
  let acquired = false
  const redis = {
    set: async () => {
      acquired = true
      return 'OK'
    },
  }
  controller.abort()
  await expect(fetchJmdict('パン', controller.signal, redis)).rejects.toThrow()
  expect(acquired).toBe(false)
  expect(() => parseJmdictResponse('パン', { data: [] })).toThrow('invalid dictionary data')
})
