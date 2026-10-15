import { mkdirSync, writeFileSync } from 'node:fs'

const label = process.argv[2] ?? 'server'
const offset = Number(process.argv[3] ?? 200)
if (
  !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label) ||
  !Number.isInteger(offset) ||
  offset < 0 ||
  offset > 980
) {
  throw new Error('Usage: node scripts/performance/server.mjs <label> <fresh offset 0..980>')
}
const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4199'
const letters = 'abcdefghijklmnopqrstuvwxyz'
const rows = []
for (let i = offset; i < offset + 7; i++) {
  const word =
    letters[i % 26] + letters[Math.floor(i / 26) % 26] + letters[Math.floor(i / 676) % 26] + 'word'
  const before = await (await fetch('http://127.0.0.1:4198')).json()
  const start = performance.now()
  const response = await fetch(`${base}/word/${word}`)
  if (!response.ok)
    throw new Error(`Cold word benchmark failed for ${word}: HTTP ${response.status}`)
  const ttfb = performance.now() - start
  await response.text()
  const after = await (await fetch('http://127.0.0.1:4198')).json()
  rows.push({ word, ttfb, redisReads: after.get - before.get })
}
mkdirSync('bench-results/performance', { recursive: true })
writeFileSync(`bench-results/performance/${label}.json`, JSON.stringify(rows, null, 2))
console.log(rows)
