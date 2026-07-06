/**
 * Quality benchmark harness for the etymology pipeline.
 *
 * Runs the full research + synthesis pipeline IN-PROCESS (no HTTP server) over a
 * fixed 15-word set spanning 4 buckets, and records per-word quality/cost metrics
 * so pipeline changes can be gated on before/after comparisons.
 *
 * Usage:
 *   bun scripts/benchmark.ts --label <name> [--model <openrouter-slug>]
 *   bun scripts/benchmark.ts --compare <labelA> <labelB>
 *   bun scripts/benchmark.ts --help
 *
 * Each full run makes ~2 LLM calls per word (~$0.02/word, ~$0.30/run) plus
 * external source fetches. Results are written to gitignored bench-results/<label>/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { CONFIG } from '@/lib/config'
import { safeError } from '@/lib/errorUtils'
import { synthesizeFromResearch } from '@/lib/llm'
import { conductAgenticResearch } from '@/lib/research'
import { EtymologyResultSchema } from '@/lib/schemas/etymology'
import type { AncestryStage, EtymologyResult } from '@/lib/types'

const RESULTS_DIR = join(process.cwd(), 'bench-results')

// The in-process research + synthesis path only needs the OpenRouter key today.
// Redis (ETYMOLOGY_KV_*) is route-level infrastructure (cache/costGuard/singleflight)
// and is not touched by this harness.
const REQUIRED_ENV_VARS = ['OPENROUTER_API_KEY'] as const

type Bucket = 'classical' | 'germanic' | 'neologism' | 'tricky'

const BENCHMARK_WORDS: ReadonlyArray<{ word: string; bucket: Bucket }> = [
  { word: 'perfidious', bucket: 'classical' },
  { word: 'telephone', bucket: 'classical' },
  { word: 'autobiography', bucket: 'classical' },
  { word: 'incredible', bucket: 'classical' },
  { word: 'bread', bucket: 'germanic' },
  { word: 'understand', bucket: 'germanic' },
  { word: 'harvest', bucket: 'germanic' },
  { word: 'word', bucket: 'germanic' },
  { word: 'selfie', bucket: 'neologism' },
  { word: 'doomscrolling', bucket: 'neologism' },
  { word: 'rizz', bucket: 'neologism' },
  { word: 'nice', bucket: 'tricky' },
  { word: 'muscle', bucket: 'tricky' },
  { word: 'quarantine', bucket: 'tricky' },
  { word: 'sincere', bucket: 'tricky' },
]

interface ConfidenceDistribution {
  high: number
  medium: number
  low: number
  unscored: number
}

interface WordBenchmark {
  word: string
  bucket: Bucket
  ok: boolean
  error?: string
  schemaValid: boolean
  latencyMs: {
    sourceFetch: number
    rootExtraction: number
    expansion: number
    research: number
    synthesis: number
    total: number
  }
  // Synthesis-call usage only: conductAgenticResearch does not expose the
  // root-extraction LLM usage yet (wired up when fix/safety-hardening lands).
  synthesisTokens: { input: number; output: number }
  rootCount: number
  ancestryStageCount: number
  confidence: ConfidenceDistribution
  ungroundedReconstructedStages: number
  lore: string
}

interface BenchmarkSummary {
  label: string
  model: string
  startedAt: string
  durationMs: number
  words: WordBenchmark[]
}

function fail(message: string): never {
  console.error(`Error: ${message}`)
  process.exit(1)
}

/** Labels become directory names under bench-results/ — keep them path-safe. */
function assertValidLabel(label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) {
    fail(`invalid label "${label}" — use letters, digits, dots, dashes, or underscores`)
  }
}

function assertRequiredEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim())
  if (missing.length === 0) return

  fail(
    `missing required environment variable(s): ${missing.join(', ')}.\n` +
      'Set them in .env.local (see .env.example for the full list) or export them ' +
      'before running the benchmark. Redis (ETYMOLOGY_KV_*) variables are NOT ' +
      'required — the in-process pipeline does not use Redis.'
  )
}

function collectStages(graph: EtymologyResult['ancestryGraph']): AncestryStage[] {
  const stages = graph.branches.flatMap((branch) => branch.stages)
  return graph.postMerge ? [...stages, ...graph.postMerge] : stages
}

