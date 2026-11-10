import type { EtymologyResult } from './types'
import type { LanguageCode } from './languages'
import { historyEntry } from './resultHistories'
import { canonicalizeWord, isValidWord } from './validation'

export interface RecentSearchPreview {
  word: string
  teaser: string
}

export const RECENT_SEARCH_POOL_SIZE = 20
export const RECENT_SEARCH_DISPLAY_COUNT = 4
const TEASER_LENGTH = 120

export function recentSearchPreview(
  result: EtymologyResult,
  language: LanguageCode
): RecentSearchPreview | null {
  if (result.language !== language || !isValidWord(result.word)) return null
  const primary = historyEntry(result)
  const lore = primary.lore.replace(/\s+/gu, ' ').trim()
  let teaser = lore || primary.definition.trim()
  teaser = teaser
    .replace(/(\*\*|__|\*|_)(?=\S)([^*_]*?\S)\1(?![\p{L}\p{N}])/gu, '$2')
    .replace(/\s+/gu, ' ')
  if (!teaser) return null
  if (teaser.length > TEASER_LENGTH) {
    const prefix = teaser.slice(0, TEASER_LENGTH - 1)
    const boundary = prefix.lastIndexOf(' ')
    teaser = `${(boundary > 0 ? prefix.slice(0, boundary) : prefix).trimEnd()}…`
  }
  return { word: canonicalizeWord(result.word), teaser }
}

/** Validate the small public snapshot without loading full cached entries. */
export function parseRecentSearchPreviews(value: unknown): RecentSearchPreview[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const previews: RecentSearchPreview[] = []
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.word !== 'string' ||
      !isValidWord(entry.word) ||
      typeof entry.teaser !== 'string' ||
      !entry.teaser.trim() ||
      entry.teaser.length > TEASER_LENGTH
    ) {
      continue
    }
    const word = canonicalizeWord(entry.word)
    if (seen.has(word)) continue
    seen.add(word)
    previews.push({ word, teaser: entry.teaser })
    if (previews.length === RECENT_SEARCH_POOL_SIZE) break
  }
  return previews
}

export function landingSearchPreviews(
  recent: RecentSearchPreview[],
  curated: RecentSearchPreview[]
): RecentSearchPreview[] {
  return parseRecentSearchPreviews([...recent, ...curated]).slice(0, RECENT_SEARCH_DISPLAY_COUNT)
}
