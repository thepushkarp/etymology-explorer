import { SourceData } from './types'

const URBAN_DICTIONARY_API = 'https://api.urbandictionary.com/v0/define'

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
  try {
    const response = await fetch(`${URBAN_DICTIONARY_API}?term=${encodeURIComponent(word)}`)

    if (!response.ok) return null

    const data = await response.json()

    // Filter to clean definitions with decent votes
    const filtered = (data.list || [])
      .filter((d: { thumbs_up: number }) => d.thumbs_up > 100)
      .filter(
        (d: { definition: string; example: string }) =>
          isClean(d.definition) && isClean(d.example || '')
      )
      .slice(0, 2)

    if (filtered.length === 0) return null

    const text = filtered
      .map((d: { definition: string }) => d.definition.replace(/\[|\]/g, ''))
      .join('\n\n')

    return {
      text,
      url: `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(word)}`,
    }
  } catch {
    return null
  }
}
