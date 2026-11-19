import { expect, test } from 'bun:test'
import { parseTrendFeed, rankTrends, refreshTrendFeeds, getTrends } from './trends'
const now = Date.UTC(2026, 10, 19, 12)
const hour = 3_600_000
function feed(queries: string[], fetchedAt = now) {
  return { fetchedAt, searches: queries.map((query) => ({ query, startedAt: now - 1000 })) }
}

test('reads Google RSS query titles with XML entities and ignores news titles', () => {
  const date = new Date(now).toUTCString()
  expect(
    parseTrendFeed(
      `<rss><channel><link>https://trends.google.com/trending/rss?geo=JP</link><title>Daily Search Trends</title><item><title>A &amp; B</title><pubDate>${date}</pubDate><news><title>other</title></news></item><item><title><![CDATA[大谷 2026]]></title><pubDate>${date}</pubDate></item></channel></rss>`,
      'JP'
    )
  ).toEqual([
    { query: 'A & B', startedAt: now },
    { query: '大谷 2026', startedAt: now },
  ])
  expect(() => parseTrendFeed('<html/>', 'JP')).toThrow('RSS')
  expect(() =>
    parseTrendFeed('<rss><channel><item><title>incomplete</title></item></channel></rss>', 'JP')
  ).toThrow('date')
})

test('ranks distinct countries, preserving original text, accents, punctuation and script', () => {
  const first = feed([
    'CAFÉ  hoy',
    'Cafe\u0301 hoy',
    'cafe hoy',
    '大谷',
    'a-b',
    'new',
    'old',
    'tie-a',
    'tie-b',
  ])
  const second = feed(['café hoy', '大谷', 'a b', 'new', 'old', 'tie-b', 'tie-a'])
  const third = feed(['Café Hoy', '大谷'])
  first.searches.find((item) => item.query === 'new')!.startedAt = now
  first.searches.find((item) => item.query === 'old')!.startedAt = now - hour * 24
  const response = rankTrends(
    { ES: first, MX: second, JP: third, PT: feed(['cafe hoy'], now - hour) },
    now
  )
  expect(response).toEqual({
    updatedAt: now,
    trends: [
      { query: 'CAFÉ  hoy', countryCount: 3 },
      { query: '大谷', countryCount: 3 },
      { query: 'new', countryCount: 2 },
      { query: 'tie-a', countryCount: 2 },
      { query: 'tie-b', countryCount: 2 },
    ],
  })
  expect(
    rankTrends(
      {
        AA: feed(['a', 'b', 'c', 'd', 'e', 'f', 'g']),
        BB: feed(['a', 'b', 'c', 'd', 'e', 'f', 'g']),
      },
      now
    ).trends
  ).toHaveLength(6)
})

test('partial refresh keeps original timestamps, expires failures and replaces successful empty feeds', async () => {
  const time = Date.now()
  const old = { fetchedAt: time - 1000, searches: [{ query: 'term', startedAt: time }] }
  const previous = { ES: old, MX: { ...old, fetchedAt: time - hour }, US: old }
  let active = 0,
    max = 0
  const next = await refreshTrendFeeds(previous, async (country) => {
    active++
    max = Math.max(max, active)
    await Promise.resolve()
    active--
    if (country === 'ES' || country === 'MX') throw new Error('HTTP 503')
    return []
  })
  expect(next.countries.ES).toEqual(old)
  expect(next.countries.MX).toBeUndefined()
  expect(next.countries.US.searches).toEqual([])
  expect(max).toBe(4)
})

test('concurrent readers share a refresh and a warm read consumes no fetches', async () => {
  const store = new Map<string, unknown>()
  const redis = {
    async get<T>(key: string) {
      return (store.get(key) as T | undefined) ?? null
    },
    async set(key: string, value: string) {
      if (store.has(key)) return null
      store.set(key, value)
      return 'OK'
    },
    async eval(_script: string, keys: string[], args: (string | number)[]) {
      if (store.get(keys[0]) !== args[0]) return 0
      store.set(keys[1], JSON.parse(String(args[1])))
      return 1
    },
  }
  let fetches = 0
  const load = async () => {
    fetches++
    return [{ query: 'live', startedAt: Date.now() - 5000 }]
  }
  const [a, b] = await Promise.all([getTrends(redis, load), getTrends(redis, load)])
  expect(a).toEqual(b)
  expect(a.trends).toEqual([{ query: 'live', countryCount: 24 }])
  expect(await getTrends(redis, load)).toEqual(a)
  expect(fetches).toBe(24)
})
