import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})
try {
  const context = await browser.newContext()
  await context.route('**/api/recent-searches**', (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  )
  await context.route('**/api/ngram**', (route) =>
    route.fulfill({ status: 404, json: { success: false } })
  )
  await context.route('**/api/etymology**', (route) => route.abort())
  await context.route('**/api/pronunciation**', (route) => route.abort())
  await context.addInitScript(() => {
    window.__streams = []
    window.__audio = []
    window.EventSource = class extends EventTarget {
      constructor() {
        super()
        window.__streams.push(this)
      }
      send(event) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }))
      }
      close() {}
    }
    window.Audio = class {
      paused = true
      constructor(src) {
        this.src = src
        window.__audio.push(src)
      }
      async play() {
        this.paused = false
      }
      pause() {
        this.paused = true
      }
    }
  })
  const page = await context.newPage()
  await page.goto(`${base}/word/pain`)
  await page.getByRole('button', { name: 'Play pronunciation of pain /peɪn/', exact: true }).click()
  await page.getByRole('link', { name: 'French', exact: true }).click()
  await page.getByRole('button', { name: 'Play pronunciation of pain /pɛ̃/', exact: true }).click()
  const audio = await page.evaluate(() => window.__audio)
  assert.deepEqual(
    audio.map((src) => {
      const query = new URL(src, base).searchParams
      return [query.get('language'), query.get('ipa')]
    }),
    [
      ['en', 'peɪn'],
      ['fr', 'pɛ̃'],
    ]
  )

  await page.goto(`${base}/word/pan`)
  const sources = page.locator('#entry-sources')
  assert.ok((await sources.innerText()).includes('panne'))
  await page.getByRole('link', { name: /camera movement/i }).click()
  assert.ok(!(await sources.innerText()).includes('panne'))
  assert.ok((await sources.innerText()).includes('pan'))
  await page.getByRole('link', { name: 'French', exact: true }).click()
  await page.getByRole('button', { name: 'Play pronunciation of pan /pɑ̃/', exact: true }).click()
  await page.getByRole('link', { name: /camera movement/i }).click()
  await page.getByRole('button', { name: 'Play pronunciation of pan /pan/', exact: true }).click()
  const sameLanguageAudio = await page.evaluate(() => window.__audio.slice(-2))
  assert.deepEqual(
    sameLanguageAudio.map((src) => new URL(src, base).searchParams.get('ipa')),
    ['pɑ̃', 'pan']
  )

  const word = 'navigationfixture'
  await page.goto(`${base}/word/${word}`)
  assert.equal(await page.evaluate(() => window.__streams.length), 0)
  await page.getByRole('button', { name: 'Trace its origins', exact: true }).click()
  await page.waitForFunction(() => window.__streams.length === 1)
  await page.evaluate((word) => {
    const history = {
      id: 'history:fixture',
      label: 'Completed navigation fixture',
      entryKind: 'lemma',
      queryNodeId: 'query:fixture',
      lemmaNodeId: 'query:fixture',
      evidenceScopeIds: ['scope:fixture'],
      pronunciation: '/test/',
      definition: 'A completed navigation fixture.',
      roots: [],
      ancestryGraph: { branches: [] },
      lore: 'A fixture story.',
    }
    const entry = {
      word,
      languages: ['en'],
      otherLanguages: [],
      attemptedLanguages: ['en'],
      entries: {
        en: {
          ...history,
          language: 'en',
          word,
          primaryHistoryId: history.id,
          histories: [history],
          sources: [],
        },
      },
      tracedAt: new Date().toISOString(),
      revision: 6,
    }
    window.__streams[0].send({ type: 'result', data: entry })
  }, word)
  await page.getByText('A completed navigation fixture.', { exact: true }).waitFor()
  await page.getByRole('link', { name: 'EtymEx', exact: true }).click()
  await page.waitForURL(base + '/')
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goBack()
    await page.getByText('A completed navigation fixture.', { exact: true }).waitFor()
    assert.equal(
      await page.getByRole('button', { name: 'Trace its origins', exact: true }).count(),
      0
    )
    assert.equal(await page.evaluate(() => window.__streams.length), 1)
    await page.goForward()
    await page.waitForURL(base + '/')
  }
  console.log(
    'Passed: pain language/IPA audio identity, pan history source filtering, Back/Forward completion restoration, and no passive research.'
  )
} finally {
  await browser.close()
}
