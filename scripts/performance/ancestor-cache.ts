/** Replay recorded research through real adapters, with local Redis and HTTP boundaries. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildResearchPrompt, conductAgenticResearch } from '@/lib/research'
import { isLanguageCode } from '@/lib/languages'
import type { ResearchContext } from '@/lib/types'

const { values } = parseArgs({
  options: { recording: { type: 'string' }, label: { type: 'string' } },
})
if (!values.recording || !values.label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.label))
  throw new Error('Pass --recording with a pipeline recording directory and a path-safe --label')
const summary = JSON.parse(readFileSync(join(values.recording, 'summary.json'), 'utf8'))
const { word, language } = summary
if (typeof word !== 'string' || !isLanguageCode(language))
  throw new Error('Recording must contain a successful word and language')
const responses = new Map<string, { body: string; status: number }>()
for (const request of summary.requests) {
  if (!request.bodyFile) continue
  responses.set(request.url, {
    body: readFileSync(join(values.recording, request.bodyFile), 'utf8'),
    status: request.status,
  })
}

// Dummy credentials and a fetch-only Redis boundary keep every write local.
const redisUrl = 'https://source-cache.benchmark.invalid'
process.env.ETYMOLOGY_KV_REST_API_URL = redisUrl
process.env.ETYMOLOGY_KV_REST_API_TOKEN = 'benchmark'
const records = new Map<string, unknown>()
const pending = new Set<Promise<Response>>()
const rows: Array<{
  run: number
  phase: string
  elapsedMs: number
  sourceRequests: string[]
  redisRequests: number
  promptHash: string
  evidence: ResearchContext
}> = []
const originalFetch = globalThis.fetch
let sourceRequests: string[] = []
let redisRequests = 0
const unrecordedRequests: string[] = []
const encode = (value: unknown): unknown =>
  typeof value === 'string'
    ? Buffer.from(value).toString('base64')
    : Array.isArray(value)
      ? value.map(encode)
      : value
const execute = ([command, key, value]: unknown[]) => {
  if (command === 'get') return { result: records.get(String(key)) ?? null }
  if (command === 'set') {
    records.set(String(key), value)
    return { result: 'OK' }
  }
  throw new Error(`Unexpected fixture Redis command: ${command}`)
}

globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const response = (async () => {
    if (url.origin === redisUrl) {
      redisRequests++
      await Bun.sleep(100)
      const commands = JSON.parse(String(init?.body))
      const run = (command: unknown[]) => {
        const { result } = execute(command)
        return {
          result:
            new Headers(init?.headers).get('upstash-encoding') === 'base64'
              ? encode(result)
              : result,
        }
      }
      return Response.json(Array.isArray(commands[0]) ? commands.map(run) : run(commands))
    }
    const recorded = responses.get(url.href)
    if (!recorded) {
      unrecordedRequests.push(url.href)
      throw new Error(`Unrecorded source request: ${url.href}`)
    }
    sourceRequests.push(url.href)
    const ancestor = url.searchParams.has('page') && url.searchParams.get('page') !== word
    await Bun.sleep(ancestor ? 700 : 30)
    return new Response(recorded.body, { status: recorded.status })
  })()
  pending.add(response)
  void response.then(
    () => pending.delete(response),
    () => pending.delete(response)
  )
  return response
}) as typeof fetch

try {
  for (let run = 0; run < 3; run++) {
    records.clear()
    for (const phase of ['cold', 'warm']) {
      sourceRequests = []
      redisRequests = 0
      const start = performance.now()
      // No finished result is read or written: both phases run uncached-result research.
      const context = await conductAgenticResearch(word, { language })
      const elapsedMs = performance.now() - start
      assert.deepEqual(unrecordedRequests, [], 'Recording must cover every research request')
      await Bun.sleep(0)
      while (pending.size) await Promise.all([...pending])
      assert.equal(context.totalSourcesFetched, sourceRequests.length)
      assert.ok(context.totalSourcesFetched <= 16)
      const evidence = { ...context, totalSourcesFetched: 0 }
      const promptHash = createHash('sha256').update(buildResearchPrompt(context)).digest('hex')
      if (rows.length) {
        assert.deepEqual(evidence, rows[0].evidence)
        assert.equal(promptHash, rows[0].promptHash)
      }
      rows.push({ run, phase, elapsedMs, sourceRequests, redisRequests, promptHash, evidence })
    }
  }
} finally {
  globalThis.fetch = originalFetch
}
const median = (samples: number[]) => samples.sort((a, b) => a - b)[1]
const timings = Object.fromEntries(
  ['cold', 'warm'].map((phase) => [
    phase,
    median(rows.filter((row) => row.phase === phase).map((row) => row.elapsedMs)),
  ])
)
mkdirSync('bench-results/research-performance', { recursive: true })
writeFileSync(
  join('bench-results/research-performance', `${values.label}.json`),
  JSON.stringify({ timings, rows }, null, 2)
)
console.log({ timings, samples: rows.map((row) => ({ ...row, evidence: undefined })) })
