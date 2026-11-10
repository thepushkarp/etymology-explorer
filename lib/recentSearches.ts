import { randomInt } from 'node:crypto'
import type { LanguageCode } from './languages'
import { getCachedEntry } from './cache'
import { safeError } from './errorUtils'
import { getRedis } from './redis'
import { canonicalizeWord, isValidWord } from './validation'
import {
  parseRecentSearchPreviews,
  recentSearchPreview,
  RECENT_SEARCH_DISPLAY_COUNT,
  RECENT_SEARCH_POOL_SIZE,
  type RecentSearchPreview,
} from './recentSearchPreview'

interface RecentSearchRedis {
  get(key: string): Promise<unknown>
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>
}

// A single script prevents simultaneous successes from overwriting each other.
// Snapshot text comes from the validated result cache, never the submitted body.
const RECORD_RECENT_SEARCH = `
local raw = redis.call('GET', KEYS[1])
local previous = raw and cjson.decode(raw) or {}
local entry = cjson.decode(ARGV[1])
local entries = {entry}
for _, candidate in ipairs(previous) do
  if candidate.word ~= entry.word and #entries < tonumber(ARGV[2]) then
    table.insert(entries, candidate)
  end
end
redis.call('SET', KEYS[1], cjson.encode(entries))
return #entries
`

const RECENT_SEARCH_KEY = 'recent-searches:v3'

export async function recordRecentSearch(
  word: string,
  client: RecentSearchRedis | null = getRedis(),
  loadEntry = getCachedEntry
): Promise<boolean> {
  if (!client || !isValidWord(word)) return false
  const normalized = canonicalizeWord(word)
  try {
    const cached = await loadEntry(normalized)
    if (!cached || canonicalizeWord(cached.entry.word) !== normalized) return false
    const preview = recentSearchPreview(cached.entry)
    if (!preview) return false
    await client.eval(
      RECORD_RECENT_SEARCH,
      [RECENT_SEARCH_KEY],
      [JSON.stringify(preview), RECENT_SEARCH_POOL_SIZE]
    )
    return true
  } catch (error) {
    console.error('[RecentSearches] Recording failed:', safeError(error))
    return false
  }
}

export async function getRecentSearches(
  client: RecentSearchRedis | null = getRedis(),
  language?: LanguageCode
): Promise<RecentSearchPreview[]> {
  if (!client) return []
  try {
    const pool = parseRecentSearchPreviews(await client.get(RECENT_SEARCH_KEY)).filter(
      (entry) => !language || entry.language === language
    )
    // Partial Fisher–Yates samples without replacement and does not favor recency.
    const count = Math.min(RECENT_SEARCH_DISPLAY_COUNT, pool.length)
    for (let index = 0; index < count; index++) {
      const selected = randomInt(index, pool.length)
      ;[pool[index], pool[selected]] = [pool[selected], pool[index]]
    }
    return pool.slice(0, count)
  } catch (error) {
    console.error('[RecentSearches] Reading failed:', safeError(error))
    return []
  }
}
