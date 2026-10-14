import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

// Fixed cached-entry snapshots; this server never connects to a real Redis or provider.
const records = new Map(
  Object.entries(JSON.parse(readFileSync(new URL('./entries.json', import.meta.url))))
)
const base = records.get('etymology:v2.5:nice')
for (const word of ['muscle', 'window', 'telephone', 'bread', 'harvest', 'quarantine']) {
  records.set(`etymology:v2.5:${word}`, { ...base, word })
}
const letters = 'abcdefghijklmnopqrstuvwxyz'
for (let i = 0; records.size < 1000; i++) {
  const word =
    letters[i % 26] + letters[Math.floor(i / 26) % 26] + letters[Math.floor(i / 676) % 26] + 'word'
  records.set(`etymology:v2.5:${word}`, { ...base, word })
}
const stats = { get: 0, scan: 0, other: 0 }
const command = ([name, ...args]) => {
  name = name.toLowerCase()
  if (name === 'get') {
    stats.get++
    return { result: records.has(args[0]) ? JSON.stringify(records.get(args[0])) : null }
  }
  if (name === 'scan') {
    stats.scan++
    return { result: ['0', [...records.keys()]] }
  }
  stats.other++
  if (name === 'incr' || name === 'incrbyfloat' || name === 'exists') return { result: 0 }
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
  res.end(JSON.stringify(Array.isArray(data[0]) ? data.map(command) : command(data)))
}).listen(4198, '127.0.0.1', () => console.log('Fixture Redis listening on 4198 (100ms latency)'))
