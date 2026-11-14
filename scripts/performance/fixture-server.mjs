import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { journeyEntries } from './journey-fixtures.mjs'

// Local cache/lock state; this server never connects to a real Redis or provider.
const records = new Map()
for (const result of Object.values(
  JSON.parse(readFileSync(new URL('./entries.json', import.meta.url)))
)) {
  const key = `entry:v1:${result.word}`
  const entry = records.get(key) ?? {
    word: result.word,
    languages: [],
    entries: {},
    otherLanguages: [],
    tracedAt: new Date().toISOString(),
    revision: 1,
  }
  entry.languages.push(result.language)
  entry.entries[result.language] = result
  records.set(key, entry)
}
const chat = {
  word: 'chat',
  languages: ['en', 'it', 'es', 'fr', 'pt'],
  entries: {},
  otherLanguages: ['Dutch', 'Tagalog'],
  tracedAt: new Date().toISOString(),
  revision: 1,
}
for (const language of chat.languages) {
  const result = structuredClone(records.get('entry:v1:nice').entries.en)
  Object.assign(result, {
    word: chat.word,
    language,
    definition: `A synthetic ${language} headword.`,
    lore: `The ${language} history has independent scoped evidence.`,
  })
  for (const history of result.histories)
    Object.assign(history, { definition: result.definition, lore: result.lore })
  chat.entries[language] = result
}
records.set('entry:v1:chat', chat)
if (process.env.PERF_JOURNEYS === 'true') {
  for (const entry of journeyEntries) records.set(`entry:v1:${entry.word}`, entry)
}
records.get('entry:v1:nice').revision = 0
const base = records.get('entry:v1:nice')
for (const word of ['muscle', 'window', 'telephone', 'bread', 'harvest', 'quarantine']) {
  records.set(`entry:v1:${word}`, { ...base, word, entries: { en: { ...base.entries.en, word } } })
}
const letters = 'abcdefghijklmnopqrstuvwxyz'
for (let i = 0; records.size < 1000; i++) {
  const word =
    letters[i % 26] + letters[Math.floor(i / 26) % 26] + letters[Math.floor(i / 676) % 26] + 'word'
  records.set(`entry:v1:${word}`, { ...base, word, entries: { en: { ...base.entries.en, word } } })
}
const stats = { get: 0, scan: 0, other: 0 }
const encode = (value) =>
  typeof value === 'string'
    ? Buffer.from(value).toString('base64')
    : Array.isArray(value)
      ? value.map(encode)
      : value
const command = ([name, ...args]) => {
  name = name.toLowerCase()
  if (name === 'get') {
    stats.get++
    return { result: records.has(args[0]) ? JSON.stringify(records.get(args[0])) : null }
  }
  if (name === 'scan') {
    stats.scan++
    const matchIndex = args.findIndex((arg) => String(arg).toLowerCase() === 'match')
    const pattern = matchIndex >= 0 ? String(args[matchIndex + 1]) : '*'
    const prefix = pattern.replace(/\*$/, '')
    return { result: ['0', [...records.keys()].filter((key) => key.startsWith(prefix))] }
  }
  stats.other++
  if (name === 'set') {
    if (args.some((arg) => String(arg).toLowerCase() === 'nx') && records.has(args[0]))
      return { result: null }
    records.set(args[0], args[1])
    return { result: 'OK' }
  }
  if (name === 'eval' && String(args[2]).startsWith('recent-searches:')) {
    const entry = JSON.parse(args[3])
    const previous = records.get(args[2]) ?? []
    const next = [entry, ...previous.filter((candidate) => candidate.word !== entry.word)].slice(
      0,
      Number(args[4])
    )
    records.set(args[2], next)
    return { result: next.length }
  }
  if (name === 'del') return { result: Number(records.delete(args[0])) }
  if (name === 'expire' || name === 'exists') return { result: Number(records.has(args[0])) }
  if (name === 'incr' || name === 'incrbyfloat') return { result: 0 }
  throw new Error(`Performance fixture does not implement Redis command: ${name}`)
}
createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(stats))
    return
  }
  let body = ''
  for await (const chunk of req) body += chunk
  const data = JSON.parse(body)
  await new Promise((resolve) => setTimeout(resolve, 100))
  res.setHeader('Content-Type', 'application/json')
  const execute = (input) => {
    const { result } = command(input)
    // The SDK requests base64 REST responses, including numeric GET values.
    return { result: req.headers['upstash-encoding'] === 'base64' ? encode(result) : result }
  }
  res.end(JSON.stringify(Array.isArray(data[0]) ? data.map(execute) : execute(data)))
}).listen(4198, '127.0.0.1', () => console.log('Fixture Redis listening on 4198 (100ms latency)'))
