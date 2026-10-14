/** Replays the same provider bytes through baseline and candidate production synthesis. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { getLlmUsageFromError, synthesizeFromResearch } from '@/lib/llm'
import { safeError } from '@/lib/errorUtils'
import type { EtymologyResult, ResearchContext } from '@/lib/types'

const { values } = parseArgs({
  options: {
    recording: { type: 'string' },
    'baseline-module': { type: 'string' },
    sample: { type: 'string' },
    realtime: { type: 'boolean', default: false },
  },
})
if (!values.recording || !values['baseline-module'])
  throw new Error('Pass --recording and --baseline-module pointing to the frozen baseline')
delete process.env.ETYMOLOGY_KV_REST_API_URL
delete process.env.ETYMOLOGY_KV_REST_API_TOKEN
const baseline: { synthesizeFromResearch: typeof synthesizeFromResearch } = await import(
  resolve(values['baseline-module'])
)
const context = JSON.parse(
  readFileSync(join(values.recording, 'context.json'), 'utf8')
) as ResearchContext
const summary = JSON.parse(readFileSync(join(values.recording, 'summary.json'), 'utf8'))
const streams = readdirSync(values.recording).filter(
  (name) =>
    name.endsWith('-stream.json') && (!values.sample || name === `${values.sample}-stream.json`)
)
assert.ok(streams.length, 'No recorded provider streams match')
const originalFetch = globalThis.fetch
const rows = []

for (const file of streams) {
  const [runText, variant] = file.split('-')
  const measured = summary.rows.find(
    (row: { run: number; variant: string }) =>
      row.run === Number(runText) && row.variant === variant
  )
  const deltas = JSON.parse(readFileSync(join(values.recording, file), 'utf8')) as Array<{
    elapsedMs: number
    delta: string
  }>
  const text = deltas.map((chunk) => chunk.delta).join('')
  const compare = []
  for (const synthesize of [baseline.synthesizeFromResearch, synthesizeFromResearch]) {
    let clock = 0
    let firstContentMs: number | undefined
    const requests: string[] = []
    const emissions: Array<{ section: string; data: unknown }> = []
    const start = performance.now()
    const response = {
      status: 'completed',
      output_text: text,
      usage: {
        input_tokens: measured.usage?.inputTokens ?? 0,
        output_tokens: measured.usage?.outputTokens ?? 0,
        cost: measured.usage?.costUSD ?? 0,
      },
    }
    const tick = async (elapsedMs: number) => {
      if (values.realtime) await Bun.sleep(Math.max(0, elapsedMs - (performance.now() - start)))
      clock = values.realtime ? performance.now() - start : elapsedMs
    }
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      requests.push(createHash('sha256').update(JSON.stringify(body)).digest('hex'))
      if (!body.stream) return Response.json(response)
      let index = 0
      const encoder = new TextEncoder()
      return new Response(
        new ReadableStream(
          {
            async pull(controller) {
              if (index < deltas.length) {
                const chunk = deltas[index++]
                await tick(chunk.elapsedMs)
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'response.output_text.delta',
                      delta: chunk.delta,
                    })}\n\n`
                  )
                )
              } else {
                await tick(measured.synthesisMs ?? deltas.at(-1)?.elapsedMs ?? 0)
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`
                  )
                )
                controller.close()
              }
            },
          },
          { highWaterMark: 0 }
        ),
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    }) as typeof fetch
    let result: EtymologyResult | undefined
    let error: string | undefined
    let failedUsage: unknown
    try {
      result = (
        await synthesize(structuredClone(context), {
          onSection(section, data) {
            if (section === 'definition') firstContentMs ??= clock
            emissions.push({ section, data })
          },
        })
      ).result
      for (const section of [
        'pronunciation',
        'definition',
        'ancestryGraph',
        'roots',
        'lore',
        'partsOfSpeech',
      ]) {
        const emitted = emissions.filter((event) => event.section === section)
        const expected: unknown = (result as unknown as Record<string, unknown>)[section]
        assert.equal(emitted.length, expected === undefined ? 0 : 1)
        if (emitted.length) assert.deepEqual(emitted[0].data, expected)
      }
    } catch (failure) {
      if (result) throw failure
      error = safeError(failure)
      failedUsage = getLlmUsageFromError(failure)
    } finally {
      globalThis.fetch = originalFetch
    }
    compare.push({ result, error, failedUsage, requests, firstContentMs })
  }
  const [before, after] = compare
  assert.deepEqual(after.result, before.result, `${file}: terminal content must be identical`)
  assert.equal(after.error, before.error, `${file}: validation outcome must be identical`)
  assert.deepEqual(
    after.failedUsage,
    before.failedUsage,
    `${file}: failure billing must be identical`
  )
  assert.deepEqual(after.requests, before.requests, `${file}: provider requests must be identical`)
  rows.push({
    file,
    valid: Boolean(after.result),
    error: after.error,
    beforeMs: before.firstContentMs,
    afterMs: after.firstContentMs,
    terminalHash: after.result
      ? createHash('sha256').update(JSON.stringify(after.result)).digest('hex')
      : undefined,
    requests: after.requests.length,
  })
}
const output = values.realtime ? 'history-replay-realtime.json' : 'history-replay.json'
writeFileSync(join(values.recording, output), JSON.stringify(rows, null, 2))
console.log(rows)
