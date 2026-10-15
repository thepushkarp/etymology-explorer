/** Paired live generation over frozen research; records latency, tokens, cost and structural parity. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import assert from 'node:assert/strict'

const { values } = parseArgs({
  options: {
    context: { type: 'string' },
    label: { type: 'string' },
    runs: { type: 'string', default: '3' },
    'compare-routing': { type: 'boolean', default: false },
  },
})
if (!values.context || !values.label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.label))
  throw new Error('Pass --context and a path-safe --label')
const runs = Number(values.runs)
if (!Number.isInteger(runs) || runs < 1 || runs > 3) throw new Error('--runs must be 1..3')
const variants: string[] = values['compare-routing']
  ? ['default', 'latency']
  : ['legacy', 'compact']
interface Measurement {
  run: number
  variant: string
  synthesisMs: number
  firstContentMs: number
  inputTokens: number
  outputTokens: number
  costUSD: number
  identities: Array<{ id: string; scopes: string[] }>
  sources: Array<{ name: string; url?: string }>
}
const rows: Measurement[] = []
for (let run = 0; run < runs; run++) {
  for (const variant of run % 2 ? [...variants].reverse() : variants) {
    const label: string = `${values.label}-${run}-${variant}`
    const child = Bun.spawn(
      [
        process.execPath,
        'scripts/performance/pipeline.ts',
        '--label',
        label,
        '--context',
        values.context,
        ...(variant === 'compact' || values['compare-routing'] ? ['--compact-output'] : []),
        ...(variant === 'latency' ? ['--latency-routing'] : []),
      ],
      { stdout: 'pipe', stderr: 'pipe' }
    )
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    writeFileSync(join('bench-results', `${label}.log`), stdout + stderr)
    if (status !== 0) throw new Error(`Generation comparison failed for ${label}; see its log`)
    const directory = join('bench-results', 'research-performance', label)
    const summary = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'))
    const result = JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'))
    const firstContentMs = summary.sections.find(
      (s: { section: string }) => s.section === 'definition'
    )?.elapsedMs
    assert.equal(typeof firstContentMs, 'number', `${label}: no validated definition section`)
    rows.push({
      run,
      variant,
      synthesisMs: summary.synthesisMs,
      firstContentMs,
      inputTokens: summary.usage.inputTokens,
      outputTokens: summary.usage.outputTokens,
      costUSD: summary.costUSD,
      identities: result.histories.map((h: { id: string; evidenceScopeIds: string[] }) => ({
        id: h.id,
        scopes: h.evidenceScopeIds,
      })),
      sources: result.sources.map((s: { name: string; url?: string }) => ({
        name: s.name,
        url: s.url,
      })),
    })
    assert.deepEqual(rows.at(-1)?.identities, rows[0].identities)
    assert.deepEqual(rows.at(-1)?.sources, rows[0].sources)
    console.log(rows.at(-1))
  }
}
const median = (list: number[]) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)]
const summary = Object.fromEntries(
  variants.map((variant) => {
    const group = rows.filter((r) => r.variant === variant)
    return [
      variant,
      {
        synthesisMs: median(group.map((r) => r.synthesisMs)),
        firstContentMs: median(group.map((r) => r.firstContentMs)),
        outputTokens: median(group.map((r) => r.outputTokens)),
        costUSD: median(group.map((r) => r.costUSD)),
      },
    ]
  })
)
mkdirSync('bench-results/research-performance', { recursive: true })
writeFileSync(
  join('bench-results/research-performance', `${values.label}.json`),
  JSON.stringify({ rows, summary }, null, 2)
)
console.log(summary)
