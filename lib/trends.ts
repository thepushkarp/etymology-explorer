import { SaxesParser } from 'saxes'
import { getRedis } from './redis'
import { safeError } from './errorUtils'
import { fetchWithTimeout } from './fetchUtils'

const COUNTRIES = 'AR AU BR CA DE EG ES FR GB ID IN IT JP KE KR MX NG NZ PH PK PT TR US ZA'.split(
  ' '
)
const MINUTE = 60_000
const REFRESH_MS = 15 * MINUTE
const MAX_FEED_AGE = 60 * MINUTE
const DAY = 24 * 60 * MINUTE
const SNAPSHOT_KEY = 'trends:v1'
const REFRESH_KEY = 'trends:v1:refresh'

interface Search {
  query: string
  startedAt: number
}
interface CountryFeed {
  fetchedAt: number
  searches: Search[]
}
interface Snapshot {
  refreshedAt: number
  countries: Record<string, CountryFeed>
}
export interface TrendsResponse {
  updatedAt: number | null
  trends: { query: string; countryCount: number }[]
}

/** Only direct RSS item fields describe the search itself. News headlines are unrelated metadata. */
export function parseTrendFeed(xml: string, country: string): Search[] {
  const parser = new SaxesParser()
  const path: string[] = []
  let feedLink = ''
  let title = ''
  let date = ''
  const searches: Search[] = []
  parser.on('opentag', ({ name }) => {
    path.push(name)
    if (path.join('/') === 'rss/channel/item') {
      title = ''
      date = ''
    }
  })
  function content(value: string) {
    if (path.join('/') === 'rss/channel/link') feedLink += value
    if (path.join('/') === 'rss/channel/item/title') title += value
    if (path.join('/') === 'rss/channel/item/pubDate') date += value
  }
  parser.on('text', content)
  parser.on('cdata', content)
  parser.on('closetag', () => {
    if (path.join('/') === 'rss/channel/item') {
      const startedAt = Date.parse(date)
      if (!title.trim() || !Number.isFinite(startedAt))
        throw new Error('Google Trends RSS item missing title or date')
      searches.push({ query: title.trim(), startedAt })
    }
    path.pop()
  })
  parser.write(xml).close()
  // A provider default feed cannot count as an independent market.
  if (!URL.canParse(feedLink) || new URL(feedLink).searchParams.get('geo') !== country)
    throw new Error(`Unexpected Google Trends RSS channel for ${country}`)
  return searches
}

export function rankTrends(countries: Snapshot['countries'], now: number): TrendsResponse {
  const counts = new Map<string, { query: string; countries: Set<string>; startedAt: number }>()
  let updatedAt: number | null = null
  for (const [country, feed] of Object.entries(countries)) {
    if (now - feed.fetchedAt >= MAX_FEED_AGE) continue
    updatedAt = Math.max(updatedAt ?? 0, feed.fetchedAt)
    for (const { query, startedAt } of feed.searches) {
      if (startedAt > now || now - startedAt >= DAY) continue
      const key = query.toLowerCase().normalize('NFC').trim().replace(/\s+/gu, ' ')
      const item = counts.get(key) ?? { query, countries: new Set<string>(), startedAt }
      if (startedAt > item.startedAt || (startedAt === item.startedAt && query < item.query)) {
        item.startedAt = startedAt
        item.query = query
      }
      item.countries.add(country)
      counts.set(key, item)
    }
  }
  const trends = [...counts.values()]
    .filter((item) => item.countries.size >= 2)
    .sort(
      (a, b) =>
        b.countries.size - a.countries.size ||
        b.startedAt - a.startedAt ||
        (a.query < b.query ? -1 : 1)
    )
    .slice(0, 6)
    .map(({ query, countries }) => ({ query, countryCount: countries.size }))
  return { updatedAt, trends }
}

async function fetchCountry(country: string) {
  const response = await fetchWithTimeout(
    `https://trends.google.com/trending/rss?geo=${country}`,
    { cache: 'no-store' },
    5_000,
    AbortSignal.timeout(5_000)
  )
  if (!response.ok) throw new Error(`Google Trends HTTP ${response.status}`)
  return parseTrendFeed(await response.text(), country)
}

export async function refreshTrendFeeds(
  previous: Snapshot['countries'],
  load = fetchCountry
): Promise<Snapshot> {
  const countries: Snapshot['countries'] = {}
  let index = 0
  async function worker() {
    while (index < COUNTRIES.length) {
      const country = COUNTRIES[index++]
      try {
        const searches = await load(country)
        countries[country] = { fetchedAt: Date.now(), searches }
      } catch (error) {
        console.warn(`[Trends] ${country} feed unavailable:`, safeError(error))
        const last = previous[country]
        if (last && Date.now() - last.fetchedAt < MAX_FEED_AGE) countries[country] = last
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return { countries, refreshedAt: Date.now() }
}

interface TrendsRedis {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: string, options: { nx: true; ex: number }): Promise<unknown>
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>
}

export async function getTrends(
  redis: TrendsRedis | null = getRedis(),
  load = fetchCountry
): Promise<TrendsResponse> {
  if (!redis) throw new Error('Shared trends storage unavailable')
  const previous = await redis.get<Snapshot>(SNAPSHOT_KEY)
  const now = Date.now()
  if (previous && now - previous.refreshedAt < REFRESH_MS)
    return rankTrends(previous.countries, now)
  // Keep the lease through the refresh interval, including all-provider failures.
  // Its token also fences a delayed writer after another worker acquires the next interval.
  const token = crypto.randomUUID()
  if (!(await redis.set(REFRESH_KEY, token, { nx: true, ex: REFRESH_MS / 1000 }))) {
    if (previous) return rankTrends(previous.countries, now)
    // On a cold deployment the lease holder is collecting the first snapshot.
    // Readers in other instances can use it as soon as it is published.
    for (let attempt = 0; attempt < 32; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const latest = await redis.get<Snapshot>(SNAPSHOT_KEY)
      if (latest) return rankTrends(latest.countries, Date.now())
    }
    throw new Error('Timed out waiting for the first Google Trends snapshot')
  }
  const snapshot = await refreshTrendFeeds(previous?.countries ?? {}, load)
  const saved = await redis.eval(
    "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]) return 1",
    [REFRESH_KEY, SNAPSHOT_KEY],
    [token, JSON.stringify(snapshot), MAX_FEED_AGE / 1000]
  )
  if (!saved)
    return rankTrends((await redis.get<Snapshot>(SNAPSHOT_KEY))?.countries ?? {}, Date.now())
  return rankTrends(snapshot.countries, Date.now())
}
