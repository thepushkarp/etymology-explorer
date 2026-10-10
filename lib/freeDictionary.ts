import { canonicalizeWord, sameSpelling } from './orthography'
import { CONFIG } from './config'
import { fetchWithTimeout } from './fetchUtils'
import { safeError } from './errorUtils'

export interface FreeDictionaryEntry {
  word: string
  phonetic?: string
  phonetics: Array<{
    text?: string
    audio?: string
  }>
  meanings: Array<{
    partOfSpeech: string
    definitions: Array<{
      definition: string
      example?: string
    }>
  }>
  entries?: FreeDictionaryEntry[]
  sourceUrls?: string[]
  license?: { name?: string; url?: string }
  origin?: string
}

export async function fetchFreeDictionary(
  word: string,
  timeoutMs: number = CONFIG.timeouts.source,
  signal?: AbortSignal
): Promise<FreeDictionaryEntry | null> {
  try {
    const response = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(canonicalizeWord(word))}`,
      { next: { revalidate: 86400 } },
      timeoutMs,
      signal
    )

    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Free Dictionary API: ${response.status}`)
    }

    const data = await response.json()
    const entry = (Array.isArray(data) ? data : [data]).filter(
      (candidate: FreeDictionaryEntry) =>
        typeof candidate?.word === 'string' && sameSpelling(candidate.word, word)
    ) as FreeDictionaryEntry[]
    if (!entry.length) return null
    return { ...entry[0], entries: entry }
  } catch (error) {
    console.error('Free Dictionary fetch failed:', safeError(error))
    return null
  }
}

/** Serialize every matching entry with complete definitions, examples and references. */
export function compactFreeDictionary(entry: FreeDictionaryEntry): string {
  const entries = entry.entries ?? [entry]
  return entries.map((item) => JSON.stringify({ ...item, entries: undefined })).join('\n')
}
