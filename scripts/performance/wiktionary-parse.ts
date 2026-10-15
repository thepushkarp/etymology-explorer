/** CPU-only replay of a recorded MediaWiki page through the production extractors. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { LANGUAGES, isLanguageCode } from '@/lib/languages'
import {
  extractWiktionaryEntryGroups,
  extractWiktionaryLanguageText,
  extractWiktionaryVariants,
  type WiktionaryTocSection,
} from '@/lib/wiktionaryEntryGroups'

const { values } = parseArgs({
  options: {
    recording: { type: 'string' },
    label: { type: 'string' },
    edition: { type: 'string', default: 'en' },
    runs: { type: 'string', default: '3' },
  },
})
if (!values.recording || !values.label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.label))
  throw new Error('Pass --recording and a path-safe --label')
const runs = Number(values.runs)
if (!Number.isInteger(runs) || runs < 1 || runs > 3) throw new Error('--runs must be 1..3')
const summary = JSON.parse(readFileSync(join(values.recording, 'summary.json'), 'utf8'))
const language: unknown = summary.language
if (!isLanguageCode(language)) throw new Error('Unsupported recorded language')
const config = LANGUAGES[language]
const heading =
  values.edition === 'en' ? config.englishWiktionaryHeading : config.nativeWiktionaryHeading
const pattern = values.edition === 'en' ? LANGUAGES.en.etymologyHeading : config.etymologyHeading
const request = summary.requests.find(
  (item: { url: string; status: number; bodyFile?: string }) => {
    const url = new URL(item.url)
    return (
      url.hostname === `${values.edition}.wiktionary.org` &&
      url.searchParams.get('page') === summary.word &&
      item.status === 200 &&
      item.bodyFile
    )
  }
)
if (!request) throw new Error('Recording has no successful primary page from the requested edition')
const payload = JSON.parse(readFileSync(join(values.recording, request.bodyFile), 'utf8'))
const html: string = payload.parse.text
const sections: WiktionaryTocSection[] = payload.parse.tocdata.sections
const rows: Array<{
  run: number
  elapsedMs: number
  groupsMs: number
  textMs: number
  variantsMs: number
  result: {
    groups: ReturnType<typeof extractWiktionaryEntryGroups>
    text: string
    variants: ReturnType<typeof extractWiktionaryVariants>
  }
}> = []
for (let run = 0; run < runs; run++) {
  const start = performance.now()
  const groups = extractWiktionaryEntryGroups(html, sections, heading, pattern)
  const groupsMs = performance.now() - start
  const text = extractWiktionaryLanguageText(html, sections, heading)
  const textMs = performance.now() - start - groupsMs
  const variants = extractWiktionaryVariants(html, sections, heading, values.edition)
  const elapsedMs = performance.now() - start
  const result = { groups, text, variants }
  if (rows.length) assert.deepEqual(result, rows[0].result)
  rows.push({ run, elapsedMs, groupsMs, textMs, variantsMs: elapsedMs - groupsMs - textMs, result })
  console.log({ run, elapsedMs, groupsMs, textMs, variantsMs: elapsedMs - groupsMs - textMs })
}
mkdirSync('bench-results/research-performance', { recursive: true })
writeFileSync(
  join('bench-results/research-performance', `${values.label}.json`),
  JSON.stringify(rows, null, 2)
)