function distributeConfidence(stages: AncestryStage[]): ConfidenceDistribution {
  const distribution: ConfidenceDistribution = { high: 0, medium: 0, low: 0, unscored: 0 }
  for (const stage of stages) {
    distribution[stage.confidence ?? 'unscored'] += 1
  }
  return distribution
}

function countUngroundedReconstructed(stages: AncestryStage[]): number {
  let count = 0
  for (const stage of stages) {
    if (stage.isReconstructed && (stage.evidence?.length ?? 0) === 0) {
      count += 1
    }
  }
  return count
}

async function benchmarkWord(
  word: string,
  bucket: Bucket,
  model: string | undefined,
  outputDir: string
): Promise<WordBenchmark> {
  const marks: { parsingDone?: number; rootsDone?: number } = {}
  const startedAt = performance.now()

  try {
    const context = await conductAgenticResearch(word, undefined, (event) => {
      if (event.type === 'parsing_complete') marks.parsingDone = performance.now()
      if (event.type === 'roots_identified') marks.rootsDone = performance.now()
    })
    const researchDone = performance.now()

    const { result, usage } = await synthesizeFromResearch(context, { model })
    const synthesisDone = performance.now()

    const stages = collectStages(result.ancestryGraph)
    const parsingDone = marks.parsingDone ?? researchDone
    const rootsDone = marks.rootsDone ?? parsingDone

    const record: WordBenchmark = {
      word,
      bucket,
      ok: true,
      schemaValid: EtymologyResultSchema.safeParse(result).success,
      latencyMs: {
        sourceFetch: Math.round(parsingDone - startedAt),
        rootExtraction: Math.round(rootsDone - parsingDone),
        expansion: Math.round(researchDone - rootsDone),
        research: Math.round(researchDone - startedAt),
        synthesis: Math.round(synthesisDone - researchDone),
        total: Math.round(synthesisDone - startedAt),
      },
      synthesisTokens: { input: usage.inputTokens, output: usage.outputTokens },
      rootCount: result.roots.length,
      ancestryStageCount: stages.length,
      confidence: distributeConfidence(stages),
      ungroundedReconstructedStages: countUngroundedReconstructed(stages),
      lore: result.lore,
    }

    writeFileSync(join(outputDir, `${word}.json`), JSON.stringify({ ...record, result }, null, 2))
    return record
  } catch (error) {
    return {
      word,
      bucket,
      ok: false,
      error: safeError(error),
      schemaValid: false,
      latencyMs: {
        sourceFetch: 0,
        rootExtraction: 0,
        expansion: 0,
        research: 0,
        synthesis: 0,
        total: Math.round(performance.now() - startedAt),
      },
      synthesisTokens: { input: 0, output: 0 },
      rootCount: 0,
      ancestryStageCount: 0,
      confidence: { high: 0, medium: 0, low: 0, unscored: 0 },
      ungroundedReconstructedStages: 0,
      lore: '',
    }
  }
}

function formatWordLine(record: WordBenchmark): string {
  if (!record.ok) {
    return `FAIL ${record.word} [${record.bucket}] ${record.error}`
  }

  const { confidence: c, latencyMs } = record
  const seconds = (latencyMs.total / 1000).toFixed(1)
  return (
    `ok   ${record.word} [${record.bucket}] ${seconds}s | ` +
    `${record.synthesisTokens.input} in / ${record.synthesisTokens.output} out tok | ` +
    `${record.rootCount} roots, ${record.ancestryStageCount} stages ` +
    `(${c.high}h/${c.medium}m/${c.low}l/${c.unscored}u) | ` +
    `${record.ungroundedReconstructedStages} ungrounded reconstructed`
  )
}

