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
  origin?: string
}

export async function fetchFreeDictionary(
  word: string,
  timeoutMs: number = CONFIG.timeouts.source,
  signal?: AbortSignal
): Promise<FreeDictionaryEntry | null> {
  try {
    const response = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { next: { revalidate: 86400 } },
      timeoutMs,
      signal
    )

    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Free Dictionary API: ${response.status}`)
    }

    const data = await response.json()
    const entry = (Array.isArray(data) ? data[0] : data) as FreeDictionaryEntry
    if (!entry || typeof entry !== 'object') return null
    return entry
  } catch (error) {
    console.error('Free Dictionary fetch failed:', safeError(error))
    return null
  }
}

const MAX_DEFINITIONS_PER_POS = 3

/**
 * Compact a Free Dictionary entry into the few lines the synthesis prompt
 * actually needs: origin, phonetic transcriptions, and per-POS definitions.
 * The raw entry JSON carries audio URLs, examples, license blocks, and long
 * definition tails that only burn tokens.
 */
export function compactFreeDictionary(entry: FreeDictionaryEntry): string {
  const lines: string[] = []

  const phoneticTexts = [
    entry.phonetic,
    ...(Array.isArray(entry.phonetics) ? entry.phonetics.map((item) => item.text) : []),
  ].filter((text): text is string => typeof text === 'string' && text.length > 0)
  const uniquePhonetics = Array.from(new Set(phoneticTexts))
  if (uniquePhonetics.length > 0) {
    lines.push(`Phonetics: ${uniquePhonetics.join(', ')}`)
  }

  if (entry.origin) {
    lines.push(`Origin: ${entry.origin}`)
  }

  for (const meaning of Array.isArray(entry.meanings) ? entry.meanings : []) {
    const definitions = (Array.isArray(meaning.definitions) ? meaning.definitions : [])
      .map((item) => item.definition)
      .filter((definition): definition is string => typeof definition === 'string')
      .slice(0, MAX_DEFINITIONS_PER_POS)
    if (definitions.length > 0) {
      lines.push(`${meaning.partOfSpeech}: ${definitions.join(' | ')}`)
    }
  }

  return lines.join('\n')
}
