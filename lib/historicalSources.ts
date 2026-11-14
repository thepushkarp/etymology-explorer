import { CONFIG } from './config'
import { lookupOncoj } from './oncoj'
import { fetchWithTimeout } from './fetchUtils'
import { canonicalizeWord } from './orthography'
import type { SourceFamilyId, SourceProviderId } from './sourceProviders'
import type { SourceData } from './types'
import { cleanWiktionaryHtml, type WiktionaryEntryGroup } from './wiktionaryEntryGroups'

export interface HistoricalSourceDescriptor {
  id: SourceProviderId
  family: SourceFamilyId
  languages: string[]
  fetch(word: string, signal?: AbortSignal): Promise<SourceData | null>
}

const HEADERS = { 'User-Agent': 'EtymologyExplorer/1.0 (educational project)' }

/** Quantity marks are dictionary notation, not a change to the app's lexical identity. */
function dictionaryForm(word: string, marks: RegExp): string {
  return canonicalizeWord(word).normalize('NFD').replace(marks, '$1').normalize('NFC')
}

function oldEnglishForm(word: string): string {
  return dictionaryForm(word, /([aeiouyæ])[\u0301\u0304]/g)
}

function latinForm(word: string): string {
  return dictionaryForm(word, /([aeiouy])[\u0304\u0306]/g)
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function fetchJson(
  url: URL,
  provider: string,
  word: string,
  signal?: AbortSignal,
  method: 'GET' | 'POST' = 'GET'
): Promise<unknown> {
  const response = await fetchWithTimeout(
    url,
    { method, headers: HEADERS },
    CONFIG.timeouts.source,
    signal
  )
  if (!response.ok)
    throw new Error(`${provider} lookup for "${word}" returned HTTP ${response.status}`)
  try {
    const data: unknown = await response.json()
    signal?.throwIfAborted()
    return data
  } catch (error) {
    if (signal?.aborted) throw error
    const reason = error instanceof SyntaxError ? 'returned invalid JSON' : 'response read failed'
    throw new Error(`${provider} lookup for "${word}" ${reason}`, { cause: error })
  }
}

function entryGroup(
  id: string,
  heading: string,
  text: string,
  sourceUrl: string
): WiktionaryEntryGroup & { sourceUrl: string } {
  return { index: id, number: id, heading, anchor: id, level: 3, text, sections: [], sourceUrl }
}

/** The API's search endpoint returns full main-volume and supplement entries independently. */
export async function fetchBosworthToller(
  word: string,
  signal?: AbortSignal
): Promise<SourceData | null> {
  const requestedWord = canonicalizeWord(word)
  const lookup = oldEnglishForm(word)
  const url = new URL('https://bosworthtoller.com/dictionary/api/search/advanced')
  url.searchParams.set(
    'q',
    JSON.stringify({
      minFields: 1,
      fields: [{ query: lookup, field: 'headword', is_regex: false }],
      wordclass: { include: [], exclude: [] },
      gender: { include: [], exclude: [] },
      subcategory: { include: [], exclude: [] },
      volume: null,
    })
  )
  const response = await fetchJson(url, 'Bosworth–Toller', word, signal, 'POST')
  if (!object(response) || !Array.isArray(response.data)) {
    throw new Error(`Bosworth–Toller lookup for "${word}" returned an invalid entry collection`)
  }

  // Pagination URLs supplied by this API point at its private backend. Only this
  // bounded, exact-headword response is used; no response URL becomes a request.
  const groups: Array<WiktionaryEntryGroup & { sourceUrl: string }> = []
  const revisions: string[] = []
  for (const entry of response.data.slice(0, 20)) {
    if (!object(entry) || typeof entry.orthographic !== 'string') {
      throw new Error(`Bosworth–Toller lookup for "${word}" returned a malformed entry`)
    }
    if (entry.is_deletion || oldEnglishForm(entry.orthographic) !== lookup) continue
    if (!Number.isSafeInteger(entry.id) || Number(entry.id) <= 0) {
      throw new Error(`Bosworth–Toller lookup for "${word}" returned an invalid entry ID`)
    }
    const parts = ['grammar', 'body', 'etymology', 'der', 'see'].map((field) => {
      const value = entry[field]
      if (value == null) return ''
      if (typeof value !== 'string') {
        throw new Error(`Bosworth–Toller entry ${entry.id} has invalid ${field}`)
      }
      return cleanWiktionaryHtml(value.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ''))
    })
    const text = parts.filter(Boolean).join('\n\n')
    if (!text) continue
    const id = String(entry.id)
    groups.push(entryGroup(id, entry.orthographic, text, `https://bosworthtoller.com/${id}`))
    if (typeof entry.updated_at === 'string') revisions.push(`${id}:${entry.updated_at}`)
  }
  if (!groups.length) return null
  return {
    text: groups.map((group) => `${group.heading}\n${group.text}`).join('\n\n'),
    url: groups[0].sourceUrl,
    requestedWord,
    resolvedWord: groups[0].heading,
    entryGroups: groups,
    sourceFamily: 'bosworthToller',
    lexicalLanguage: 'Old English',
    evidenceRole: 'lexical',
    ...((typeof response.last_page === 'number' && response.last_page > 1) ||
    response.data.length > 20
      ? { incomplete: true }
      : {}),
    ...(revisions.length ? { revisionId: revisions.join('|') } : {}),
  }
}

