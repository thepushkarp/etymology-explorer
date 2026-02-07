import { cacheSource, getCachedSource } from '@/lib/cache'
import { RESEARCH_POLICY, TIMEOUT_POLICY } from '@/lib/config/guardrails'
import { SourceData } from './types'

const URBAN_DICTIONARY_API = 'https://api.urbandictionary.com/v0/define'

/**
 * Urban Dictionary API response entry
 */
interface UrbanDictionaryEntry {
  definition: string
  permalink: string
  thumbs_up: number
  author: string
  word: string
  defid: number
  current_vote: string
  written_on: string
  example: string
  thumbs_down: number
}

const NSFW_WORDS = [
  'fuck',
  'shit',
  'cock',
  'dick',
  'pussy',
  'cunt',
  'ass',
  'penis',
  'vagina',
  'anal',
  'orgasm',
  'ejaculate',
  'masturbat',
]

function isClean(text: string): boolean {
  const lower = text.toLowerCase()
  return !NSFW_WORDS.some((word) => new RegExp(`\\b${word}\\b`).test(lower))
}

export async function fetchUrbanDictionary(word: string): Promise<SourceData | null> {
  const normalizedWord = word.toLowerCase().trim()
  const cached = await getCachedSource('urban', normalizedWord)
  if (cached) {
    return cached
  }

  try {
    const response = await fetch(`${URBAN_DICTIONARY_API}?term=${encodeURIComponent(normalizedWord)}`, {
      signal: AbortSignal.timeout(TIMEOUT_POLICY.externalFetchMs),
    })

    if (!response.ok) return null

    const data = await response.json()

    // Filter to clean definitions with decent votes
    const entries = (data.list || []) as UrbanDictionaryEntry[]
    const filtered = entries
      .filter((d) => d.thumbs_up > RESEARCH_POLICY.urbanMinThumbsUp)
      .filter((d) => isClean(d.definition) && isClean(d.example || ''))
      .slice(0, 2)

    if (filtered.length === 0) return null

    const text = filtered.map((d) => d.definition.replace(/\[|\]/g, '')).join('\n\n')

    const result = {
      text,
      url: `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(normalizedWord)}`,
    }

    await cacheSource('urban', normalizedWord, result)
    return result
  } catch {
    return null
  }
}
