import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
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
  await page.setViewportSize({ width: 1280, height: 480 })
  const camera = page.getByRole('link', { name: /camera movement/i })
  await camera.evaluate((link) => link.scrollIntoView({ block: 'start' }))
  const selectionScroll = await page.evaluate(() => window.scrollY)
  assert.ok(selectionScroll > 0)
  await camera.click()
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - selectionScroll) < 2)
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
      lore: 'A fixture story with enough text to scroll before following a related word. '.repeat(
        80
      ),
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
          suggestions: { seeAlso: ['pain'] },
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
  await page.goBack()
  const related = page.locator('#entry-related').getByRole('link', { name: 'pain', exact: true })
  await related.scrollIntoViewIfNeeded()
  assert.ok((await page.evaluate(() => window.scrollY)) > 500)
  await related.click()
  await page.waitForURL(`${base}/word/pain`)
  await page.waitForFunction(() => {
    const heading = document.querySelector('main h1')?.getBoundingClientRect()
    return heading && heading.top >= 0 && heading.bottom <= window.innerHeight
  })
  console.log(
    'Passed: language/IPA audio identity, history source filtering, Back/Forward restoration, same-entry scroll preservation, related-word scroll reset, and no passive research.'
  )
} finally {
  await browser.close()
}
