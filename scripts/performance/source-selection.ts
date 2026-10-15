import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { conductAgenticResearch } from '@/lib/research'
import type { ResearchContext } from '@/lib/types'
delete process.env.ETYMOLOGY_KV_REST_API_URL
delete process.env.ETYMOLOGY_KV_REST_API_TOKEN
const { values } = parseArgs({
  options: {
    label: { type: 'string' },
    'main-page': { type: 'string' },
    'root-page': { type: 'string' },
  },
})
const label = values.label
if (!label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label))
  throw new Error('Pass a path-safe --label')
const page = (word: string, lang: string, text: string) =>
  JSON.stringify({
    parse: {
      title: word,
      text: `<h2 id="L">${lang}</h2><h3 id="Etymology">Etymology</h3><p>${text}</p>`,
      tocdata: {
        sections: [
          { index: '1', line: lang, anchor: 'L', hLevel: 2, number: '1' },
          { index: '2', line: 'Etymology', anchor: 'Etymology', hLevel: 3, number: '1.1' },
        ],
      },
    },
  })
const main = values['main-page']
  ? readFileSync(values['main-page'], 'utf8')
  : page('polarize', 'English', 'Equivalent to polar + -ize.')
const polar = values['root-page']
  ? readFileSync(values['root-page'], 'utf8')
  : page('polar', 'English', 'Borrowed from Late Latin polāris.')
mkdirSync('bench-results/research-performance', { recursive: true })
const original = globalThis.fetch,
  rows: Array<{
    scenario: string
    run: number
    ms: number
    requests: string[]
    context: ResearchContext
  }> = []
try {
  for (const scenario of ['en-complete', 'en-transient-root', 'fr-complete', 'fr-fallback'])
    for (let run = 0; run < 3; run++) {
      let polarAttempts = 0
      const requests: string[] = []
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = new URL(String(input))
        requests.push(url.href)
        if (url.hostname === 'openrouter.ai') throw new Error('No model calls allowed')
        await Bun.sleep(20)
        if (url.hostname === 'api.dictionaryapi.dev') {
          await Bun.sleep(280)
          return new Response('', { status: 504 })
        }
        if (url.hostname === 'freedictionaryapi.com') {
          await Bun.sleep(280)
          return Response.json({
            word: 'fixture',
            entries: [
              {
                word: 'fixture',
                language: { code: 'fr' },
                senses: [{ definition: 'A test entry.' }],
              },
            ],
          })
        }
        if (url.hostname.endsWith('wiktionary.org')) {
          const word = url.searchParams.get('page')
          if (scenario.startsWith('en')) {
            if (word === 'polarize') return new Response(main)
            if (word === 'polar') {
              polarAttempts++
              if (scenario === 'en-transient-root' && polarAttempts === 1)
                throw new Error('Request timeout after 5000ms')
              return new Response(polar)
            }
            if (word === '-ize')
              return new Response(page('-ize', 'English', 'From Ancient Greek -ίζω.'))
          } else if (scenario === 'fr-complete' && word === 'fixture')
            return new Response(page('fixture', 'Français', 'Origine inconnue.'))
        }
        return new Response('', { status: 404 })
      }) as typeof fetch
      const start = performance.now()
      const context = await conductAgenticResearch(
        scenario.startsWith('en') ? 'polarize' : 'fixture',
        { language: scenario.startsWith('en') ? 'en' : 'fr' }
      )
      rows.push({ scenario, run, ms: performance.now() - start, requests, context })
    }
  writeFileSync(`bench-results/research-performance/${label}.json`, JSON.stringify(rows, null, 2))
  console.log(
    rows.map(({ scenario, ms, context }) => ({
      scenario,
      ms,
      attempts: context.totalSourcesFetched,
      roots: context.rootResearch.map((r) => ({
        root: r.root,
        usable: !!(r.wiktionaryData || r.etymonlineData),
      })),
    }))
  )
} finally {
  globalThis.fetch = original
}
