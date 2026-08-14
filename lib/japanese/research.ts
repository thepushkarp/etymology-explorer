import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  LexemeCandidate,
  LookupContext,
  ResearchContext,
  SourceData,
  StreamEvent,
} from '@/lib/types'
import {
  fetchEnglishWiktionaryLanguage,
  fetchNativeWiktionary,
  fetchWikidataLexeme,
} from '@/lib/multilingualSources'
import { adaptJapaneseWiktionaryEvidence, alignJapaneseWiktionaryFamilies } from './evidence'

interface WoldRecord {
  id: string
  form: string
  script: string
  borrowed: string
  borrowedScore?: number
  analyzability: string
  gloss: string
  age: string
  stratum: string
  comment: string
  borrowedComment: string
  etymologicalNote: string
  sourceWord?: string
  sourceLanguage?: string
  sourceMeaning?: string
  sourceCertain?: string
}

let woldPromise: Promise<Record<string, WoldRecord[]>> | null = null

async function loadWold(): Promise<Record<string, WoldRecord[]>> {
  if (!woldPromise) {
    woldPromise = readFile(join(process.cwd(), 'data', 'wold-ja.json'), 'utf8').then(
      (text) => (JSON.parse(text) as { entries: Record<string, WoldRecord[]> }).entries
    )
  }
  return woldPromise
}

export async function fetchJapaneseWold(candidate: LexemeCandidate): Promise<SourceData | null> {
  const entries = await loadWold()
  const records =
    entries[candidate.lemma] ?? entries[candidate.reading] ?? entries[candidate.romaji]
  if (!records?.length) return null
  return {
    text: JSON.stringify(records.slice(0, 4)),
    url: 'https://wold.clld.org/vocabulary/21',
  }
}

function jmdictSource(candidate: LexemeCandidate): SourceData {
  return {
    text: JSON.stringify({
      entryId: candidate.entryId,
      lemma: candidate.lemma,
      reading: candidate.reading,
      romaji: candidate.romaji,
      partOfSpeech: candidate.partOfSpeech,
      gloss: candidate.gloss,
      note: 'Lexical identity only. This is not evidence for a full etymology.',
    }),
    url: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
  }
}

export async function conductJapaneseResearch(
  candidate: LexemeCandidate,
  lookupContext: LookupContext,
  signal?: AbortSignal,
  onProgress?: (event: StreamEvent) => void
): Promise<ResearchContext> {
  const sources = [
    ['wiktionaryEnglish', () => fetchEnglishWiktionaryLanguage(candidate.lemma, 'ja', signal)],
    ['wiktionaryNative', () => fetchNativeWiktionary(candidate.lemma, 'ja', signal)],
    ['wold', () => fetchJapaneseWold(candidate)],
    ['wikidataLexeme', () => fetchWikidataLexeme(candidate.lemma, 'ja', signal)],
  ] as const
  const startedAt = Date.now()
  const values = await Promise.all(
    sources.map(async ([name, fetchSource]) => {
      onProgress?.({ type: 'source_started', source: name })
      try {
        const value = await fetchSource()
        if (value) {
          onProgress?.({ type: 'source_complete', source: name, timing: Date.now() - startedAt })
        } else {
          onProgress?.({ type: 'source_failed', source: name, error: 'No entry found' })
        }
        return [name, value] as const
      } catch (error) {
        onProgress?.({
          type: 'source_failed',
          source: name,
          error: error instanceof Error ? error.message : 'Source failed',
        })
        return [name, null] as const
      }
    })
  )
  const data = Object.fromEntries(values) as Record<(typeof sources)[number][0], SourceData | null>
  data.wiktionaryEnglish = adaptJapaneseWiktionaryEvidence(data.wiktionaryEnglish, 'en', candidate)
  data.wiktionaryNative = alignJapaneseWiktionaryFamilies(
    data.wiktionaryEnglish,
    adaptJapaneseWiktionaryEvidence(data.wiktionaryNative, 'ja', candidate)
  )
  const jmdict = jmdictSource(candidate)
  onProgress?.({ type: 'source_complete', source: 'jmdict', timing: 0 })

  return {
    language: 'ja',
    mainWord: {
      word: candidate.lemma,
      etymonline: null,
      wiktionary: null,
      wiktionaryEnglish: data.wiktionaryEnglish,
      wiktionaryNative: data.wiktionaryNative,
      wikidataLexeme: data.wikidataLexeme,
      wold: data.wold,
      jmdict,
    },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: values.filter(([, value]) => Boolean(value)).length + 1,
    lookupContext,
    japaneseCandidate: candidate,
  }
}

export function hasJapaneseEtymologyEvidence(context: ResearchContext): boolean {
  return Boolean(
    context.mainWord.wiktionaryEnglish || context.mainWord.wiktionaryNative || context.mainWord.wold
  )
}
