import type { WordEntry } from './types'
import { canonicalizeWord } from './orthography'
import type { LanguageCode } from './languages'

// A restored router page can carry the pre-trace server payload. Retain a
// bounded set of completed results for this tab without granting trace intent.
const entries = new Map<string, WordEntry>()
const listeners = new Set<() => void>()

function routeKey(word: string, language?: LanguageCode): string {
  return `${language ?? 'auto'}:${canonicalizeWord(word)}`
}

export function rememberCompletedEntry(
  entry: WordEntry,
  requestedWord = entry.word,
  language?: LanguageCode
): void {
  const key = routeKey(requestedWord, language)
  for (const [route, previous] of entries) {
    if (previous.word === entry.word) entries.set(route, entry)
  }
  entries.delete(key)
  entries.set(key, entry)
  if (entries.size > 20) entries.delete(entries.keys().next().value!)
  for (const listener of listeners) listener()
}

export function getCompletedEntry(word: string, language?: LanguageCode): WordEntry | undefined {
  const canonical = canonicalizeWord(word)
  const direct = entries.get(`${language ?? 'auto'}:${canonical}`)
  if (direct) return direct
  for (const entry of entries.values()) {
    if (
      entry.word === canonical &&
      (!language || entry.entries[language] || entry.failedLanguages?.[language])
    ) {
      return entry
    }
  }
  return undefined
}

export function subscribeCompletedEntries(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const noCompletedEntry = () => undefined
