import { canonicalizeWord, isValidWord } from '@/lib/validation'
import { CONFIG } from '@/lib/config'
import { fetchWithTimeout } from '@/lib/fetchUtils'
import type { NgramResult } from '@/lib/types'

interface NgramApiEntry {
  ngram?: string
  timeseries?: number[]
}

export type NgramLookupResult =
  { status: 'ok'; data: NgramResult } | { status: 'not_found' } | { status: 'error' }

export async function fetchNgramStatus(
  word: string,
  options: {
    yearStart?: number
    yearEnd?: number
    corpus?: string
    smoothing?: number
  } = {}
): Promise<NgramLookupResult> {
  const trimmedWord = canonicalizeWord(word)
  if (!isValidWord(trimmedWord)) return { status: 'not_found' }

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
      if (response.status === 404) return { status: 'not_found' }
      throw new Error(`Ngram API: ${response.status}`)
    }

    const data: unknown = await response.json()

    if (!Array.isArray(data) || data.length === 0) {
      return { status: 'not_found' }
    }

    const entry = data[0] as NgramApiEntry
    const series = (entry.timeseries || []).map((count, index) => ({
      year: yearStart + index,
      count,
      matchCount: 0,
    }))
    if (series.length === 0) {
      return { status: 'not_found' }
    }

    return {
      status: 'ok',
      data: {
        word: entry.ngram || trimmedWord,
        corpus,
        data: series,
      },
    }
  } catch (error) {
    console.error('Ngram fetch failed:', error)
    return { status: 'error' }
  }
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
  const result = await fetchNgramStatus(word, options)
  return result.status === 'ok' ? result.data : null
}
