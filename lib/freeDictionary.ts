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

export async function fetchFreeDictionary(word: string): Promise<FreeDictionaryEntry | null> {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { next: { revalidate: 86400 } }
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
    console.error('Free Dictionary fetch failed:', error)
    return null
  }
}
