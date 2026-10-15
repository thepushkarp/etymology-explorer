/** Deterministic slow-provider replay with real source adapters and parsing. No network calls. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { conductAgenticResearch } from '@/lib/research'

const label = process.argv[2]
if (!label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) throw new Error('Pass a path-safe label')
delete process.env.ETYMOLOGY_KV_REST_API_URL
delete process.env.ETYMOLOGY_KV_REST_API_TOKEN
process.env.OPENROUTER_API_KEY ??= 'benchmark'
const rows = []
for (let run = 0; run < 3; run++) {
  const requests: string[] = []
  const started = performance.now()
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push(url.href)
    const word = url.searchParams.get('page') ?? 'nexal'
    const rootCall = url.hostname === 'openrouter.ai'
    const ancestor = word === 'nexus'
    await new Promise((resolve) => setTimeout(resolve, rootCall ? 300 : ancestor ? 200 : 30))
    if (rootCall)
      return Response.json({
        status: 'completed',
        output_text: '{"roots":["nexal"]}',
        usage: { input_tokens: 100, output_tokens: 10, cost: 0.001 },
      })
    if (url.hostname.includes('etymonline'))
      return new Response('<section class="prose-lg">1590s, from Latin nexus, a binding.</section>')
    if (url.hostname.includes('wiktionary')) {
      const language = ancestor ? 'Latin' : 'English'
      return Response.json({
        parse: {
          title: word,
          text: `<h2 id="${language}">${language}</h2><h3 id="Etymology">Etymology</h3><p>${ancestor ? 'A binding or connection.' : 'From Latin nexus (“a binding”).'}</p><h3 id="Noun">Noun</h3><p>${word}</p>`,
          tocdata: {
            sections: [
              { index: '1', line: language, anchor: language, level: '2', number: '1' },
              { index: '2', line: 'Etymology', anchor: 'Etymology', level: '3', number: '1.1' },
              { index: '3', line: 'Noun', anchor: 'Noun', level: '3', number: '1.2' },
            ],
          },
        },
      })
    }
    if (url.hostname.includes('wikipedia'))
      return Response.json({
        query: {
          pages: [
            {
              ns: 0,
              title: 'Nexal',
              extract: 'Supplemental encyclopedia context retained in full.',
            },
          ],
        },
      })
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  const context = await conductAgenticResearch('nexal')
  rows.push({
    elapsedMs: performance.now() - started,
    sourceAttempts: context.totalSourcesFetched,
    requests,
    context,
  })
}
mkdirSync('bench-results/research-performance', { recursive: true })
writeFileSync(`bench-results/research-performance/${label}.json`, JSON.stringify(rows, null, 2))
console.log(
  rows.map(({ elapsedMs, sourceAttempts, requests }) => ({
    elapsedMs,
    sourceAttempts,
    requests: requests.length,
  }))
)
