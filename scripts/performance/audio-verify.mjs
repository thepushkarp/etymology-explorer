import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4199'
if (!process.env.AUDIO_PERF_FIXTURE) throw new Error('Set AUDIO_PERF_FIXTURE to the server MP3')
const expected = readFileSync(process.env.AUDIO_PERF_FIXTURE)
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const request = (word, language = 'en') =>
  fetch(`${base}/api/pronunciation?word=${word}&language=${language}`)
const readKey = async (key) => {
  const response = await fetch('http://127.0.0.1:4198', {
    method: 'POST',
    body: JSON.stringify(['get', key]),
  })
  const { result } = await response.json()
  return result === null ? null : JSON.parse(result)
}

const failed = await request('audiofailure')
assert.equal(failed.status, 503)
assert.ok((await failed.json()).error.includes('Fixture unavailable'))
assert.equal(await readKey('audio:v2:audiofailure'), null)
assert.equal(await readKey('lock:audio:en:audiofailure'), null)
const retry = await request('audiofailure')
assert.equal(retry.status, 200)
assert.deepEqual(Buffer.from(await retry.arrayBuffer()), expected)

const broken = await request('audiobroken')
assert.equal(broken.status, 500)
assert.equal((await broken.json()).success, false)
await pause(500)
assert.equal(await readKey('audio:v2:audiobroken'), null)
assert.equal(await readKey('lock:audio:en:audiobroken'), null)
const retried = await request('audiobroken')
assert.equal(retried.headers.get('x-cache'), 'MISS')
assert.deepEqual(Buffer.from(await retried.arrayBuffer()), expected)

await assert.rejects(() =>
  fetch(`${base}/api/pronunciation?word=audiocancel&language=en`, {
    signal: AbortSignal.timeout(500),
  })
)
await pause(1800)
const completed = await request('audiocancel')
assert.equal(completed.headers.get('x-cache'), 'HIT')
assert.deepEqual(Buffer.from(await completed.arrayBuffer()), expected)

for (const language of ['en', 'fr']) {
  const response = await request('audiolanguage', language)
  assert.equal(response.headers.get('x-cache'), 'MISS')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected)
}
await pause(500)
assert.equal(await readKey('audio:v2:audiolanguage'), expected.toString('base64'))
assert.equal(await readKey('audio:v2:fr:audiolanguage'), expected.toString('base64'))
assert.equal((await request('invalid123')).status, 400)

const costKey = `cost:usd:${new Date().toISOString().slice(0, 7)}`
await fetch('http://127.0.0.1:4198', {
  method: 'POST',
  body: JSON.stringify(['set', costKey, 999999]),
})
try {
  const limited = await request('audiobudget')
  assert.equal(limited.status, 503)
  assert.equal(limited.headers.get('x-protection-mode'), 'cache_only')
  assert.equal(await readKey('lock:audio:en:audiobudget'), null)
  const cached = await request('audiolanguage')
  assert.equal(cached.headers.get('x-cache'), 'HIT')
  assert.deepEqual(Buffer.from(await cached.arrayBuffer()), expected)
} finally {
  await fetch('http://127.0.0.1:4198', {
    method: 'POST',
    body: JSON.stringify(['set', costKey, 0]),
  })
}
console.log(
  'Audio verification passed: complete cached bytes, language isolation, provider failure, interrupted-stream retry, disconnect completion, validation, budget guard'
)
