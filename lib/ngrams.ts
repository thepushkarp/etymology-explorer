import { CONFIG } from '@/lib/config'
import { fetchWithTimeout } from '@/lib/fetchUtils'

export interface NgramDataPoint {
  year: number
  count: number
  matchCount: number
}

export interface NgramResult {
  word: string
  data: NgramDataPoint[]
  corpus: string
}

interface NgramApiEntry {
  ngram?: string
  timeseries?: number[]
}

export async function fetchNgram(
  word: string,
  options: {
    yearStart?: number
    yearEnd?: number
    corpus?: string
    smoothing?: number
  } = {}
): Promise<NgramResult | null> {
  const trimmedWord = word.trim()
  if (!trimmedWord) return null

  const { yearStart = 1800, yearEnd = 2019, corpus = 'eng-2019', smoothing = 3 } = options

  const url =
    `https://books.google.com/ngrams/json?content=${encodeURIComponent(trimmedWord)}` +
    `&year_start=${yearStart}&year_end=${yearEnd}&corpus=${corpus}&smoothing=${smoothing}`

  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: 'application/json',
        },
        next: {
          revalidate: 60 * 60 * 24 * 30,
        },
      },
      CONFIG.timeouts.source
    )

    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Ngram API: ${response.status}`)
    }

    const data: unknown = await response.json()

    if (!Array.isArray(data) || data.length === 0) {
      return null
    }

    const entry = data[0] as NgramApiEntry

    return {
      word: entry.ngram || trimmedWord,
      corpus,
      data: (entry.timeseries || []).map((count, index) => ({
        year: yearStart + index,
        count,
        matchCount: 0,
      })),
    }
  } catch (error) {
    console.error('Ngram fetch failed:', error)
    return null
  }
}
