import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import manifest from '../data/jmdict/manifest.json'
import { canonicalizeWord } from './orthography'
import type { SpecialistSourceResult } from './specialistSources'
import type { WiktionaryEntryGroup } from './wiktionaryEntryGroups'

interface Spelling {
  word: string
  info: string[]
  priority: string[]
}
interface Reading extends Spelling {
  noKanji: boolean
  restrict: string[]
}
export interface JmdictEntry {
  id: string
  kanji: Spelling[]
  readings: Reading[]
  senses: Array<{
    kanji: string[]
    readings: string[]
    pos: string[]
    glosses: string[]
    loans: Array<{ language: string; text: string; type: string; wasei: boolean }>
    xml: string
  }>
  xml: string
}
const unzip = promisify(gunzip)
const shards = new Map<string, Promise<unknown>>()
const LICENSE =
  'JMdict © Electronic Dictionary Research and Development Group (EDRDG), ' +
  'https://www.edrdg.org/ — CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/; ' +
  'https://www.edrdg.org/edrdg/licence.html; indexed from original XML'

async function loadShard<T>(kind: 'forms' | 'entries', key: string): Promise<Record<string, T>> {
  const bucket = parseInt(createHash('sha256').update(key).digest('hex').slice(0, 2), 16) % 64
  const name = `${kind}-${bucket.toString(16).padStart(2, '0')}.json.gz`
  const cached = shards.get(name)
  if (cached) return cached as Promise<Record<string, T>>
  const loading = (async () => {
    const raw = await readFile(path.join(process.cwd(), 'data/jmdict', name))
    const expected = manifest.shards[name as keyof typeof manifest.shards]
    if (createHash('sha256').update(raw).digest('hex') !== expected)
      throw new Error(`JMdict shard ${name} failed checksum verification; rebuild the index`)
    return JSON.parse((await unzip(raw)).toString('utf8')) as Record<string, T>
  })()
  // Bound retained decompressed data; concurrent readers of one shard share work.
  if (shards.size >= 4) shards.delete(shards.keys().next().value!)
  shards.set(name, loading)
  try {
    return await loading
  } catch (error) {
    if (shards.get(name) === loading) shards.delete(name)
    throw new Error(`JMdict lookup for ${key} could not read its local index`, { cause: error })
  }
}

/** Reading and sense restrictions intersect on a valid spelling/reading pair. */
export function selectJmdictEntries(
  word: string,
  entries: JmdictEntry[]
): SpecialistSourceResult[] {
  const canonical = canonicalizeWord(word)
  const records: SpecialistSourceResult[] = []
  for (const entry of entries) {
    const pairs = entry.readings.flatMap((reading) => {
      const spellings =
        reading.noKanji || !entry.kanji.length
          ? [undefined]
          : entry.kanji.filter(
              (kanji) => !reading.restrict.length || reading.restrict.includes(kanji.word)
            )
      return spellings
        .filter((kanji) =>
          [reading.word, kanji?.word].some((form) => form && canonicalizeWord(form) === canonical)
        )
        .map((kanji) => ({ reading, kanji }))
    })
    if (!pairs.length) continue
    const url = `https://www.edrdg.org/jmwsgi/entr.py?svc=jmdict&sid=&q=${entry.id}`
    const groups: WiktionaryEntryGroup[] = []
    for (const [index, sense] of entry.senses.entries()) {
      if (
        !sense.glosses.length ||
        !pairs.some(
          ({ reading, kanji }) =>
            (!sense.kanji.length || (kanji && sense.kanji.includes(kanji.word))) &&
            (!sense.readings.length || sense.readings.includes(reading.word))
        )
      )
        continue
      const id = `jmdict:${entry.id}:sense:${index + 1}`
      const metadata = { kanji: entry.kanji, readings: entry.readings }
      groups.push({
        index: id,
        number: String(index + 1),
        anchor: id,
        heading: `${word}: ${sense.glosses.join('; ')}`,
        level: 2,
        sourceUrl: url,
        ...(sense.loans.some((loan) => loan.language === 'eng' && loan.wasei)
          ? { etymologyText: 'wasei-eigo (JMdict ls_wasei on English source material).' }
          : {}),
        text: [
          `JMdict ${entry.id}, sense ${index + 1}`,
          `Entry spelling metadata: ${JSON.stringify(metadata)}`,
          `Applicable parts of speech (including XML inheritance): ${sense.pos.join('; ')}`,
          `Loan-source metadata: ${JSON.stringify(sense.loans)}`,
          'Loan-source full/part describes source material extent; wasei marks a Japanese coinage. Neither kanji shapes nor glosses establish ancestry.',
          sense.xml,
        ].join('\n'),
        sections: [],
      })
    }
    if (!groups.length) continue
    records.push({
      provider: 'jmdict',
      sourceFamily: 'jmdict',
      evidenceRole: 'lexical',
      data: {
        text: `${LICENSE}\nSnapshot ${manifest.date}; entry ${entry.id}\n${entry.xml}`,
        url,
        language: 'ja',
        lexicalLanguage: 'Japanese',
        sourceFamily: 'jmdict',
        evidenceRole: 'lexical',
        requestedWord: word,
        resolvedWord: word,
        license: LICENSE,
        revisionId: manifest.sha256,
        sourceEntryId: entry.id,
        entryGroups: groups,
      },
    })
  }
  if (!records.length) return []
  return [
    {
      ...records[0],
      data: {
        ...records[0].data,
        text: records.map((record) => record.data.text).join('\n\n'),
        sourceEntryId: records.map((record) => record.data.sourceEntryId).join('|'),
        entryGroups: records.flatMap((record) => record.data.entryGroups ?? []),
      },
    },
  ]
}

export async function fetchJmdict(
  word: string,
  signal?: AbortSignal
): Promise<SpecialistSourceResult[]> {
  signal?.throwIfAborted()
  // EDRDG requests at least monthly updates for web dictionaries. An expired
  // local snapshot is unavailable, never evidence that a word does not exist.
  if (Date.now() - Date.parse(manifest.date) > 31 * 86_400_000)
    throw new Error(
      `JMdict snapshot ${manifest.date} needs a monthly refresh; run scripts/build-jmdict-index.py with a verified download`
    )
  const canonical = canonicalizeWord(word)
  const forms = await loadShard<string[]>('forms', canonical)
  const entries = await Promise.all(
    (forms[canonical] ?? []).map(async (id) => {
      const shard = await loadShard<JmdictEntry>('entries', id)
      if (!shard[id]) throw new Error(`JMdict index has no record for entry ${id}`)
      return shard[id]
    })
  )
  signal?.throwIfAborted()
  return selectJmdictEntries(canonical, entries)
}
