/** Paired input experiments and same-response history timing, without production cache writes. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildResearchPrompt } from '@/lib/research'
import { finalizeResult, synthesizeFromResearch, getLlmUsageFromError } from '@/lib/llm'
import {
  SYSTEM_PROMPT,
  buildBetaSystemPrompt,
  buildBetaUserPrompt,
  buildRichUserPrompt,
} from '@/lib/prompts'
import { LANGUAGES } from '@/lib/languages'
import { createSectionScanner } from '@/lib/sectionScanner'
import { stripNullsDeep } from '@/lib/schemas/llm-schema'
import {
  assertCompleteResponse,
  buildSynthesisRequest,
  extractUsage,
  streamOpenRouterResponse,
} from '@/lib/openrouterResponses'
import { usageToUSD } from '@/lib/costGuard'
import { safeError } from '@/lib/errorUtils'
import { CONFIG } from '@/lib/config'
import type { EtymologyResult, LlmUsage, ResearchContext } from '@/lib/types'
import { deduplicatePrompt } from './prompt-dedup'

const { values } = parseArgs({
  options: {
    context: { type: 'string' },
    label: { type: 'string' },
    runs: { type: 'string', default: '3' },
  },
})
if (!values.context || !values.label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.label))
  throw new Error('Pass --context and a new path-safe --label')
const runs = Number(values.runs)
if (!Number.isInteger(runs) || runs < 1 || runs > 3) throw new Error('--runs must be 1..3')
delete process.env.ETYMOLOGY_KV_REST_API_URL
delete process.env.ETYMOLOGY_KV_REST_API_TOKEN
const context = JSON.parse(readFileSync(values.context, 'utf8')) as ResearchContext
const contextHash = createHash('sha256').update(JSON.stringify(context)).digest('hex')
const language = context.language ?? 'en'
const histories = context.lexicalGraph?.histories
if (!histories?.length) throw new Error('Recording must contain source-defined histories')
const languageName = LANGUAGES[language].englishName
const research = buildResearchPrompt(context)
const input =
  language === 'en'
    ? buildRichUserPrompt(context.mainWord.word, research)
    : buildBetaUserPrompt(context.mainWord.word, languageName, language, research)
const baseline = buildSynthesisRequest(input, undefined, language, true)
baseline.instructions =
  language === 'en' ? SYSTEM_PROMPT : buildBetaSystemPrompt(languageName, language)
const deduplicated = deduplicatePrompt(input)
const directory = join('bench-results/research-performance', values.label)
if (existsSync(directory)) throw new Error('Benchmark label already exists; choose a new label')
mkdirSync(directory, { recursive: true })
writeFileSync(join(directory, 'context.json'), JSON.stringify(context, null, 2))
writeFileSync(join(directory, 'baseline-input.txt'), input)
writeFileSync(join(directory, 'deduplicated-input.txt'), deduplicated.prompt)
writeFileSync(
  join(directory, 'input-audit.json'),
  JSON.stringify(deduplicated.replacements, null, 2)
)
writeFileSync(
  join(directory, 'request-shape.json'),
  JSON.stringify({ ...baseline, input: undefined }, null, 2)
)
const originalFetch = globalThis.fetch

// Capture the real production request before any live call; headers are never retained.
let captured: unknown
globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
  captured = JSON.parse(String(init?.body))
  return Response.json({ error: { message: 'Benchmark request capture' } }, { status: 503 })
}) as typeof fetch
try {
  await assert.rejects(
    synthesizeFromResearch(context, { onSection() {} }),
    /Benchmark request capture/
  )
  assert.deepEqual(captured, { ...baseline, stream: true })
} finally {
  globalThis.fetch = originalFetch
}

interface Row {
  run: number
  variant: string
  inputCharacters: number
  firstContentMs?: number
  firstHistoryMs?: number
  synthesisMs?: number
  usage?: LlmUsage
  providerUsage?: unknown
  costUSD: number
  resolvedModel?: string
  error?: string
}
const rows: Row[] = []
const median = (samples: number[]) =>
  samples.length ? [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] : null
const save = () => {
  const summary = Object.fromEntries(
    ['baseline', 'deduplicated'].map((variant) => {
      const group = rows.filter((row) => row.variant === variant)
      const valid = group.filter((row) => !row.error)
      return [
        variant,
        {
          valid: valid.length,
          failed: group.length - valid.length,
          firstContentMs: median(valid.map((row) => row.firstContentMs!)),
          firstHistoryMs: median(valid.map((row) => row.firstHistoryMs!)),
          synthesisMs: median(valid.map((row) => row.synthesisMs!)),
          inputTokens: median(valid.map((row) => row.usage!.inputTokens)),
          outputTokens: median(valid.map((row) => row.usage!.outputTokens)),
        },
      ]
    })
  )
  writeFileSync(
    join(directory, 'summary.json'),
    JSON.stringify(
      {
        word: context.mainWord.word,
        language,
        contextHash,
        histories: histories.length,
        charactersSaved: input.length - deduplicated.prompt.length,
        costUSD: rows.reduce((total, row) => total + row.costUSD, 0),
        rows,
        summary,
      },
      null,
      2
    )
  )
  return summary
}

for (let run = 0; run < runs; run++) {
  for (const variant of run % 2 ? ['deduplicated', 'baseline'] : ['baseline', 'deduplicated']) {
    if (rows.reduce((total, row) => total + row.costUSD, 0) >= 0.5)
      throw new Error('Benchmark reached its local USD 0.50 spending ceiling')
    const request = { ...baseline, input: variant === 'baseline' ? input : deduplicated.prompt }
    assert.deepEqual({ ...request, input }, baseline, 'Only the input text may differ')
    const row: Row = { run, variant, inputCharacters: request.input.length, costUSD: 0 }
    const deltas: Array<{ elapsedMs: number; delta: string }> = []
    const top = new Map<string, unknown>()
    let primary: unknown
    let early: EtymologyResult | undefined
    let baselinePrimary: EtymologyResult | undefined
    let validationError: unknown
    const start = performance.now()
    const candidateContext: ResearchContext = {
      ...context,
      lexicalGraph: { ...context.lexicalGraph!, histories: histories.slice(0, 1) },
    }
    const project = (items: unknown[], scope: ResearchContext) =>
      finalizeResult(
        {
          word: top.get('word'),
          language: top.get('language') ?? 'en',
          primaryHistoryId: top.get('primaryHistoryId'),
          histories: structuredClone(items),
          sources: [],
        } as unknown as EtymologyResult,
        scope,
        'streaming'
      )
    const tryEarly = () => {
      if (early || !primary || !top.has('word') || !top.has('primaryHistoryId')) return
      if (language !== 'en' && !top.has('language')) return
      try {
        early = project([primary], candidateContext)
        row.firstHistoryMs = performance.now() - start
      } catch (error) {
        validationError = error
      }
    }
    const scanner = createSectionScanner(
      (section, data) => {
        top.set(section, stripNullsDeep(data))
        tryEarly()
        if (section === 'histories') {
          try {
            assert.ok(Array.isArray(data))
            baselinePrimary = project(stripNullsDeep(data), context)
            row.firstContentMs = performance.now() - start
          } catch (error) {
            validationError = error
          }
        }
      },
      (section, _index, data) => {
        if (
          section === 'histories' &&
          data &&
          typeof data === 'object' &&
          'id' in data &&
          data.id === histories[0].id
        ) {
          primary = stripNullsDeep(data)
          tryEarly()
        }
      }
    )
    try {
      const response = await streamOpenRouterResponse(
        request,
        (delta) => {
          deltas.push({ elapsedMs: performance.now() - start, delta })
          scanner.push(delta)
        },
        CONFIG.timeouts.llm,
        AbortSignal.timeout(CONFIG.timeouts.llm)
      )
      row.usage = extractUsage(response)
      row.providerUsage = response.usage
      row.costUSD = usageToUSD(row.usage)
      const metadata = response as typeof response & { model?: string }
      row.resolvedModel = metadata.model
      assertCompleteResponse(response)
      if (validationError) throw validationError

      // Replay the generated bytes through the complete production finalizer,
      // including sanitization, scoped grounding, and bilingual schema checks.
      const encoder = new TextEncoder()
      globalThis.fetch = (async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const { delta } of deltas)
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta })}\n\n`
                  )
                )
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`
                )
              )
              controller.close()
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } }
        )) as unknown as typeof fetch
      let terminal: EtymologyResult
      try {
        terminal = (await synthesizeFromResearch(context, { onSection() {} })).result
      } finally {
        globalThis.fetch = originalFetch
      }
      row.synthesisMs = performance.now() - start
      assert.ok(early && baselinePrimary, 'Both projection paths must validate')
      for (const entry of [early, baselinePrimary])
        assert.deepEqual(
          entry.histories![0],
          terminal.histories!.find((history) => history.id === terminal.primaryHistoryId)
        )
      assert.equal(createHash('sha256').update(JSON.stringify(context)).digest('hex'), contextHash)
      writeFileSync(
        join(directory, `${run}-${variant}-result.json`),
        JSON.stringify(terminal, null, 2)
      )
    } catch (error) {
      globalThis.fetch = originalFetch
      const usage = getLlmUsageFromError(error)
      if (!row.usage && usage) {
        row.usage = usage
        row.costUSD = usageToUSD(usage)
      }
      row.error = safeError(error)
    }
    writeFileSync(join(directory, `${run}-${variant}-stream.json`), JSON.stringify(deltas))
    rows.push(row)
    console.log(row)
    save()
    if (row.error && /(?:402|quota|credit|payment)/i.test(row.error))
      throw new Error('Provider quota/payment failure; stopping live calls')
  }
}
console.log(save())
if (rows.some((row) => row.error)) process.exitCode = 1
