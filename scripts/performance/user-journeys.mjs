import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { journeyEntry } from './journey-fixtures.mjs'

const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3102'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})
const outcomes = []
async function scenario(name, run) {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const errors = []
  await context.route('**/api/etymology**', (route) => route.abort())
  await context.route('**/api/suggestions**', (route) =>
    route.fulfill({ json: { success: true, data: { suggestions: [] } } })
  )
  await context.route('**/api/recent-searches**', (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  )
  await context.route('**/api/ngram**', (route) => route.fulfill({ status: 404, json: {} }))
  await context.addInitScript(() => {
    window.__streams = []
    window.EventSource = class extends EventTarget {
      closed = false
      constructor(url) {
        super()
        this.url = url
        window.__streams.push(this)
      }
      close() {
        this.closed = true
      }
      send(event) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }))
      }
      fail() {
        this.dispatchEvent(new Event('error'))
      }
    }
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text) => {
          window.__shared = text
        },
      },
    })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await run(page, context)
    assert.deepEqual(errors, [])
    outcomes.push({ name, passed: true })
  } catch (error) {
    outcomes.push({ name, passed: false, error: error.message })
    await page.screenshot({ path: `/tmp/etymex-journey-${outcomes.length}.png` })
  } finally {
    await context.close()
  }
}
async function auto(page) {
  await page
    .getByRole('combobox', { name: 'Word language' })
    .getByText('Auto', { exact: true })
    .waitFor()
}
async function search(page, word) {
  await auto(page)
  const input = page.getByRole('combobox', { name: 'Look up a word or expression' })
  await input.fill(word)
  await input.press('Enter')
  await page.waitForURL(`${base}/word/${encodeURIComponent(word)}`)
}
async function streams(page, count) {
  await page.waitForFunction((count) => window.__streams.length === count, count)
}
async function send(page, event, index = -1) {
  await page.evaluate(({ event, index }) => window.__streams.at(index).send(event), {
    event,
    index,
  })
}

