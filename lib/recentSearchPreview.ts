import type { EtymologyResult, ResultText } from './types'
import type { LanguageCode } from './languages'
import { canonicalizeWord, isValidWord } from './validation'

export interface RecentSearchPreview {
  word: string
  teaser: string
}

export const RECENT_SEARCH_POOL_SIZE = 20
export const RECENT_SEARCH_DISPLAY_COUNT = 4
const TEASER_LENGTH = 120

function localizedText(text: ResultText | undefined, language: LanguageCode): string {
  if (typeof text === 'string') return language === 'en' ? text : ''
  return (language === 'en' ? text?.en : text?.local) ?? ''
}

export function recentSearchPreview(
  result: EtymologyResult,
  language: LanguageCode
): RecentSearchPreview | null {
  if ((result.language ?? 'en') !== language || !isValidWord(result.word)) return null
  const primary = result.histories?.find((history) => history.id === result.primaryHistoryId)
  const lore = localizedText(primary?.lore ?? result.lore, language)
    .replace(/\s+/gu, ' ')
    .trim()
  let teaser = lore || localizedText(primary?.definition ?? result.definition, language).trim()
  teaser = teaser.replace(/\s+/gu, ' ')
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