async function runBenchmark(label: string, model: string | undefined): Promise<void> {
  assertValidLabel(label)
  assertRequiredEnv()

  const outputDir = join(RESULTS_DIR, label)
  if (existsSync(outputDir)) {
    fail(
      `bench-results/${label}/ already exists. Pick a fresh --label or delete the ` +
        'old directory to avoid mixing runs.'
    )
  }
  mkdirSync(outputDir, { recursive: true })

  const effectiveModel = model ?? CONFIG.model
  console.log(`Benchmark run "${label}" | synthesis model: ${effectiveModel}`)
  console.log(`Words: ${BENCHMARK_WORDS.length} | output: bench-results/${label}/\n`)

  const startedAt = new Date()
  const runStart = performance.now()
  const words: WordBenchmark[] = []

  for (const { word, bucket } of BENCHMARK_WORDS) {
    const record = await benchmarkWord(word, bucket, model, outputDir)
    words.push(record)
    console.log(formatWordLine(record))
  }

  const summary: BenchmarkSummary = {
    label,
    model: effectiveModel,
    startedAt: startedAt.toISOString(),
    durationMs: Math.round(performance.now() - runStart),
    words,
  }
  writeFileSync(join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2))

  console.log(`\n${formatAggregates(summary)}`)
  console.log(`\nWrote bench-results/${label}/summary.json (+${words.length} per-word files)`)
}

interface Aggregates {
  okCount: number
  schemaValidCount: number
  synthesisInputTokens: number
  synthesisOutputTokens: number
  totalLatencyP50: number
  synthesisLatencyP50: number
  ungroundedReconstructed: number
  confidence: ConfidenceDistribution
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))
  return sorted[index] ?? 0
}

function aggregate(summary: BenchmarkSummary): Aggregates {
  const okRecords = summary.words.filter((record) => record.ok)
  const totals = okRecords.map((record) => record.latencyMs.total).sort((a, b) => a - b)
  const synthesis = okRecords.map((record) => record.latencyMs.synthesis).sort((a, b) => a - b)

  const confidence: ConfidenceDistribution = { high: 0, medium: 0, low: 0, unscored: 0 }
  for (const record of okRecords) {
    confidence.high += record.confidence.high
    confidence.medium += record.confidence.medium
    confidence.low += record.confidence.low
    confidence.unscored += record.confidence.unscored
  }

  return {
    okCount: okRecords.length,
    schemaValidCount: summary.words.filter((record) => record.schemaValid).length,
    synthesisInputTokens: okRecords.reduce((sum, record) => sum + record.synthesisTokens.input, 0),
    synthesisOutputTokens: okRecords.reduce(
      (sum, record) => sum + record.synthesisTokens.output,
      0
    ),
    totalLatencyP50: percentile(totals, 0.5),
    synthesisLatencyP50: percentile(synthesis, 0.5),
    ungroundedReconstructed: okRecords.reduce(
      (sum, record) => sum + record.ungroundedReconstructedStages,
      0
    ),
    confidence,
  }
}

function formatAggregates(summary: BenchmarkSummary): string {
  const agg = aggregate(summary)
  const total = summary.words.length
  const c = agg.confidence
  return [
    `Completed: ${agg.okCount}/${total} | schema-valid: ${agg.schemaValidCount}/${total}`,
    `Tokens (synthesis only): ${agg.synthesisInputTokens} in / ${agg.synthesisOutputTokens} out`,
    `Latency p50: ${agg.totalLatencyP50}ms total, ${agg.synthesisLatencyP50}ms synthesis`,
    `Confidence: ${c.high} high / ${c.medium} medium / ${c.low} low / ${c.unscored} unscored`,
    `Ungrounded reconstructed stages: ${agg.ungroundedReconstructed}`,
  ].join('\n')
}

function loadSummary(label: string): BenchmarkSummary {
  assertValidLabel(label)
  const path = join(RESULTS_DIR, label, 'summary.json')
  if (!existsSync(path)) {
    fail(`no summary found at bench-results/${label}/summary.json — run the benchmark first`)
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as BenchmarkSummary
  } catch (error) {
    return fail(
      `could not parse bench-results/${label}/summary.json (${safeError(error)}). ` +
        'The file may be corrupted — delete the run directory and re-run the benchmark.'
    )
  }
}

function compareRow(metric: string, a: number, b: number): string {
  const delta = b - a
  const sign = delta > 0 ? '+' : ''
  return `${metric.padEnd(34)} ${String(a).padStart(10)} ${String(b).padStart(10)} ${(
    sign + delta
  ).padStart(10)}`
}

