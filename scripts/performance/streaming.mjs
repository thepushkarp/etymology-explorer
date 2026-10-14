import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'

const { values } = parseArgs({
  options: { label: { type: 'string' }, held: { type: 'boolean', default: false } },
})
if (!values.label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.label))
  throw new Error('Pass a path-safe --label')
const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4199'
const records = JSON.parse(readFileSync(new URL('./entries.json', import.meta.url), 'utf8'))
const result = structuredClone(records['etymology:beta:v7:fr:fenêtre'])
result.word = 'streamfixture'
result.definition = { en: 'English definition.', local: 'Une définition en français.' }
result.lore = { en: 'English story.', local: 'Cette histoire complète est déjà vérifiée.' }
Object.assign(result.histories[0], { definition: result.definition, lore: result.lore })

// The provider/transport boundary is controlled; linguistic validation is covered
// by lib/llm.test.ts. These synthetic entries exercise localization and rendering.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.__traces = 0
    window.EventSource = class extends EventTarget {
      constructor() {
        super()
        window.__traces++
        window.__stream = this
      }
      send(event) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }))
      }
      close() {}
    }
    const fetch = window.fetch
    window.fetch = (url, init) =>
      String(url).startsWith('/api/ngram')
        ? Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 404 }))
        : fetch(url, init)
  })
  await page.goto(`${base}/word/fr/${result.word}`)
  await page.getByRole('button', { name: 'Trace its origins' }).waitFor()
  assert.equal(await page.evaluate(() => window.__traces), 0)
  await page.getByRole('button', { name: 'Trace its origins' }).click()
  await page.waitForFunction(() => Boolean(window.__stream))
  await page.evaluate((entry) => {
    const start = performance.now()
    const observer = new MutationObserver(() => {
      if (document.querySelector('#entry-story')?.textContent.includes(entry.lore.local)) {
        window.__storyMs = performance.now() - start
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    window.__stream.send({ type: 'synthesis_started' })
    for (const section of [
      'word',
      'pronunciation',
      'definition',
      'ancestryGraph',
      'roots',
      'lore',
      'partsOfSpeech',
    ]) {
      window.__stream.send({ type: 'synthesis_section', section, data: entry[section] })
    }
    setTimeout(() => {
      window.__stream.send({ type: 'result', data: entry })
    }, 1500)
  }, result)
  await page.waitForTimeout(300)
  assert.equal(await page.locator('article').getAttribute('aria-busy'), 'true')
  const partialStory = (await page.locator('#entry-story').textContent()).includes(
    result.lore.local
  )
  assert.equal(partialStory, !values.held)
  assert.equal((await page.locator('[data-tree-node]').count()) > 0, !values.held)
  assert.ok(!(await page.locator('article').textContent()).includes(result.lore.en))
  await page.waitForFunction(
    () => document.querySelector('article')?.getAttribute('aria-busy') === 'false'
  )
  assert.ok((await page.locator('#entry-story').textContent()).includes(result.lore.local))
  assert.ok((await page.locator('#entry-ancestry').textContent()).includes('Modern French'))
  assert.equal(await page.evaluate(() => window.__traces), 1)
  assert.deepEqual(errors, [])
  const summary = {
    partialStoryVisible: partialStory,
    storyMs: await page.evaluate(() => window.__storyMs),
    terminalDelayMs: 1500,
  }
  mkdirSync('bench-results/research-performance', { recursive: true })
  writeFileSync(
    `bench-results/research-performance/${values.label}.json`,
    JSON.stringify(summary, null, 2)
  )
  console.log(summary)
} finally {
  await browser.close()
}
