/** Live multilingual comparisons with isolated caches and a persistent local spending ledger. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { conductAgenticResearch, hasCredibleMainSource } from '@/lib/research'
import { synthesizeFromResearch } from '@/lib/llm'
import { safeError } from '@/lib/errorUtils'
import { CONFIG } from '@/lib/config'
import type { LanguageCode } from '@/lib/languages'
import type { ResearchContext } from '@/lib/types'

const CORPUS: Record<LanguageCode, readonly string[]> = {
  en: ['house', 'bank', 'red herring', 'telephone', 'perfunctory', 'looksmaxxing'],
  it: ['finestra', 'riso', 'in bocca al lupo', 'psicologia', 'lavoro', 'ciao'],
  es: ['ventana', 'llama', 'ojo de buey', 'psicología', 'alcalde', 'ojalá'],
  fr: ['fenêtre', 'avocat', 'pomme de terre', 'psychologie', 'travail', 'boulot'],
  pt: ['janela', 'manga', 'dor de cotovelo', 'psicologia', 'trabalho', 'saudade'],
  hi: ['पानी', 'किताब', 'जंगल', 'नमस्ते', 'धर्म', 'आग'],
  ur: ['پانی', 'کتاب', 'دل', 'زبان', 'جنگل', 'آگ'],
  sa: ['अग्नि', 'धर्म', 'योग', 'विद्या', 'कर्मन्', 'नामन्'],
}
const { values } = parseArgs({
  options: {
    phase: { type: 'string' },
    output: { type: 'string', default: 'bench-results/rich-research' },
    replay: { type: 'string' },
    word: { type: 'string' },
    language: { type: 'string' },
    context: { type: 'string' },
    'exa-redis-socket': { type: 'string' },
    'research-only': { type: 'boolean', default: false },
    'cost-limit': { type: 'string', default: '10' },
  },
})
if (!values.phase || !/^[a-z][a-z0-9-]*$/.test(values.phase))
  throw new Error('Pass a path-safe --phase, such as baseline or candidate')
if (values.language && !(values.language in CORPUS))
  throw new Error('Unsupported evaluation language')
if (values.context && (!values.word || !values.language))
  throw new Error('--context requires an explicit --word and --language')
const costLimit = Number(values['cost-limit'])
if (!Number.isFinite(costLimit) || costLimit <= 0 || costLimit > 10)
  throw new Error('--cost-limit must be greater than zero and at most $10')

// Both namespaces are cleared so a frozen checkout and the current application
// cannot accidentally read or mutate the configured production datastore.
for (const name of [
  'ETYMOLOGY_KV_REST_API_URL',
  'ETYMOLOGY_KV_REST_API_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
])
  delete process.env[name]

const output = resolve(values.output)
const phaseDirectory = join(output, values.phase)
mkdirSync(phaseDirectory, { recursive: true })
const redisSocket = values['exa-redis-socket']
async function localRedis(...args: string[]): Promise<unknown> {
  const process = Bun.spawn(['redis-cli', '-s', redisSocket!, '--json', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (code !== 0) throw new Error(`Local evaluation Redis operation failed: ${stderr.trim()}`)
  return JSON.parse(stdout)
}
const exaBudgetClient = redisSocket
  ? {
      eval: (script: string, keys: string[], args: (string | number)[]) =>
        localRedis('EVAL', script, String(keys.length), ...keys, ...args.map(String)),
      hgetall: async (key: string) => {
        const value = await localRedis('HGETALL', key)
        if (Array.isArray(value)) {
          const fields: Record<string, unknown> = {}
          for (let index = 0; index < value.length; index += 2)
            fields[String(value[index])] = value[index + 1]
          return fields
        }
        return value as Record<string, unknown> | null
      },
    }
  : undefined
const ledgerPath = join(output, 'llm-usage.json')
type Charge = {
  word: string
  language: string
  phase: string
  reservedUSD: number
  chargedUSD?: number
  model?: string
  inputTokens?: number
  outputTokens?: number
}
const charges: Charge[] = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, 'utf8')).charges
  : []
const spent = () =>
  charges.reduce((sum, charge) => sum + (charge.chargedUSD ?? charge.reservedUSD), 0)
const saveLedger = () =>
  writeFileSync(
    ledgerPath,
    JSON.stringify({ limitUSD: costLimit, accountedUSD: spent(), charges }, null, 2)
  )

type RecordedRequest = {
  url: string
  method: string
  key: string
  startedMs: number
  durationMs?: number
  status?: number
  error?: string
  replayed?: boolean
  bodyFile?: string
  headers?: Record<string, string>
  model?: string
}
type ProviderResponse = {
  model?: string
  usage?: { cost?: number; input_tokens?: number; output_tokens?: number }
  output_text?: string
}
function terminalResponse(text: string): ProviderResponse | undefined {
  if (!/(?:^|\n)data:/.test(text)) {
    try {
      return JSON.parse(text) as ProviderResponse
    } catch {
      return undefined
    }
  }
  let terminal: ProviderResponse | undefined
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    try {
      const event = JSON.parse(line.slice(6)) as { response?: ProviderResponse }
      if (event.response?.usage) terminal = event.response
    } catch {
      // SSE comments and incomplete terminal frames cannot release a reservation.
    }
  }
  return terminal
}

const originalFetch = globalThis.fetch
const rows: Array<Record<string, unknown>> = []
try {
  for (const [language, corpusWords] of Object.entries(CORPUS) as [
    LanguageCode,
    readonly string[],
  ][]) {
    if (values.language && values.language !== language) continue
    const words = values.word && values.language === language ? [values.word] : corpusWords
    for (const word of words) {
      if (values.word && values.word !== word) continue
      const slug = `${language}-${encodeURIComponent(word)}`
      const directory = join(phaseDirectory, slug)
      if (existsSync(join(directory, 'summary.json'))) {
        rows.push(JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8')))
        continue
      }
      mkdirSync(directory, { recursive: true })
      const requests: RecordedRequest[] = []
      const captures: Promise<void>[] = []
      const replayDirectory = values.replay ? join(resolve(values.replay), slug) : undefined
      const replay = new Map<string, RecordedRequest[]>()
      if (replayDirectory && existsSync(join(replayDirectory, 'summary.json'))) {
        const previous = JSON.parse(readFileSync(join(replayDirectory, 'summary.json'), 'utf8'))
        for (const request of previous.requests as RecordedRequest[]) {
          if (!request.bodyFile || new URL(request.url).hostname === 'openrouter.ai') continue
          const matches = replay.get(request.key) ?? []
          matches.push(request)
          replay.set(request.key, matches)
        }
      }
      const start = performance.now()
      const startingCharge = charges.length
      const events: Array<Record<string, unknown>> = []
      let researchMs: number | undefined
      let summary: Record<string, unknown> = { word, language, phase: values.phase }
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input)
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
        const host = new URL(url).hostname
        const provider = host === 'openrouter.ai'
        const body = typeof init?.body === 'string' ? init.body : ''
        const key = createHash('sha256').update(`${method}\n${url}\n${body}`).digest('hex')
        const item: RecordedRequest = { url, method, key, startedMs: performance.now() - start }
        const index = requests.push(item) - 1
        let charge: Charge | undefined
        if (provider) {
          if (values['research-only']) throw new Error('LLM disabled for research-only evaluation')
          const request = JSON.parse(body)
          request.model = CONFIG.model
          delete request.models
          init = { ...init, body: JSON.stringify(request) }
          item.model = request.model
          // UTF-8 bytes conservatively bound input tokens, including schema and instructions.
          const maximumInputTokens = Buffer.byteLength(JSON.stringify(request))
          const maximumOutputTokens = Number(request.max_output_tokens)
          const pricing = CONFIG.costTracking.pricingPerMillionTokens
          const reservedUSD =
            (maximumInputTokens * pricing.input + maximumOutputTokens * pricing.output) / 1_000_000
          if (!Number.isFinite(reservedUSD) || spent() + reservedUSD > costLimit)
            throw new Error('Local evaluation LLM allowance exhausted before dispatch')
          charge = { word, language, phase: values.phase!, reservedUSD, model: request.model }
          charges.push(charge)
          saveLedger()
        }
        try {
          const previous = replay.get(key)?.shift()
          const response =
            previous && replayDirectory
              ? new Response(readFileSync(join(replayDirectory, previous.bodyFile!), 'utf8'), {
                  status: previous.status,
                  headers: previous.headers,
                })
              : await originalFetch(input, init)
          item.replayed = Boolean(previous)
          item.status = response.status
          item.durationMs = performance.now() - start - item.startedMs
          if (provider) {
            captures.push(
              response
                .clone()
                .text()
                .then((text) => {
                  const terminal = terminalResponse(text)
                  if (terminal?.model) item.model = terminal.model
                  if (!charge || !terminal?.usage) return
                  const usage = terminal.usage
                  charge.inputTokens = usage.input_tokens
                  charge.outputTokens = usage.output_tokens
                  const pricing = CONFIG.costTracking.pricingPerMillionTokens
                  const measured =
                    typeof usage.cost === 'number'
                      ? usage.cost
                      : typeof usage.input_tokens === 'number' &&
                          typeof usage.output_tokens === 'number'
                        ? (usage.input_tokens * pricing.input +
                            usage.output_tokens * pricing.output) /
                          1_000_000
                        : undefined
                  if (typeof measured === 'number' && Number.isFinite(measured) && measured >= 0)
                    charge.chargedUSD = measured
                  saveLedger()
                })
            )
          } else {
            item.headers = Object.fromEntries(
              ['content-type', 'location', 'cf-mitigated'].flatMap((name) =>
                response.headers.has(name) ? [[name, response.headers.get(name)!]] : []
              )
            )
            captures.push(
              response
                .clone()
                .text()
                .then((text) => {
                  item.bodyFile = `source-${index}.txt`
                  writeFileSync(join(directory, item.bodyFile), text)
                })
            )
          }
          return response
        } catch (error) {
          item.error = safeError(error)
          throw error
        }
      }) as typeof fetch
      try {
        const researchOptions = { language, ...(exaBudgetClient ? { exaBudgetClient } : {}) }
        const context = values.context
          ? (JSON.parse(readFileSync(values.context, 'utf8')) as ResearchContext)
          : await conductAgenticResearch(word, researchOptions, (event) => {
              events.push({ elapsedMs: performance.now() - start, ...event })
            })
        if (context.mainWord.word !== word || (context.language ?? 'en') !== language)
          throw new Error('Frozen context identity does not match the requested word and language')
        researchMs = performance.now() - start
        writeFileSync(join(directory, 'context.json'), JSON.stringify(context, null, 2))
        summary = {
          ...summary,
          sourceAttempts: context.totalSourcesFetched,
          researchHistories: context.lexicalGraph?.histories.length ?? 0,
          incompleteResearch: context.incompleteResearch ?? false,
          credibleMainSource: hasCredibleMainSource(context),
          contextReplay: Boolean(values.context),
        }
        if (!hasCredibleMainSource(context))
          throw new Error('No credible main source; synthesis skipped')
        if (!values['research-only']) {
          const synthesis = await synthesizeFromResearch(context, {
            onSection: (section) => {
              events.push({
                type: 'synthesis_section',
                section,
                elapsedMs: performance.now() - start,
              })
            },
          })
          writeFileSync(join(directory, 'result.json'), JSON.stringify(synthesis.result, null, 2))
          summary.usage = synthesis.usage
          summary.success = true
        }
      } catch (error) {
        summary.error = safeError(error)
        summary.success = false
      } finally {
        await Promise.allSettled(captures)
        const queryCharges = charges.slice(startingCharge)
        summary = {
          ...summary,
          researchMs,
          totalMs: performance.now() - start,
          accountedUSD: queryCharges.reduce(
            (sum, charge) => sum + (charge.chargedUSD ?? charge.reservedUSD),
            0
          ),
          reportedCostUSD: queryCharges.reduce((sum, charge) => sum + (charge.chargedUSD ?? 0), 0),
          unsettledCalls: queryCharges.filter((charge) => charge.chargedUSD === undefined).length,
          events,
          requests,
        }
        writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2))
        rows.push(summary)
        writeFileSync(join(phaseDirectory, 'summary.json'), JSON.stringify(rows, null, 2))
        console.log(JSON.stringify({ ...summary, events: undefined, requests: undefined }))
      }
    }
  }
} finally {
  globalThis.fetch = originalFetch
}
