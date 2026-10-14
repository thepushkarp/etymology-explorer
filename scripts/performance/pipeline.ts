/** Uncached research/synthesis timings; Redis is disabled to keep production data untouched. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { conductAgenticResearch, hasCredibleMainSource } from '@/lib/research'
import { synthesizeFromResearch, getLlmUsageFromError } from '@/lib/llm'
import { safeError } from '@/lib/errorUtils'
import { usageToUSD } from '@/lib/costGuard'
import { isLanguageCode } from '@/lib/languages'
import type { ResearchContext } from '@/lib/types'

const { values } = parseArgs({
  options: {
    label: { type: 'string' },
    word: { type: 'string', default: 'quarantine' },
    language: { type: 'string', default: 'en' },
    context: { type: 'string' },
    'research-only': { type: 'boolean', default: false },
    'compact-output': { type: 'boolean', default: false },
    'latency-routing': { type: 'boolean', default: false },
  },
})
if (!values.label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.label))
  throw new Error('Pass a path-safe --label')
if (!isLanguageCode(values.language)) throw new Error('Unsupported benchmark language')
delete process.env.ETYMOLOGY_KV_REST_API_URL
delete process.env.ETYMOLOGY_KV_REST_API_TOKEN
const directory = join('bench-results', 'research-performance', values.label)
mkdirSync(directory, { recursive: true })
const requests: Array<{
  url: string
  startedMs: number
  headersMs?: number
  status?: number
  error?: string
  model?: string
  outputLimit?: number
  bodyFile?: string
}> = []
const recording: Promise<void>[] = []
const originalFetch = globalThis.fetch
const start = performance.now()
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input)
  const item: (typeof requests)[number] = { url, startedMs: performance.now() - start }
  const provider = new URL(url).hostname === 'openrouter.ai'
  if (provider && typeof init?.body === 'string') {
    const body = JSON.parse(init.body)
    if (values['latency-routing'] && body.provider?.require_parameters) {
      body.provider.sort = 'latency'
      init = { ...init, body: JSON.stringify(body) }
    }
    if (values['compact-output'] && body.text?.format?.schema?.properties?.histories) {
      // Experimental output shape; production keeps its original generation contract.
      const schema = body.text.format.schema
      const fields = [
        'pronunciation',
        'definition',
        'ancestryGraph',
        'roots',
        'lore',
        'partsOfSpeech',
      ]
      for (const field of fields) delete schema.properties[field]
      schema.required = schema.required.filter((field: string) => !fields.includes(field))
      body.instructions = body.instructions.replace(
        'The legacy top-level pronunciation, definition, ancestryGraph, roots, lore, and partsOfSpeech must be an exact copy of that primary history; the server deterministically re-projects it from the validated primary history.',
        'Generate pronunciation, definition, ancestryGraph, roots, lore, and partsOfSpeech only inside each history; the server projects those entry fields from the validated primary history.'
      )
      init = { ...init, body: JSON.stringify(body) }
    }
    item.model = body.model
    item.outputLimit = body.max_output_tokens
  }
  const index = requests.push(item) - 1
  try {
    const response = await originalFetch(input, init)
    item.headersMs = performance.now() - start
    item.status = response.status
    // Save public source bodies for repeatable research replay; credentials and provider inputs are excluded.
    if (!provider)
      recording.push(
        response
          .clone()
          .text()
          .then((body) => {
            item.bodyFile = `source-${index}.txt`
            writeFileSync(join(directory, item.bodyFile), body)
          })
      )
    return response
  } catch (error) {
    item.error = safeError(error)
    throw error
  }
}) as typeof fetch
const events: Array<{ elapsedMs: number; type: string; source?: string }> = []
const sections: Array<{ section: string; elapsedMs: number }> = []
let context: ResearchContext | undefined
let researchMs = 0
let costUSD = 0
try {
  context = values.context
    ? (JSON.parse(readFileSync(values.context, 'utf8')) as ResearchContext)
    : await conductAgenticResearch(values.word, { language: values.language }, (event) => {
        const entry = {
          elapsedMs: performance.now() - start,
          type: event.type,
          ...('source' in event ? { source: event.source } : {}),
        }
        events.push(entry)
        if (['source_complete', 'source_failed', 'roots_identified'].includes(event.type))
          console.log(entry)
      })
  researchMs = performance.now() - start
  if (!values.context && context.llmUsage) costUSD += usageToUSD(context.llmUsage)
  writeFileSync(join(directory, 'context.json'), JSON.stringify(context, null, 2))
  if (!hasCredibleMainSource(context))
    throw new Error('No credible source evidence; synthesis skipped')
  const synthesisStart = performance.now()
  const synthesis = values['research-only']
    ? undefined
    : await synthesizeFromResearch(context, {
        onSection: (section) => {
          sections.push({ section, elapsedMs: performance.now() - synthesisStart })
          if (['definition', 'lore', 'histories'].includes(section)) console.log(sections.at(-1))
        },
      })
  if (synthesis) costUSD += usageToUSD(synthesis.usage)
  const summary = {
    word: context.mainWord.word,
    language: context.language ?? 'en',
    researchMs,
    synthesisMs: performance.now() - synthesisStart,
    totalMs: performance.now() - start,
    sourceAttempts: context.totalSourcesFetched,
    histories: context.lexicalGraph?.histories.length,
    usage: synthesis?.usage,
    costUSD,
    events,
    sections,
    requests,
  }
  if (synthesis)
    writeFileSync(join(directory, 'result.json'), JSON.stringify(synthesis.result, null, 2))
  await Promise.all(recording)
  writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(
    JSON.stringify({ ...summary, events: undefined, sections: undefined, requests: undefined })
  )
} catch (error) {
  const usage = getLlmUsageFromError(error)
  if (usage) costUSD += usageToUSD(usage)
  await Promise.allSettled(recording)
  writeFileSync(
    join(directory, 'summary.json'),
    JSON.stringify(
      {
        error: safeError(error),
        researchMs,
        totalMs: performance.now() - start,
        costUSD,
        events,
        sections,
        requests,
      },
      null,
      2
    )
  )
  throw error
} finally {
  globalThis.fetch = originalFetch
}
