import { SourceData } from './types'
import { fetchWithTimeout } from './fetchUtils'
import { CONFIG } from './config'

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

const MIN_DEFINITION_WORDS = 5
const MIN_DEFINITION_CHARS = 20
const MAX_DEFINITION_CHARS = 500
const MAX_URBAN_ENTRIES = 2
const MIN_QUALITY_SCORE = 1

const LOW_SIGNAL_PATTERNS = [
  /^a word\b/i,
  /^a term\b/i,
  /can be used in many situations/i,
  /whatever you want/i,
  /literally just\b/i,
  /^something you tell someone/i,
]

function normalizeWhitespace(text: string): string {
  return text.replace(/\[|\]/g, '').replace(/\s+/g, ' ').trim()
}

function normalizeWord(text: string): string {
  return text.toLowerCase().trim()
}

function scoreQuality(entry: UrbanDictionaryEntry): number {
  const definition = normalizeWhitespace(entry.definition)
  const example = normalizeWhitespace(entry.example || '')
  const upvotes = Math.max(0, entry.thumbs_up)
  const downvotes = Math.max(0, entry.thumbs_down)
  const wordCount = definition.split(/\s+/).filter(Boolean).length

  if (definition.length < MIN_DEFINITION_CHARS || definition.length > MAX_DEFINITION_CHARS)
    return -10
  if (wordCount < MIN_DEFINITION_WORDS) return -10

  let score = 0

  if (definition.length >= 35 && definition.length <= 260) score += 1
  if (example.length >= 20) score += 1

  // In some environments votes are always 0; treat vote quality as optional signal.
  if (upvotes > 0 || downvotes > 0) {
    const approvalRatio = upvotes / Math.max(1, downvotes)
    const scoreDelta = upvotes - downvotes
    if (scoreDelta >= 10) score += 1
    if (approvalRatio >= 1.2) score += 1
  }

  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(definition))) {
    score -= 2
  }

  return score
}

export async function fetchUrbanDictionary(word: string): Promise<SourceData | null> {
  try {
    const response = await fetchWithTimeout(
      `${URBAN_DICTIONARY_API}?term=${encodeURIComponent(word)}`,
      {},
      CONFIG.timeouts.source
    )

    if (!response.ok) return null

    const data = await response.json()

    const normalizedWord = normalizeWord(word)
    const entries = (data.list || []) as UrbanDictionaryEntry[]
    const filtered = entries
      .filter((entry) => normalizeWord(entry.word) === normalizedWord)
      .map((entry) => ({
        entry,
        definition: normalizeWhitespace(entry.definition),
        example: normalizeWhitespace(entry.example || ''),
        quality: scoreQuality(entry),
      }))
      .filter((item) => item.quality >= MIN_QUALITY_SCORE)
      .sort((a, b) => {
        const voteScoreA = a.entry.thumbs_up - a.entry.thumbs_down
        const voteScoreB = b.entry.thumbs_up - b.entry.thumbs_down
        return b.quality - a.quality || voteScoreB - voteScoreA
      })
      .slice(0, MAX_URBAN_ENTRIES)

    if (filtered.length === 0) return null

    const text = filtered
      .map(({ entry, definition, example }, index) => {
        const hasVotes = entry.thumbs_up > 0 || entry.thumbs_down > 0

        return [
          hasVotes
            ? `Entry ${index + 1}: up=${entry.thumbs_up}, down=${entry.thumbs_down}`
            : `Entry ${index + 1}`,
          `Definition: ${definition}`,
          example ? `Example: ${example}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      })
      .join('\n\n')

    return {
      text,
      url: `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(word)}`,
    }
  } catch {
    return null
  }
}
