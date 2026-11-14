import { isLanguageCode, wordPagePath, type LanguageCode } from './languages'
import { canonicalizeWord, isValidWord } from './validation'

export interface EntrySelection {
  lookup?: string
  historyId?: string
}

export function parseEntrySelection(params: URLSearchParams): EntrySelection {
  const raw = params.getAll('lookup')
  const lookup = raw.length === 1 ? canonicalizeWord(raw[0]) : undefined
  const histories = params.getAll('history')
  const historyId = histories.length === 1 ? histories[0] : undefined
  return {
    lookup: lookup && isValidWord(lookup) ? lookup : undefined,
    historyId:
      historyId && historyId.length <= 512 && !/[\p{Cc}\p{Cf}]/u.test(historyId)
        ? historyId
        : undefined,
  }
}

export function entryPagePath(
  word: string,
  language?: LanguageCode,
  selection: EntrySelection = {}
): string {
  const params = new URLSearchParams()
  if (selection.lookup) params.set('lookup', selection.lookup)
  if (selection.historyId) params.set('history', selection.historyId)
  return `${wordPagePath(word, language)}${params.size ? `?${params}` : ''}`
}

export function selectionFromLocation(href: string, word: string) {
  const url = new URL(href, 'https://etymex.com')
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'word' || ![2, 3].includes(segments.length)) return
  try {
    if (canonicalizeWord(decodeURIComponent(segments.at(-1)!)) !== canonicalizeWord(word)) return
  } catch {
    return
  }
  const language = segments.length === 3 ? segments[1].toLowerCase() : undefined
  if (language !== undefined && !isLanguageCode(language)) return
  return {
    ...parseEntrySelection(url.searchParams),
    language,
  }
}
