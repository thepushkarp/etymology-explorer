import { z } from 'zod'
import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { fetchWithTimeout } from './fetchUtils'
import { canonicalizeWord } from './orthography'
import { getRedis } from './redis'
import { currentSourceFetchBudget, SourceFetchBudgetExceeded } from './sourceFetchBudget'
import type { SpecialistSourceResult } from './specialistSources'
import type { WiktionaryEntryGroup } from './wiktionaryEntryGroups'

const responseSchema = z.object({
  meta: z.object({ status: z.number() }),
  data: z.array(
    z
      .object({
        slug: z.string().min(1),
        japanese: z.array(
          z.object({ word: z.string().optional(), reading: z.string().optional() })
        ),
        senses: z.array(
          z
            .object({
              english_definitions: z.array(z.string()),
              parts_of_speech: z.array(z.string()),
              restrictions: z.array(z.string()),
              tags: z.array(z.string()),
              source: z.array(z.object({ language: z.string(), word: z.string() }).passthrough()),
              info: z.array(z.string()),
            })
            .passthrough()
        ),
        attribution: z.object({ jmdict: z.boolean() }).passthrough(),
      })
      .passthrough()
  ),
})

const LICENSE =
  'JMdict © Electronic Dictionary Research and Development Group (EDRDG), ' +
  'https://www.edrdg.org/ — CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/; ' +
  'https://www.edrdg.org/edrdg/licence.html'

// Jisho combines JMdict, JMnedict, and Wikipedia inside the same attributed entry.
// Only recognized lexical classes admit a sense; an entry-level JMdict flag alone
// cannot distinguish the proper-name senses contributed by JMnedict.
const LEXICAL_POS =
  /^(?:Noun(?:\b|$)|Pronoun$|(?:(?:Godan|Ichidan|Nidan|Yodan|Suru|Kuru|Su|Zuru|Transitive|Intransitive|Irregular(?: nu| ru)?|Ru[- ]irregular|Unspecified)\s+)?verb\b|.*\badjective.*|Adverb(?:\b|$)|Expression(?:s)?(?:\b|$)|Interjection(?:\b|$)|Conjunction$|Particle$|Counter$|Prefix$|Suffix$|Copula$|Auxiliary(?:\b|$)|Numeric$|Unclassified$)/i

export function parseJmdictResponse(word: string, payload: unknown): SpecialistSourceResult[] {
  const parsed = responseSchema.safeParse(payload)
  if (!parsed.success)
    throw new Error(
      `JMdict response for ${word} has invalid dictionary data: ${parsed.error.message}`
    )
  if (parsed.data.meta.status !== 200)
    throw new Error(`JMdict response for ${word} returned HTTP ${parsed.data.meta.status}`)
  const canonical = canonicalizeWord(word)
  const groups: WiktionaryEntryGroup[] = []
  for (const entry of parsed.data.data) {
    if (!entry.attribution.jmdict) continue
    const matchingForms = entry.japanese.filter((form) =>
      [form.word, form.reading].some((value) => value && canonicalizeWord(value) === canonical)
    )
    if (!matchingForms.length) continue
    const url = `https://jisho.org/word/${encodeURIComponent(entry.slug)}`
    for (const [index, sense] of entry.senses.entries()) {
      if (
        !sense.parts_of_speech.length ||
        !sense.parts_of_speech.every((pos) => LEXICAL_POS.test(pos)) ||
        !sense.english_definitions.length
      )
        continue
      if (
        sense.restrictions.length &&
        !matchingForms.some((form) =>
          sense.restrictions.some((restriction) =>
            [form.word, form.reading].some(
              (value) => value && canonicalizeWord(value) === canonicalizeWord(restriction)
            )
          )
        )
      )
        continue
      const id = `jmdict:${entry.slug}:sense:${index + 1}`
      const metadata = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'senses'))
      const heading = `${entry.slug}, sense ${index + 1}`
      groups.push({
        index: id,
        number: `${index + 1}`,
        anchor: id,
        heading,
        level: 2,
        sourceUrl: url,
        // Jisho omits JMdict's full/partial loan-source distinction. Keep the
        // source material verbatim as lexical context, without ancestry edges.
        text: [
          `JMdict / EDRDG (via Jisho): ${heading}`,
          `Entry metadata: ${JSON.stringify(metadata)}`,
          `Sense metadata: ${JSON.stringify(sense)}`,
          'Loan-source material extent: unknown; Jisho does not supply the full/partial distinction. ' +
            'Source language/material fields alone do not establish a whole-word donor.',
        ].join('\n'),
        sections: [],
      })
    }
  }
  if (!groups.length) return []
  return [
    {
      provider: 'jmdict',
      sourceFamily: 'jmdict',
      evidenceRole: 'lexical',
      data: {
        text: groups.map((group) => group.text).join('\n\n'),
        url: `https://jisho.org/search/${encodeURIComponent(word)}`,
        language: 'ja',
        lexicalLanguage: 'Japanese',
        sourceFamily: 'jmdict',
        evidenceRole: 'lexical',
        requestedWord: word,
        resolvedWord: word,
        license: LICENSE,
        entryGroups: groups,
      },
    },
  ]
}

export interface JmdictGateRedis {
  set(key: string, value: string, options: { nx: true; ex: number }): Promise<unknown>
}

export async function fetchJmdict(
  word: string,
  signal?: AbortSignal,
  client: JmdictGateRedis | null = getRedis()
): Promise<SpecialistSourceResult[]> {
  signal?.throwIfAborted()
  if (currentSourceFetchBudget()?.exhausted) throw new SourceFetchBudgetExceeded()
  if (!client)
    throw new Error(`JMdict lookup for ${word} unavailable: Redis crawl gate is not configured`)
  let admitted: unknown
  try {
    // A global, expiring start gate enforces Jisho's crawl delay across workers
    // and words. Never release it on completion or queue requests behind it.
    admitted = await client.set('source:jmdict:jisho:crawl-gate', word, {
      nx: true,
      ex: CONFIG.jmdictCrawlDelaySeconds,
    })
  } catch (error) {
    throw new Error(
      `JMdict lookup for ${word} unavailable: Redis crawl gate failed: ${safeError(error)}`
    )
  }
  if (admitted !== 'OK')
    throw new Error(
      `JMdict lookup for ${word} unavailable: Jisho crawl delay active; retry after ${CONFIG.jmdictCrawlDelaySeconds} seconds`
    )
  signal?.throwIfAborted()
  const response = await fetchWithTimeout(
    `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`,
    {
      headers: { 'User-Agent': 'EtymologyExplorer/1.0 (educational project)' },
      redirect: 'error',
    },
    CONFIG.timeouts.source,
    signal
  )
  if (!response.ok) throw new Error(`JMdict lookup for ${word} failed: HTTP ${response.status}`)
  const records = parseJmdictResponse(word, await response.json())
  for (const record of records)
    record.data.retrieval = { method: 'direct', retrievedAt: new Date().toISOString() }
  return records
}
