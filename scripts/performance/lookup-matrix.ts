/** Source-resolution replay, with isolated in-memory caches and no paid providers.
 * Record public dictionary responses once; compare revisions using identical replay.
 * This measures lookup/discovery, not synthesis latency or etymological accuracy. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { spyOn } from 'bun:test'
import type { SourceData } from '../../lib/types'
import type { WiktionaryToc } from '../../lib/sourceCache'

const [mode, output, recording] = process.argv.slice(2)
if (!['record', 'replay'].includes(mode) || !output || !recording)
  throw new Error('Usage: bun lookup-matrix.ts record|replay results.json http.json')
for (const key of [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'ETYMOLOGY_KV_REST_API_URL',
  'ETYMOLOGY_KV_REST_API_TOKEN',
])
  delete process.env[key]
process.env.LOOKUP_FALLBACK_ENABLED = 'false'
process.env.EXA_ENABLED = 'false'
const cache = await import('../../lib/sourceCache')
const { resolveLookup } = await import('../../lib/lookupResolution')
const { resolveEntryLanguages } = await import('../../lib/entryLanguages')
const { createLexemeResearchSession } = await import('../../lib/lexemeResearch')
const { SourceFetchBudget } = await import('../../lib/sourceFetchBudget')

// Earlier product feedback and the multilingual regression corpus; additions
// exercise new homographs, scripts, and grammatical forms without language hints.
const previous = [
  'たたかえ',
  'tatakae',
  'たたかう',
  'sayonara',
  'さよなら',
  'さようなら',
  'kodomo',
  'shiro',
  'しろ',
  '白',
  '城',
  '代',
  'mamushi',
  'まむし',
  'samosa',
  'pan',
  'pan-',
  '-ness',
  'pain',
  'shirt',
  'tsunami',
  'つなみ',
  '津波',
  'neko',
  'ねこ',
  '猫',
  'hashi',
  'はし',
  'kami',
  'tabero',
  '食べろ',
  'tabeta',
  'コーヒー',
  'kōri',
  'kori',
  'こう',
  'ame',
  'あめ',
  '電話',
  'パン',
  'サラリーマン',
  'コンセント',
  'chat',
  'sale',
  'mole',
  'bank',
  'house',
  'red herring',
  'telephone',
  'perfunctory',
  'looksmaxxing',
  'finestra',
  'riso',
  'in bocca al lupo',
  'psicologia',
  'lavoro',
  'ciao',
  'ventana',
  'llama',
  'ojo de buey',
  'psicología',
  'alcalde',
  'ojalá',
  'fenêtre',
  'avocat',
  'pomme de terre',
  'psychologie',
  'travail',
  'boulot',
  'janela',
  'manga',
  'dor de cotovelo',
  'trabalho',
  'saudade',
  'पानी',
  'किताब',
  'जंगल',
  'नमस्ते',
  'धर्म',
  'आग',
  'پانی',
  'کتاب',
  'دل',
  'زبان',
  'جنگل',
  'آگ',
  'अग्नि',
  'योग',
  'विद्या',
  'कर्मन्',
  'नामन्',
  'zzqvx',
]
const unseen = [
  'komorebi',
  '木漏れ日',
  'かえる',
  '帰る',
  '花',
  'hana',
  '読め',
  'yome',
  'vela',
  'vol',
  'pena',
  'कल',
  'عام',
  'क्षेत्र',
]
type Recorded =
  { status: number; body: string; headers: Record<string, string> } | { error: string }
const responses: Record<string, Recorded> = JSON.parse(
  await readFile(recording, 'utf8').catch((error) => {
    if (mode === 'record' && error.code === 'ENOENT') return '{}'
    throw error
  })
)
const live = globalThis.fetch
const throttled = new Set<string>(
  Object.entries(responses)
    .filter(([, response]) => 'status' in response && response.status === 429)
    .map(([url]) => new URL(url).hostname)
)
let requests = 0
let liveRequests = 0
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input)
  if (!new URL(url).hostname.endsWith('.wiktionary.org'))
    throw new Error(`Unexpected provider: ${new URL(url).hostname}`)
  requests++
  let saved = responses[url]
  if (!saved && mode === 'record') {
    if (throttled.has(new URL(url).hostname)) {
      saved = { error: 'Benchmark skipped this host after HTTP 429; coverage unavailable' }
    } else {
      try {
        liveRequests++
        const response = await live(input, init)
        if (response.status === 429) throttled.add(new URL(url).hostname)
        saved = {
          status: response.status,
          body: await response.text(),
          headers: Object.fromEntries(response.headers),
        }
      } catch (error) {
        saved = { error: String(error) }
      }
    }
    responses[url] = saved
    await writeFile(recording, JSON.stringify(responses))
  }
  if (!saved) throw new Error(`Replay has no recording for ${url}`)
  if ('error' in saved) throw new Error(saved.error)
  return new Response(saved.body, { status: saved.status, headers: saved.headers })
}) as typeof fetch
const sources = new Map<string, SourceData>()
const tocs = new Map<string, WiktionaryToc>()
spyOn(cache, 'getCachedSource').mockImplementation(
  async (source, word, language) => sources.get(`${source}:${language}:${word}`) ?? null
)
spyOn(cache, 'cacheSource').mockImplementation(async (source, word, data, language) => {
  sources.set(`${source}:${language}:${word}`, data)
})
spyOn(cache, 'getCachedWiktionaryToc').mockImplementation(
  async (word, edition = 'en') => tocs.get(`${edition}:${word}`) ?? null
)
spyOn(cache, 'cacheWiktionaryToc').mockImplementation(async (word, edition, toc) => {
  tocs.set(`${edition}:${word}`, toc)
})
await mkdir(dirname(output), { recursive: true })
await mkdir(dirname(recording), { recursive: true })
const results = []
for (const word of [...previous, ...unseen]) {
  sources.clear()
  tocs.clear()
  for (const temperature of ['cold', 'warm']) {
    const budget = new SourceFetchBudget(96)
    const session = createLexemeResearchSession({ budget, exaBudgetClient: null })
    const started = performance.now()
    try {
      const lookup = await resolveLookup(word, session)
      const resolved = lookup.resolution?.selected
        ? { languages: [lookup.resolution.selected.language] }
        : await budget.runLimited(Math.max(0, 32 - budget.attempts), () =>
            resolveEntryLanguages(word, session)
          )
      results.push({
        word,
        cohort: unseen.includes(word) ? 'new' : 'previous',
        temperature,
        ms: +(performance.now() - started).toFixed(2),
        attempts: budget.attempts,
        languages: resolved.languages,
        selected: lookup.resolution?.selected?.word,
        candidates: lookup.resolution?.candidates.length ?? 0,
        incomplete: Boolean(
          lookup.resolution?.incomplete || ('incomplete' in resolved && resolved.incomplete)
        ),
      })
    } catch (error) {
      results.push({
        word,
        temperature,
        ms: +(performance.now() - started).toFixed(2),
        attempts: budget.attempts,
        error: String(error),
      })
    }
  }
  await writeFile(
    output,
    JSON.stringify(
      { mode, requests, liveRequests, throttledHosts: [...throttled], results },
      null,
      2
    )
  )
  console.log(JSON.stringify(results.at(-2)))
}
