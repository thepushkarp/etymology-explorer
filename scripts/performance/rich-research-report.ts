/** Structural before/after evidence inventory; linguistic improvement still requires review. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    candidate: { type: 'string' },
    output: { type: 'string', default: 'bench-results/rich-research/comparison.md' },
  },
})
if (!values.baseline || !values.candidate)
  throw new Error('Pass --baseline and --candidate directories')
if (!values.output.endsWith('.md')) throw new Error('--output must end in .md')
type Json = Record<string, unknown>
const read = (file: string): Json | undefined =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined

function sources(value: unknown, found = new Map<string, number>()): Map<string, number> {
  if (!value || typeof value !== 'object') return found
  if (Array.isArray(value)) {
    for (const item of value) sources(item, found)
    return found
  }
  const object = value as Json
  if (typeof object.url === 'string' && typeof object.text === 'string')
    found.set(object.url, Math.max(found.get(object.url) ?? 0, object.text.length))
  for (const item of Object.values(object)) sources(item, found)
  return found
}

function stages(value: unknown, found = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return found
  if (Array.isArray(value)) {
    for (const item of value) stages(item, found)
    return found
  }
  const object = value as Json
  if (typeof object.form === 'string' && typeof object.stage === 'string' && 'confidence' in object)
    found.add(`${object.stage}: ${object.form}`)
  for (const item of Object.values(object)) stages(item, found)
  return found
}

function measure(directory: string, slug: string) {
  const summary = read(join(directory, slug, 'summary.json'))
  const context = read(join(directory, slug, 'context.json'))
  const result = read(join(directory, slug, 'result.json'))
  const pages = sources(context)
  const requests = (summary?.requests ?? []) as Json[]
  const input = (summary?.usage as Json | undefined)?.inputTokens
  const requestsToSources = requests.filter((r) => !String(r.url).includes('openrouter.ai'))
  return {
    summary,
    result,
    pages,
    stages: stages(result?.histories ?? result?.ancestryGraph),
    inputTokens: typeof input === 'number' ? input : undefined,
    sourceAttempts: Number(summary?.sourceAttempts ?? requestsToSources.length),
    sourceChars: [...pages.values()].reduce((sum, length) => sum + length, 0),
    degradedRequests: requestsToSources.filter((r) => Number(r.status) >= 400 || r.error).length,
    replayedRequests: requestsToSources.filter((r) => r.replayed).length,
    exaCalls: requestsToSources.filter((r) => String(r.url).includes('api.exa.ai')).length,
    histories: Array.isArray(result?.histories) ? result.histories.length : 0,
  }
}

const baseline = resolve(values.baseline)
const candidate = resolve(values.candidate)
const slugs = readdirSync(baseline, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
const paired = slugs.map((slug) => ({
  slug,
  before: measure(baseline, slug),
  after: measure(candidate, slug),
}))
const status = (result: ReturnType<typeof measure>) =>
  result.result ? 'complete' : result.summary ? 'failed' : 'pending'
const change = (before: number, after: number) => `${before} → ${after}`
const lines = [
  '# Multilingual research comparison',
  '',
  'Common source responses are replayed when an exact baseline request recording exists. New requests are live. Replayed timings are not a production latency comparison. Source counts and ancestry-stage counts are inventories, not independent quality scores.',
  '',
  '| Language | Word | Output | HTTP attempts | Source pages | Histories | Ancestry stages | Exa calls |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
]
for (const { before, after } of paired) {
  lines.push(
    `| ${before.summary?.language} | ${before.summary?.word} | ${status(before)} → ${status(after)} | ${change(before.sourceAttempts, after.sourceAttempts)} | ${change(before.pages.size, after.pages.size)} | ${change(before.histories, after.histories)} | ${change(before.stages.size, after.stages.size)} | ${after.exaCalls} |`
  )
}
lines.push('', '## Measured usage', '')
for (const side of ['before', 'after'] as const) {
  const samples = paired.map((pair) => pair[side])
  const total = (field: string) =>
    samples.reduce((sum, sample) => sum + Number(sample.summary?.[field] ?? 0), 0)
  const models = new Set(
    samples.flatMap((sample) =>
      ((sample.summary?.requests ?? []) as Json[]).flatMap((request) =>
        typeof request.model === 'string' ? [request.model] : []
      )
    )
  )
  lines.push(
    `- ${side === 'before' ? 'Baseline' : 'Candidate'}: ${samples.filter((sample) => sample.result).length}/${samples.length} complete outputs; $${total('reportedCostUSD').toFixed(5)} reported LLM cost; $${total('accountedUSD').toFixed(5)} including conservative unknown-call allowances; ${total('unsettledCalls')} unsettled calls. Models: ${[...models].join(', ') || 'unavailable'}.`
  )
}
lines.push(
  '- Exa usage is accounted separately by the isolated Redis budget; it is not included in these LLM amounts.'
)
lines.push('', '## Source and output review', '')
for (const { before, after } of paired) {
  const added = [...after.pages.keys()].filter((url) => !before.pages.has(url))
  const extraStages = [...after.stages].filter((stage) => !before.stages.has(stage))
  lines.push(`### ${before.summary?.language}: ${before.summary?.word}`, '')
  lines.push(
    `- Output: ${status(before)} → ${status(after)}; source failures: ${change(before.degradedRequests, after.degradedRequests)}; replayed candidate requests: ${after.replayedRequests}.`
  )
  lines.push(
    `- Extracted characters: ${change(before.sourceChars, after.sourceChars)}; synthesis input tokens: ${before.inputTokens ?? 'unavailable'} → ${after.inputTokens ?? 'unavailable'}.`
  )
  if (added.length)
    lines.push(
      `- Additional source pages: ${added.map((url) => `[${new URL(url).hostname}](${url})`).join(', ')}.`
    )
  if (extraStages.length)
    lines.push(`- Newly rendered ancestry stages to review: ${extraStages.join('; ')}.`)
  if (before.summary?.error) lines.push(`- Baseline error: ${before.summary.error}`)
  if (after.summary?.error) lines.push(`- Candidate error: ${after.summary.error}`)
  lines.push('')
}
const output = resolve(values.output)
writeFileSync(output, lines.join('\n'))
writeFileSync(
  output.replace(/\.md$/, '.json'),
  JSON.stringify(
    paired,
    (_key, value) =>
      value instanceof Map ? Object.fromEntries(value) : value instanceof Set ? [...value] : value,
    2
  )
)
console.log(
  JSON.stringify({
    words: paired.length,
    baselineComplete: paired.filter((p) => p.before.result).length,
    candidateComplete: paired.filter((p) => p.after.result).length,
    output,
  })
)
