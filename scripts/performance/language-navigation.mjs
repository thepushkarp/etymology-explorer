import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  await context.route('**/api/etymology**', (route) => route.abort())
  await context.route('**/api/ngram**', (route) =>
    route.fulfill({ status: 404, json: { success: false } })
  )
  await context.route('**/api/recent-searches**', (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  )
  await context.addInitScript(() => {
    window.__streams = []
    window.EventSource = class extends EventTarget {
      constructor(url) {
        super()
        this.url = url
        window.__streams.push(this)
      }
      close() {}
      send(event) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }))
      }
    }
  })
  for (const multiple of [false, true]) {
    const page = await context.newPage()
    await page.setViewportSize({ width: multiple ? 390 : 1280, height: 900 })
    const word = multiple ? 'scriptchoicefixture' : 'scriptlinkfixture'
    await page.goto(`${base}/word/${word}`)
    assert.equal(await page.evaluate(() => window.__streams.length), 0)
    await page.getByRole('button', { name: 'Trace its origins', exact: true }).click()
    await page.waitForFunction(() => window.__streams.length === 1)
    assert.equal(
      await page.evaluate(() =>
        new URL(window.__streams[0].url, location.href).searchParams.get('language')
      ),
      null,
      'Manual tracing from an unqualified URL must preserve Auto'
    )
    await page.evaluate(() => {
      window.__streams[0].send({
        type: 'languages_resolved',
        languages: ['en', 'fr'],
        otherLanguages: ['Dutch', 'Indonesian', 'Polish'],
      })
    })
    assert.equal(await page.getByText(/Also a word in/).count(), 0)
    await page.evaluate(
      ({ word, multiple }) => {
        const history = {
          id: 'history:fixture',
          label: 'Fixture',
          entryKind: 'lemma',
          queryNodeId: 'query:fixture',
          lemmaNodeId: 'query:fixture',
          evidenceScopeIds: ['scope:fixture'],
          pronunciation: '',
          definition: 'A language navigation fixture.',
          roots: [],
          ancestryGraph: {
            branches: [{ root: 'fixture', stages: [{ stage: 'Japanese', form: 'fixture' }] }],
          },
          lore: 'Fixture story.',
        }
        const targets = [
          { word: '白', language: 'ja', reading: 'しろ', meaning: 'white' },
          ...(multiple ? [{ word: '城', language: 'ja', reading: 'しろ', meaning: 'castle' }] : []),
        ]
        window.__streams[0].send({
          type: 'result',
          data: {
            word,
            languages: ['en', 'fr'],
            otherLanguages: ['Dutch', 'Indonesian', 'Polish'],
            otherScripts: targets,
            entries: {
              fr: {
                ...history,
                word,
                language: 'fr',
                primaryHistoryId: history.id,
                histories: [{ ...history, definition: 'The French fixture.' }],
                sources: [],
              },
              en: {
                ...history,
                word,
                language: 'en',
                primaryHistoryId: history.id,
                histories: [history],
                sources: [],
              },
            },
            revision: 6,
            tracedAt: new Date().toISOString(),
          },
        })
      },
      { word, multiple }
    )
    const nav = page.getByRole('navigation', { name: `Languages for ${word}` })
    const japanese = nav.getByRole('link', { name: 'Japanese', exact: true })
    await japanese.waitFor()
    assert.equal(await page.getByText('Japanese lookup', { exact: true }).count(), 0)
    assert.equal(await page.getByText(/Also a word in/).count(), 0)
    const english = nav.getByRole('link', { name: 'English', exact: true })
    assert.equal(
      await japanese.evaluate((el) => getComputedStyle(el).fontFamily),
      await english.evaluate((el) => getComputedStyle(el).fontFamily)
    )
    assert.equal(
      await japanese.getAttribute('href'),
      `/word/ja/${encodeURIComponent('白')}${multiple ? `?lookup=${word}` : ''}`
    )
    await nav.getByRole('link', { name: 'French', exact: true }).click()
    await page.waitForURL(new RegExp(`/word/fr/${word}$`))
    await page.getByText('The French fixture.', { exact: true }).waitFor()
    await page.goBack()
    await page.waitForURL(new RegExp(`/word/${word}$`))
    await page.getByText('A language navigation fixture.', { exact: true }).waitFor()
    await page.goForward()
    await page.waitForURL(new RegExp(`/word/fr/${word}$`))
    await page.getByText('The French fixture.', { exact: true }).waitFor()
    await nav.getByRole('link', { name: 'English', exact: true }).click()
    await page.waitForURL(new RegExp(`/word/en/${word}$`))
    await japanese.focus()
    assert.equal(await page.evaluate(() => window.__streams.length), 1)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    )
    await page.screenshot({
      path: `/tmp/etymex-language-navigation-${multiple ? 'choices' : 'single'}.png`,
    })
    await japanese.click()
    await page.waitForURL((url) => url.pathname === `/word/ja/${encodeURIComponent('白')}`)
    await page.getByRole('heading', { name: '白', exact: true }).waitFor()
    await page.close()
  }
  const hinted = await context.newPage()
  await hinted.goto(`${base}/word/ja/manualhintfixture`)
  assert.equal(await hinted.evaluate(() => window.__streams.length), 0)
  await hinted.getByRole('button', { name: 'Trace its origins', exact: true }).click()
  await hinted.waitForFunction(() => window.__streams.length === 1)
  assert.equal(
    await hinted.evaluate(() =>
      new URL(window.__streams[0].url, location.href).searchParams.get('language')
    ),
    'ja',
    'Manual tracing must retain an explicit route language'
  )
  await hinted.close()
  const listed = await context.newPage()
  await listed.goto(`${base}/word/ja/readinglimitfixture`)
  await listed.getByRole('button', { name: 'Trace its origins', exact: true }).click()
  await listed.waitForFunction(() => window.__streams.length === 1)
  await listed.evaluate(() => {
    window.__streams[0].send({
      type: 'lookup_resolution',
      resolution: {
        originalInput: 'readinglimitfixture',
        language: 'ja',
        candidates: [],
        incomplete: true,
        sourceListed: ['箸', '橋'].map((word) => ({
          word,
          language: 'ja',
          relationship: 'romanization',
          sourceUrl: 'https://en.wiktionary.org/wiki/はし',
          provenance: [
            {
              sourceUrl: 'https://en.wiktionary.org/wiki/はし',
              verifiedAt: new Date().toISOString(),
              evidence: 'dictionary reading link',
            },
          ],
        })),
      },
    })
    window.__streams[0].send({
      type: 'error',
      errorType: 'unknown',
      message: 'Choose a Japanese dictionary entry.',
    })
  })
  await listed.getByText('More dictionary entries', { exact: true }).waitFor()
  await listed
    .getByText(
      'These entries are listed by the dictionary but haven’t been checked yet. Choose one to look it up.',
      { exact: true }
    )
    .waitFor()
  const bridge = listed.getByRole('link', { name: '橋', exact: true })
  assert.equal(await bridge.getAttribute('href'), `/word/ja/${encodeURIComponent('橋')}`)
  await bridge.hover()
  await bridge.focus()
  assert.equal(await listed.evaluate(() => window.__streams.length), 1)
  await bridge.click()
  await listed.waitForURL((url) => url.pathname === `/word/ja/${encodeURIComponent('橋')}`)
  await listed.getByRole('heading', { name: '橋', exact: true }).waitFor()
  assert.equal(await listed.getByText('More dictionary entries', { exact: true }).count(), 0)
  const newStreams = await listed.evaluate(() =>
    window.__streams.slice(1).map((stream) => stream.url)
  )
  assert.ok(newStreams.length <= 1)
  for (const url of newStreams) assert.equal(new URL(url, base).searchParams.get('word'), '橋')
  await listed.close()
  console.log(
    'Passed: native-script tabs, first-entry defaults, consistent typography, desktop/mobile layout, hidden unsupported notices, deferred dictionary choices, and no research before choosing a destination.'
  )
} finally {
  await browser.close()
}
