import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4199'
const word = 'pronunciationfixture'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})
try {
  const page = await browser.newPage()
  await page.route(/\/api\/(?:pronunciation|etymology)(?:\?|$)/, (route) => route.abort())
  await page.route('**/api/ngram**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"success":false}' })
  )
  await page.addInitScript(() => {
    window.__audio = []
    window.EventSource = class extends EventTarget {
      constructor() {
        super()
        window.__stream = this
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
        window.__audio.push(this)
      }
      play() {
        this.paused = false
        return new Promise((resolve, reject) => {
          this.resolve = resolve
          this.reject = reject
        })
      }
      pause() {
        this.paused = true
      }
    }
  })
  await page.goto(`${base}/word/${word}`)
  await page.getByRole('button', { name: 'Trace its origins', exact: true }).click()
  await page.evaluate(() => {
    window.__stream.send({
      type: 'languages_resolved',
      languages: ['en', 'fr', 'it'],
      otherLanguages: [],
    })
    for (const language of ['en', 'fr', 'it']) {
      window.__stream.send({ type: 'synthesis_started', language })
      window.__stream.send({
        type: 'synthesis_section',
        language,
        section: 'pronunciation',
        data: '/fixture/',
      })
    }
  })
  const play = page.getByRole('button', {
    name: `Play pronunciation of ${word} /fixture/`,
    exact: true,
  })
  await play.click()
  await page.getByRole('link', { name: 'French', exact: true }).click()
  await play.click()
  await page.getByRole('link', { name: 'Italian', exact: true }).click()
  await play.click()
  await page.evaluate(() => window.__audio[2].resolve())
  await page.evaluate(() => {
    window.__audio[0].reject(new Error('Previous playback aborted'))
    window.__audio[1].resolve()
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  assert.equal(await play.isDisabled(), true)
  await page.keyboard.press('p')
  const audio = await page.evaluate(() =>
    window.__audio.map(({ src, paused }) => ({ src, paused }))
  )
  assert.deepEqual(audio, [
    { src: `/api/pronunciation?word=${word}&language=en&v=4&ipa=fixture`, paused: true },
    { src: `/api/pronunciation?word=${word}&language=fr&v=4&ipa=fixture`, paused: true },
    { src: `/api/pronunciation?word=${word}&language=it&v=4&ipa=fixture`, paused: false },
  ])
  console.log(
    'Late playback completion cannot replace the active language or create duplicate audio.'
  )
} finally {
  await browser.close()
}
