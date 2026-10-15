import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

const label = process.argv[2]
if (!label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) throw new Error('Pass a path-safe label')
const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4199'
const rows = []
for (const word of ['audioalpha', 'audiobeta', 'audiogamma']) {
  const measure = async () => {
    const start = performance.now()
    const response = await fetch(`${base}/api/pronunciation?word=${word}&language=en`)
    assert.equal(response.status, 200)
    const headersMs = performance.now() - start
    const body = Buffer.from(await response.arrayBuffer())
    return {
      headersMs,
      completeMs: performance.now() - start,
      cache: response.headers.get('x-cache'),
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
    }
  }
  const owner = measure()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const waiter = measure()
  const [first, second] = await Promise.all([owner, waiter])
  assert.equal(first.cache, 'MISS')
  assert.equal(second.cache, 'HIT')
  assert.equal(first.sha256, second.sha256)
  rows.push({ word, owner: first, waiter: second })
}
mkdirSync('bench-results/audio-performance', { recursive: true })
writeFileSync(`bench-results/audio-performance/${label}.json`, JSON.stringify(rows, null, 2))
console.log(rows)
