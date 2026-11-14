import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import manifest from '../data/japanese-historical-manifest.json'
import { canonicalizeWord } from './orthography'
import type { SpecialistSourceResult } from './specialistSources'

interface HistoricalIndex {
  forms: Record<string, number[]>
  records: Array<{ dataset: keyof typeof manifest.datasets; id: string; text: string; url: string }>
}
const unzip = promisify(gunzip)
let pending: Promise<HistoricalIndex> | undefined

async function loadIndex(): Promise<HistoricalIndex> {
  if (!pending) {
    pending = (async () => {
      const raw = await readFile(path.join(process.cwd(), 'data/japanese-historical.json.gz'))
      if (createHash('sha256').update(raw).digest('hex') !== manifest.sha256)
        throw new Error('NINJAL historical index checksum mismatch; rebuild the index')
      return JSON.parse((await unzip(raw)).toString('utf8')) as HistoricalIndex
    })().catch((error) => {
      pending = undefined
      throw new Error('NINJAL historical index could not be loaded', { cause: error })
    })
  }
  return pending
}

/** Exact historical spelling matches provide dated context, never modern identity or ancestry. */
export async function fetchJapaneseHistorical(
  word: string,
  signal?: AbortSignal
): Promise<SpecialistSourceResult[]> {
  signal?.throwIfAborted()
  const index = await loadIndex()
  signal?.throwIfAborted()
  const matches = (index.forms[canonicalizeWord(word)] ?? []).map((id) => index.records[id])
  return Object.entries(manifest.datasets).flatMap(([id, dataset]) => {
    const records = matches.filter((record) => record.dataset === id)
    if (!records.length) return []
    const license = `${manifest.license}; ${manifest.licenseUrl}; ${dataset.attribution}; indexed transcription/headword data`
    return [
      {
        provider: 'ninjalHistorical' as const,
        sourceFamily: 'ninjalHistorical' as const,
        evidenceRole: 'context' as const,
        data: {
          text: [
            dataset.title,
            license,
            dataset.scope,
            'This historical spelling match does not identify a modern sense or establish its origin. Do not merge it into a modern history without independent explicit evidence.',
            ...records.map((record) => `${record.id}\n${record.url}\n${record.text}`),
          ].join('\n\n'),
          url: dataset.url,
          requestedWord: word,
          resolvedWord: word,
          language: 'ja' as const,
          lexicalLanguage: 'Japanese',
          sourceFamily: 'ninjalHistorical' as const,
          evidenceRole: 'context' as const,
          sourceEntryId: records.map((record) => `${id}:${record.id}`).join('|'),
          revisionId: manifest.sha256,
          license,
        },
      },
    ]
  })
}
