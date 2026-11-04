import { randomInt } from 'node:crypto'
import { getCachedEtymology } from './cache'
import { safeError } from './errorUtils'
import { getRedis } from './redis'
import type { LanguageCode } from './languages'
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

function recentSearchKey(language: LanguageCode): string {
  return `recent-searches:v2:${language}`
}

export async function recordRecentSearch(
  word: string,
  language: LanguageCode,
  client: RecentSearchRedis | null = getRedis(),
  loadResult = getCachedEtymology
): Promise<boolean> {
  if (!client || !isValidWord(word)) return false
  const normalized = canonicalizeWord(word)
  try {
    const result = await loadResult(normalized, language)
    if (!result || canonicalizeWord(result.word) !== normalized) return false
    const preview = recentSearchPreview(result, language)
    if (!preview) return false
    await client.eval(
      RECORD_RECENT_SEARCH,
      [recentSearchKey(language)],
      [JSON.stringify(preview), RECENT_SEARCH_POOL_SIZE]
    )
    return true
  } catch (error) {
    console.error('[RecentSearches] Recording failed:', safeError(error))
    return false
  }
}

export async function getRecentSearches(
  language: LanguageCode,
  client: RecentSearchRedis | null = getRedis()
): Promise<RecentSearchPreview[]> {
  if (!client) return []
  try {
    const pool = parseRecentSearchPreviews(await client.get(recentSearchKey(language)))
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