function compareLabels(labelA: string, labelB: string): void {
  const summaryA = loadSummary(labelA)
  const summaryB = loadSummary(labelB)
  const aggA = aggregate(summaryA)
  const aggB = aggregate(summaryB)

  console.log(`Comparing "${labelA}" (model ${summaryA.model})`)
  console.log(`   vs     "${labelB}" (model ${summaryB.model})\n`)
  console.log(
    `${'metric'.padEnd(34)} ${labelA.slice(0, 10).padStart(10)} ` +
      `${labelB.slice(0, 10).padStart(10)} ${'delta'.padStart(10)}`
  )

  console.log(compareRow('completed words', aggA.okCount, aggB.okCount))
  console.log(compareRow('schema-valid words', aggA.schemaValidCount, aggB.schemaValidCount))
  console.log(
    compareRow('input tokens (synthesis)', aggA.synthesisInputTokens, aggB.synthesisInputTokens)
  )
  console.log(
    compareRow('output tokens (synthesis)', aggA.synthesisOutputTokens, aggB.synthesisOutputTokens)
  )
  console.log(compareRow('latency p50 total (ms)', aggA.totalLatencyP50, aggB.totalLatencyP50))
  console.log(
    compareRow('latency p50 synthesis (ms)', aggA.synthesisLatencyP50, aggB.synthesisLatencyP50)
  )
  console.log(compareRow('confidence: high', aggA.confidence.high, aggB.confidence.high))
  console.log(compareRow('confidence: medium', aggA.confidence.medium, aggB.confidence.medium))
  console.log(compareRow('confidence: low', aggA.confidence.low, aggB.confidence.low))
  console.log(
    compareRow('confidence: unscored', aggA.confidence.unscored, aggB.confidence.unscored)
  )
  console.log(
    compareRow(
      'ungrounded reconstructed stages',
      aggA.ungroundedReconstructed,
      aggB.ungroundedReconstructed
    )
  )

  console.log('\nPer-word total latency (ms) and schema validity:')
  for (const { word } of BENCHMARK_WORDS) {
    const a = summaryA.words.find((record) => record.word === word)
    const b = summaryB.words.find((record) => record.word === word)
    const validA = a ? (a.schemaValid ? 'valid' : 'INVALID') : 'missing'
    const validB = b ? (b.schemaValid ? 'valid' : 'INVALID') : 'missing'
    console.log(
      `${word.padEnd(16)} ${String(a?.latencyMs.total ?? '-').padStart(8)} -> ` +
        `${String(b?.latencyMs.total ?? '-').padStart(8)}   ${validA} -> ${validB}`
    )
  }
}

function printHelp(): void {
  console.log(`Etymology pipeline quality benchmark

Usage:
  bun scripts/benchmark.ts --label <name> [--model <openrouter-slug>]
  bun scripts/benchmark.ts --compare <labelA> <labelB>
  bun scripts/benchmark.ts --help

Options:
  --label <name>    Name for this run; results go to bench-results/<name>/ (gitignored).
                    Defaults to run-<timestamp>.
  --model <slug>    Override the synthesis model (e.g. deepseek/deepseek-v4-pro).
                    Root extraction keeps the default model.
  --compare <a> <b> Print a comparison table for two prior runs. Makes no API calls.
  --help            Show this help.

A full run benchmarks ${BENCHMARK_WORDS.length} words (~2 LLM calls each, roughly $0.02/word).
Requires ${REQUIRED_ENV_VARS.join(', ')} in the environment (.env.local works).`)
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      label: { type: 'string' },
      model: { type: 'string' },
      compare: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    printHelp()
    return
  }

  if (values.compare) {
    const labels = [values.compare, ...positionals]
    if (labels.length !== 2) {
      fail('--compare needs exactly two labels: --compare <labelA> <labelB>')
    }
    compareLabels(labels[0]!, labels[1]!)
    return
  }

  if (positionals.length > 0) {
    fail(`unexpected arguments: ${positionals.join(' ')} (see --help)`)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  await runBenchmark(values.label ?? `run-${timestamp}`, values.model)
}

main().catch((error) => {
  fail(safeError(error))
})
