/** Explicit, bounded paid evaluation. Never imported by the application. */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { getSpendStats, recordSpend } from '@/lib/costGuard'
import { getRedis } from '@/lib/redis'
import { safeError } from '@/lib/errorUtils'
import { fetchWithTimeout } from '@/lib/fetchUtils'
import {
  decisionCost,
  fixtures,
  GATE,
  hash,
  MODELS,
  parseAnswers,
  PROTOCOL,
  requestFor,
  summarize,
  type Measurement,
  type DecisionUsage,
} from './evaluation'

const { values } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    label: { type: 'string' },
    limit: { type: 'string', default: '32' },
  },
})
if (!values.label || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(values.label))
  throw new Error('Pass a unique path-safe --label')
const limit = Number(values.limit)
if (!Number.isInteger(limit) || limit < 1 || limit > fixtures.length)
  throw new Error(`--limit must be 1..${fixtures.length}`)
const selected = fixtures.slice(0, limit)
const directory = join('bench-results', 'decisions', values.label)
mkdirSync(join('bench-results', 'decisions'), { recursive: true })
mkdirSync(directory)
const maxUSD = 0.25
const catalogResponse = await fetchWithTimeout(
  'https://openrouter.ai/api/v1/models?output_modalities=decisions',
  {},
  15_000
)
if (!catalogResponse.ok) throw new Error(`Decision catalog returned HTTP ${catalogResponse.status}`)
const catalog = (await catalogResponse.json()) as {
  data: Array<{
    id: string
    canonical_slug: string
    pricing: { prompt: string; completion: string }
  }>
}
const models = MODELS.map((id) => {
  const item = catalog.data.find((model) => model.id === id)
  if (
    !item ||
    !Number.isFinite(Number(item.pricing.prompt)) ||
    Number(item.pricing.prompt) < 0 ||
    Number(item.pricing.completion) !== 0
  )
    throw new Error(`Unsupported decision pricing or unavailable model: ${id}`)
  return item
})
const manifest = {
  protocol: PROTOCOL,
  createdAt: new Date().toISOString(),
  live: values.live,
  fixtureHash: hash(selected),
  fixtures: selected,
  models,
  maxUSD,
  gate: GATE,
  variants: ['original', 'identical-repeat', 'reversed-options'],
  requestCount: selected.length * models.length * 3,
}
writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
if (!values.live) {
  console.log(JSON.stringify({ directory, calls: manifest.requestCount, maxUSD, live: false }))
  process.exit(0)
}
const key = process.env.OPENROUTER_API_KEY
if (!key) throw new Error('OPENROUTER_API_KEY is required for --live')
if (!getRedis()) throw new Error('Redis accounting is required for live decision evaluation')
const rows: Measurement[] = []
const stopped = new Set<string>()
let spent = 0
let fatal: string | undefined
try {
  // Rotate model order across cases; each call contains both questions, without labels or provenance.
  for (let variant = 0; variant < 3; variant++) {
    for (let index = 0; index < selected.length; index++) {
      for (let offset = 0; offset < models.length; offset++) {
        const model = models[(index + variant + offset) % models.length]
        if (stopped.has(model.id)) continue
        const fixture = selected[index]
        const request = requestFor(fixture, model.canonical_slug, variant)
        const body = JSON.stringify(request)
        // UTF-8 bytes conservatively bound text tokens, with room for API formatting overhead.
        // Unknown charges retain this reserve and stop that model; they never appear as free calls.
        const reserve = (Buffer.byteLength(body) + 4096) * Number(model.pricing.prompt)
        const stats = await getSpendStats()
        if (!stats || stats.mode !== 'normal' || stats.spentUSD + reserve >= stats.limitUSD * 0.9)
          throw new Error('Monthly spend guard prevents further decision calls')
        if (spent + reserve > maxUSD)
          throw new Error('Decision evaluation reached its $0.25 run limit')
        const row: Measurement = {
          model: model.id,
          caseId: fixture.id,
          variant,
          latencyMs: 0,
          costUSD: reserve,
          reportedCost: false,
          requestHash: hash(request),
        }
        const started = performance.now()
        let status: number | undefined
        let responseBody: Record<string, unknown> | undefined
        try {
          const response = await fetchWithTimeout(
            'https://openrouter.ai/api/alpha/decisions',
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body,
            },
            15_000
          )
          status = response.status
          responseBody = (await response.json()) as Record<string, unknown>
          const usage = responseBody.usage as DecisionUsage | undefined
          Object.assign(row, decisionCost(usage, reserve))
          row.inputTokens = usage?.input_tokens
          row.outputTokens = usage?.output_tokens
          row.resolvedModel =
            typeof responseBody.model === 'string' ? responseBody.model : undefined
          row.provider =
            typeof responseBody.provider === 'string' ? responseBody.provider : undefined
          if (!response.ok)
            throw new Error(
              `Decisions ${model.id} returned HTTP ${status}: ${JSON.stringify(responseBody.error ?? 'request failed')}`
            )
          row.answers = parseAnswers(responseBody)
          if (!row.reportedCost) stopped.add(model.id)
        } catch (error) {
          row.error = safeError(error)
          // No retries: preserve billed malformed responses, avoid retrying quota/auth/config failures.
          if (!row.reportedCost || (status && status >= 400 && status < 500)) stopped.add(model.id)
        } finally {
          row.latencyMs = performance.now() - started
          spent += row.costUSD
          rows.push(row)
          appendFileSync(join(directory, 'measurements.jsonl'), JSON.stringify(row) + '\n')
          if (responseBody)
            appendFileSync(
              join(directory, 'responses.jsonl'),
              safeError(
                JSON.stringify({
                  caseId: fixture.id,
                  variant,
                  model: model.id,
                  response: responseBody,
                })
              ) + '\n'
            )
          await recordSpend({
            inputTokens: row.inputTokens ?? 0,
            outputTokens: row.outputTokens ?? 0,
            costUSD: row.costUSD,
          })
          writeFileSync(
            join(directory, 'summary.json'),
            JSON.stringify({ spentUSD: spent, models: summarize(rows) }, null, 2) + '\n'
          )
        }
        if (row.error)
          console.log(JSON.stringify({ model: model.id, case: fixture.id, error: row.error }))
      }
      if (index % 8 === 7)
        console.log(
          JSON.stringify({ variant, cases: index + 1, calls: rows.length, spentUSD: spent })
        )
    }
  }
} catch (error) {
  fatal = safeError(error)
} finally {
  const summary = {
    protocol: PROTOCOL,
    spentUSD: spent,
    calls: rows.length,
    plannedCalls: manifest.requestCount,
    stoppedModels: [...stopped],
    fatal,
    models: summarize(rows),
  }
  writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify({ directory, ...summary }, null, 2))
  if (fatal || rows.some((row) => row.error) || rows.length !== manifest.requestCount)
    process.exitCode = 1
}
