import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const label = process.argv[2]
if (!label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) throw new Error('Pass a path-safe label')
const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4199'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})
const rows = []
try {
  for (const word of ['nice', 'muscle', 'window']) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      window.__audioEvents = []
      const Audio = window.Audio
      window.Audio = class extends Audio {
        constructor(src) {
          super(src)
          for (const event of ['loadstart', 'loadeddata', 'canplay', 'playing', 'ended', 'error']) {
            this.addEventListener(event, () =>
              window.__audioEvents.push({ event, time: performance.now() })
            )
          }
        }
      }
    })
    await page.goto(`${base}/word/${word}`)
    const button = page.getByRole('button', { name: `Play pronunciation of ${word}`, exact: true })
    await button.waitFor()
    for (const scenario of ['first', 'repeat']) {
      await button.waitFor({ state: 'visible' })
      await page.waitForFunction(
        () => !document.querySelector('button[aria-label^="Play pronunciation"]').disabled
      )
      const start = await page.evaluate(() => {
        window.__audioEvents = []
        return performance.now()
      })
      await button.click()
      await page.waitForFunction(() =>
        window.__audioEvents.some(({ event }) => event === 'playing' || event === 'error')
      )
      const events = await page.evaluate(() => window.__audioEvents)
      assert.ok(!events.some(({ event }) => event === 'error'))
      rows.push({
        word,
        scenario,
        playingMs: events.find(({ event }) => event === 'playing').time - start,
      })
      await page.waitForFunction(() => window.__audioEvents.some(({ event }) => event === 'ended'))
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
} finally {
  await browser.close()
}
mkdirSync('bench-results/audio-performance', { recursive: true })
writeFileSync(`bench-results/audio-performance/${label}.json`, JSON.stringify(rows, null, 2))
console.log(rows)
