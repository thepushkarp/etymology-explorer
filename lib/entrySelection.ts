import { isLanguageCode, wordPagePath, type LanguageCode } from './languages'
import { canonicalizeWord, isValidWord } from './validation'
import { initialCapitalTitle, publisherTitle } from './orthography'

export interface EntrySelection {
  capitalized?: boolean
  lookup?: string
  historyId?: string
}

export function parseEntrySelection(params: URLSearchParams): EntrySelection {
  const raw = params.getAll('lookup')
  const lookup = raw.length === 1 ? canonicalizeWord(raw[0]) : undefined
  const histories = params.getAll('history')
  const historyId = histories.length === 1 ? histories[0] : undefined
  return {
    ...(params.getAll('case').length === 1 && params.get('case') === 'initial'
      ? { capitalized: true }
      : {}),
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
  if (selection.capitalized || initialCapitalTitle(canonicalizeWord(word)) === publisherTitle(word))
    params.set('case', 'initial')
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
    ...selectionForWordPath(url.searchParams, decodeURIComponent(segments.at(-1)!)),
    language,
  }
}

export function selectionForWordPath(params: URLSearchParams, title: string): EntrySelection {
  const selection = parseEntrySelection(params)
  if (initialCapitalTitle(canonicalizeWord(title)) === publisherTitle(title))
    selection.capitalized = true
  return selection
}