try {
  await scenario(
    'All cached matching readings survive beyond four across selection and reload',
    async (page) => {
      const requests = []
      page.on('request', (request) => {
        if (request.url().includes('/api/etymology')) requests.push(request.url())
      })
      await page.goto(`${base}/word/ja/${encodeURIComponent('こう')}`)
      const meanings = page.getByRole('navigation', { name: 'Meanings for こう' })
      await meanings.waitFor()
      assert.equal(await meanings.getByRole('link').count(), 6)
      assert.equal(await meanings.getByRole('link').filter({ hasText: '甲' }).count(), 0)
      await meanings.getByRole('link').filter({ hasText: '光 —' }).click()
      await page.waitForURL(/%E5%85%89/)
      assert.equal(await meanings.getByRole('link').count(), 6)
      await page.reload()
      await meanings.waitFor()
      assert.equal(await meanings.getByRole('link').count(), 6)
      assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), '光')
      assert.deepEqual(requests, [])
      assert.equal(await page.evaluate(() => window.__streams.length), 0)
    }
  )

  await scenario(
    'Explicit searches prepare alternatives; failed choices stay hidden and passive loads spend nothing',
    async (page) => {
      const calls = []
      let ready = false
      await page.route('**/api/lookup-group**', (route) =>
        route.fulfill({
          json: {
            group: {
              reading: 'まむし',
              members: [
                { word: 'まむし', language: 'ja', lookupSupport: 'verified' },
                { word: '推測', language: 'ja', lookupSupport: 'unverified' },
                { word: '城', language: 'ja', lookupSupport: 'linked' },
                { word: '代', language: 'ja', lookupSupport: 'linked' },
                ...['余', '別', '他'].map((word) => ({
                  word,
                  language: 'ja',
                  lookupSupport: 'linked',
                })),
              ],
              languages: [
                { word: 'mamushi', language: 'en' },
                { word: 'まむし', language: 'ja' },
              ],
              choices: [
                { word: 'まむし', language: 'ja', historyId: 'viper', label: 'Viper' },
                ...(ready
                  ? [
                      {
                        word: '代',
                        language: 'ja',
                        historyId: 'substitution',
                        label: '代 — Substitution fixture',
                      },
                    ]
                  : []),
              ],
            },
          },
        })
      )
      await page.route('**/api/etymology**', async (route) => {
        const word = new URL(route.request().url()).searchParams.get('word')
        calls.push(word)
        await new Promise((resolve) => setTimeout(resolve, 150))
        if (word !== '代')
          return route.fulfill({ status: 404, json: { success: false, errorType: 'nonsense' } })
        ready = true
        return route.fulfill({
          json: {
            success: true,
            data: journeyEntry('代', { ja: [['Substitution fixture', '/test/']] }),
          },
        })
      })
      await page.goto(`${base}/word/mamushi`)
      await page.getByRole('link', { name: 'Japanese', exact: true }).waitFor()
      await page.reload()
      assert.deepEqual(calls, [])
      await page.goto(base)
      await search(page, 'mamushi')
      await page.getByText('Checking related entries…', { exact: true }).waitFor()
      await page
        .getByText('Checking related entries…', { exact: true })
        .waitFor({ state: 'hidden' })
      await page.waitForFunction(() => document.querySelector('a[href*="history=viper"]'))
      assert.deepEqual(calls, ['城', '代', '余', '別', '他'])
      assert.equal(await page.getByRole('link').filter({ hasText: '城' }).count(), 0)
      assert.equal(await page.evaluate(() => window.__streams.length), 0)
      await page.reload()
      await page.getByRole('link', { name: 'Japanese', exact: true }).waitFor()
      assert.deepEqual(calls, ['城', '代', '余', '別', '他'])
    }
  )

  await scenario(
    'Single-form Japanese and English tabs survive both directions and direct loads',
    async (page, context) => {
      const bothTabs = async (page) => {
        await page.getByRole('link', { name: 'English', exact: true }).waitFor()
        await page.getByRole('link', { name: 'Japanese', exact: true }).waitFor()
        await auto(page)
      }
      for (const route of [
        '/word/mamushi',
        '/word/en/mamushi',
        `/word/ja/${encodeURIComponent('まむし')}`,
      ]) {
        await page.goto(`${base}${route}`)
        await bothTabs(page)
        await page.getByRole('link', { name: 'Japanese', exact: true }).click()
        await page.getByText('Japanese viper entry (journey fixture).', { exact: true }).waitFor()
        await bothTabs(page)
        const japaneseUrl = page.url()
        await page.reload()
        await bothTabs(page)
        await page.getByRole('link', { name: 'English', exact: true }).click()
        await page.getByText('English viper entry (journey fixture).', { exact: true }).waitFor()
        await bothTabs(page)
        await page.goBack()
        await page.waitForURL(japaneseUrl)
        await bothTabs(page)
        assert.equal(await page.evaluate(() => window.__streams.length), 0)
      }
      const shared = await context.newPage()
      await shared.goto(page.url())
      await bothTabs(shared)
      assert.equal(await shared.evaluate(() => window.__streams.length), 0)
    }
  )

  await scenario(
    'Auto → meaning → audio → related → Back → reload → share',
    async (page, context) => {
      const audio = []
      // A real browser media element decodes a short WAV; no paid TTS request is made.
      const clip = Buffer.alloc(44 + 8000)
      clip.write('RIFF', 0)
      clip.writeUInt32LE(clip.length - 8, 4)
      clip.write('WAVEfmt ', 8)
      clip.writeUInt32LE(16, 16)
      clip.writeUInt16LE(1, 20)
      clip.writeUInt16LE(1, 22)
      clip.writeUInt32LE(8000, 24)
      clip.writeUInt32LE(8000, 28)
      clip.writeUInt16LE(1, 32)
      clip.writeUInt16LE(8, 34)
      clip.write('data', 36)
      clip.writeUInt32LE(8000, 40)
      clip.fill(128, 44)
      await context.route('**/api/pronunciation**', async (route) => {
        audio.push(new URL(route.request().url()).searchParams)
        await route.fulfill({ contentType: 'audio/wav', body: clip })
      })
      await page.goto(base)
      await search(page, 'mole')
      await page.getByRole('link', { name: /Skin mark/ }).click()
      const selectedUrl = page.url()
      const sources = page.locator('#entry-sources')
      assert.deepEqual(
        await sources.locator('a').evaluateAll((links) => links.map((link) => link.href)),
        ['https://example.invalid/mole/en/1']
      )
      const play = page.getByRole('button', {
        name: 'Play pronunciation of mole /məʊl/',
        exact: true,
      })
      await play.click()
      await page.waitForFunction(() => {
        const button = document.querySelector(
          'button[aria-label="Play pronunciation of mole /məʊl/"]'
        )
        return button && !button.disabled
      })
      assert.equal(await play.getAttribute('title'), 'Listen /məʊl/ (p)')
      await page.getByRole('link', { name: 'Spanish', exact: true }).click()
      await page
        .getByRole('button', { name: 'Play pronunciation of mole /ˈmole/', exact: true })
        .click()
      await page.waitForFunction(
        () =>
          !document.querySelector('button[aria-label="Play pronunciation of mole /ˈmole/"]')
            ?.disabled
      )
      assert.deepEqual(
        audio.map((params) => [params.get('language'), params.get('ipa')]),
        [
          ['en', 'məʊl'],
          ['es', 'ˈmole'],
        ]
      )
      await page.goBack()
      await page.waitForURL(selectedUrl)
      await page.getByText('Skin mark (journey fixture).', { exact: true }).waitFor()
      await page
        .locator('#entry-related')
        .getByRole('link', { name: 'journeyrelated', exact: true })
        .click()
      await page.waitForURL(/\/word\/journeyrelated$/)
      await page.goBack()
      await page.waitForURL(selectedUrl)
      await page.reload()
      await page.getByText('Skin mark (journey fixture).', { exact: true }).waitFor()
      await auto(page)
      await page.getByRole('button', { name: 'Share', exact: true }).click()
      await page.getByRole('button', { name: 'Link copied', exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.__shared), selectedUrl)
      const shared = await context.newPage()
      await shared.goto(selectedUrl)
      await shared.getByText('Skin mark (journey fixture).', { exact: true }).waitFor()
      await auto(shared)
      assert.equal(await shared.evaluate(() => window.__streams.length), 0)
      assert.equal(await page.evaluate(() => window.__streams.length), 0)
    }
  )

  await scenario(
    'Auto native-script ambiguity preserves a selected meaning on reload',
    async (page) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(base)
      await search(page, 'あめ')
      await page.getByRole('link', { name: /Candy/ }).click()
      const url = page.url()
      await page.reload()
      await page.getByText('Candy (journey fixture).', { exact: true }).waitFor()
      await auto(page)
      assert.equal(page.url(), url)
      assert.equal(await page.evaluate(() => window.__streams.length), 0)
    }
  )

  await scenario('Slow lookup → navigate away → ignore late completion → revisit', async (page) => {
    await page.goto(base)
    await search(page, 'slowjourney')
    await streams(page, 1)
    assert.equal(
      new URL(await page.evaluate(() => window.__streams[0].url), base).searchParams.has(
        'language'
      ),
      false
    )
    await send(page, { type: 'languages_resolved', languages: ['en', 'es'], otherLanguages: [] })
    await send(page, { type: 'synthesis_started', language: 'en' })
    await send(page, {
      type: 'synthesis_section',
      language: 'en',
      section: 'definition',
      data: 'Partial result while sources are slow.',
    })
    await page.getByText('Partial result while sources are slow.', { exact: true }).waitFor()
    await page.waitForTimeout(1200)
    assert.equal(await page.evaluate(() => window.__streams.length), 1)
    assert.equal(
      await page.getByRole('button', { name: 'Trace its origins', exact: true }).count(),
      0
    )
    await search(page, 'nextjourney')
    await streams(page, 2)
    assert.equal(await page.evaluate(() => window.__streams[0].closed), true)
    await send(
      page,
      {
        type: 'result',
        data: journeyEntry('slowjourney', { en: [['Late obsolete result', '/test/']] }),
      },
      0
    )
    await send(page, {
      type: 'result',
      data: journeyEntry('nextjourney', { en: [['Current result', '/test/']] }),
    })
    await page.getByText('Current result (journey fixture).', { exact: true }).waitFor()
    assert.equal(
      await page.getByText('Late obsolete result (journey fixture).', { exact: true }).count(),
      0
    )
    await page.goBack()
    await page.waitForURL(`${base}/word/slowjourney`)
    await page.getByRole('button', { name: 'Trace its origins', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__streams.length), 2)
  })

  await scenario('Source outage → explicit retry in Auto → success', async (page) => {
    await page.goto(base)
    await search(page, 'outagejourney')
    await streams(page, 1)
    await send(page, {
      type: 'error',
      errorType: 'network',
      message: 'Dictionary sources are temporarily unavailable. Please try again.',
    })
    await page
      .getByRole('alert')
      .getByText(/temporarily unavailable/)
      .waitFor()
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await streams(page, 2)
    assert.equal(
      new URL(await page.evaluate(() => window.__streams[1].url), base).searchParams.has(
        'language'
      ),
      false
    )
    await send(page, {
      type: 'result',
      data: journeyEntry('outagejourney', { en: [['Recovered result', '/test/']] }),
    })
    await page.getByText('Recovered result (journey fixture).', { exact: true }).waitFor()
  })

  await scenario('Interrupted SSE → bounded reconnects → unary typo choices', async (page) => {
    let requests = 0
    await page.route('**/api/etymology**', (route) => {
      requests++
      return route.fulfill({
        status: 404,
        json: {
          success: false,
          errorType: 'typo',
          error: 'No exact dictionary entry found.',
          data: { suggestions: ['mole'] },
        },
      })
    })
    await page.goto(base)
    await search(page, 'typojourney')
    for (let index = 0; index < 3; index++) {
      await streams(page, index + 1)
      await page.evaluate((index) => window.__streams[index].fail(), index)
    }
    await page.getByRole('alert').getByRole('link', { name: 'mole', exact: true }).waitFor()
    assert.equal(
      await page
        .getByRole('alert')
        .getByRole('link', { name: 'mole', exact: true })
        .getAttribute('href'),
      '/word/mole'
    )
    assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 0)
    assert.equal(requests, 1)
  })

  await scenario(
    'Interrupted retrace retains saved results without automatic paid retry',
    async (page) => {
      await page.goto(base)
      await search(page, 'mole')
      await page.getByRole('button', { name: 'Retrace', exact: true }).click()
      await streams(page, 1)
      await page.evaluate(() => window.__streams[0].fail())
      await page
        .getByText('Retrace interrupted. Your saved entry is still available.', { exact: true })
        .waitFor()
      await page.getByText('Burrowing animal (journey fixture).', { exact: true }).waitFor()
      await page.waitForTimeout(2000)
      assert.equal(await page.evaluate(() => window.__streams.length), 1)
    }
  )
} finally {
  await browser.close()
}
console.log(JSON.stringify(outcomes, null, 2))
assert.ok(
  outcomes.every((outcome) => outcome.passed),
  'User journey checks failed'
)