async function fetchLogeionDictionary(
  word: string,
  dictionary: 'LewisShort' | 'LSJ',
  signal?: AbortSignal
): Promise<SourceData | null> {
  const requestedWord = canonicalizeWord(word)
  const lookup = dictionary === 'LewisShort' ? latinForm(word) : requestedWord
  const url = new URL('https://anastrophe.uchicago.edu/logeion-api/detail')
  url.searchParams.set('w', lookup)
  url.searchParams.set('type', 'normal')
  const response = await fetchJson(url, `Logeion ${dictionary}`, word, signal)
  if (!object(response) || !object(response.detail) || !Array.isArray(response.detail.dicos)) {
    throw new Error(
      `Logeion ${dictionary} lookup for "${word}" returned an invalid entry collection`
    )
  }
  const { headword, dicos } = response.detail
  if (typeof headword !== 'string') {
    if (!dicos.length) return null
    throw new Error(`Logeion ${dictionary} lookup for "${word}" returned no headword`)
  }
  const resolved = dictionary === 'LewisShort' ? latinForm(headword) : canonicalizeWord(headword)
  if (resolved !== lookup) return null
  const sourceUrl = `https://logeion.uchicago.edu/${encodeURIComponent(headword)}`
  const groups: WiktionaryEntryGroup[] = []
  for (const entry of dicos) {
    if (!object(entry) || entry.dname !== dictionary) continue
    if (!Array.isArray(entry.es) || entry.es.some((value) => typeof value !== 'string')) {
      throw new Error(`Logeion ${dictionary} lookup for "${word}" returned malformed entry text`)
    }
    for (const html of entry.es as string[]) {
      const text = cleanWiktionaryHtml(html)
      if (text) {
        groups.push(entryGroup(`${dictionary}:${groups.length + 1}`, headword, text, sourceUrl))
      }
    }
  }
  if (!groups.length) return null
  return {
    text: groups.map((group) => group.text).join('\n\n'),
    url: sourceUrl,
    requestedWord,
    resolvedWord: headword,
    entryGroups: groups,
    sourceFamily: dictionary === 'LewisShort' ? 'lewisShort' : 'lsj',
    lexicalLanguage: dictionary === 'LewisShort' ? 'Latin' : 'Ancient Greek',
    evidenceRole: 'lexical',
  }
}

export const HISTORICAL_SOURCES: HistoricalSourceDescriptor[] = [
  {
    id: 'bosworthToller',
    family: 'bosworthToller',
    languages: ['Old English'],
    fetch: fetchBosworthToller,
  },
  {
    id: 'lewisShort',
    family: 'lewisShort',
    languages: ['Latin'],
    fetch: (word, signal) => fetchLogeionDictionary(word, 'LewisShort', signal),
  },
  {
    id: 'lsj',
    family: 'lsj',
    languages: ['Ancient Greek'],
    fetch: (word, signal) => fetchLogeionDictionary(word, 'LSJ', signal),
  },
  {
    id: 'oncoj',
    family: 'oncoj',
    languages: ['Old Japanese'],
    fetch: async (word) => lookupOncoj(word),
  },
]
