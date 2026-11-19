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
  const started = performance.now()
  page.setDefaultTimeout(12000)
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await run(page, context)
    assert.deepEqual(errors, [])
    outcomes.push({ name, passed: true, elapsedMs: Math.round(performance.now() - started) })
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
  for (const requested of ['はる', 'haru'])
    await scenario(
      `Explicit ${requested} search survives a cached default redirect without tracing passive visits`,
      async (page, context) => {
        await fetch('http://127.0.0.1:4198', {
          method: 'POST',
          body: JSON.stringify(['del', 'entry:v1:張る']),
        })
        const calls = []
        const result = journeyEntry('張る', { ja: [['Recovered stretching meaning', '/haru/']] })
        result.entries.ja.histories[0].transliteration = 'haru'
        await context.route('**/api/etymology?**', async (route) => {
          const word = new URL(route.request().url()).searchParams.get('word')
          calls.push(word)
          assert.equal(word, '張る', 'The cached owner and first meaning must not be retraced')
          await fetch('http://127.0.0.1:4198', {
            method: 'POST',
            body: JSON.stringify(['set', 'entry:v1:張る', JSON.stringify(result)]),
          })
          await route.fulfill({ json: { success: true, data: result } })
        })
        const destination = (url) => url.pathname === `/word/ja/${encodeURIComponent('春')}`
        await page.goto(
          `${base}/word/${requested === 'haru' ? 'ja/' : ''}${encodeURIComponent(requested)}`
        )
        await page.waitForURL(destination)
        await page.getByText('Cached spring meaning (journey fixture).', { exact: true }).waitFor()
        await page.reload()
        await page.getByText('Cached spring meaning (journey fixture).', { exact: true }).waitFor()
        assert.deepEqual(calls, [])
        assert.equal(await page.evaluate(() => window.__streams.length), 0)
        await page.goto(base)
        await auto(page)
        const input = page.getByRole('combobox', { name: 'Look up a word or expression' })
        if (requested === 'haru') {
          await page.getByRole('combobox', { name: 'Word language' }).click()
          await page.getByRole('option', { name: 'Japanese', exact: true }).click()
        }
        await input.fill(requested)
        await input.press('Enter')
        await page.waitForURL(destination)
        const recovered = page
          .getByRole('navigation', { name: 'Meanings for はる' })
          .getByRole('link')
          .filter({ hasText: '張る —' })
        await recovered.waitFor()
        assert.deepEqual(calls, ['張る'])
        await recovered.click()
        await page
          .getByText('Recovered stretching meaning (journey fixture).', { exact: true })
          .waitFor()
        await page.goBack()
        await page.waitForURL(destination)
        await page.reload()
        await page.getByText('Cached spring meaning (journey fixture).', { exact: true }).waitFor()
        assert.deepEqual(calls, ['張る'])
        await page
          .getByRole('combobox', { name: 'Word language' })
          .getByText(requested === 'haru' ? 'Japanese' : 'Auto', { exact: true })
          .waitFor()
      }
    )

  await scenario(
    'Switching meanings during a streamed lookup retains one request and the selected story',
    async (page, context) => {
      await fetch('http://127.0.0.1:4198', {
        method: 'POST',
        body: JSON.stringify(['del', 'entry:v1:張る']),
      })
      await context.addInitScript(() => {
        const original = window.fetch.bind(window)
        window.__requests = 0
        window.fetch = (input, init) => {
          const url = new URL(
            typeof input === 'string' ? input : (input.url ?? input),
            location.href
          )
          if (url.pathname !== '/api/etymology' || url.searchParams.get('word') !== '張る')
            return original(input, init)
          if (url.searchParams.get('stream') !== 'true')
            throw new Error('Expected a streamed lookup')
          window.__requests++
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  window.emitAlternative = (event) =>
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
                    )
                  init.signal.addEventListener('abort', () =>
                    controller.error(new Error('Lookup aborted'))
                  )
                },
              }),
              { headers: { 'content-type': 'text/event-stream' } }
            )
          )
        }
      })
      await page.goto(base)
      await auto(page)
      const input = page.getByRole('combobox', { name: 'Look up a word or expression' })
      await input.fill('はる')
      await input.press('Enter')
      await page.waitForFunction(() => Boolean(window.emitAlternative))
      const langs = page.getByRole('navigation', { name: 'Languages for はる' })
      await langs.getByRole('link', { name: 'English', exact: true }).click()
      await page
        .getByText('Independent Latin spelling fixture (journey fixture).', { exact: true })
        .waitFor()
      await langs.getByRole('link', { name: 'Japanese', exact: true }).click()
      const meanings = page.getByRole('navigation', { name: 'Meanings for はる' })
      const selected = meanings.getByRole('link').filter({ hasText: 'Second spring history' })
      await selected.click()
      const current = page.url()
      const history = journeyEntry('張る', { ja: [['Stretching preview', '/haru/']] }).entries.ja
        .histories[0]
      history.transliteration = 'haru'
      await selected.focus()
      const emit = (event) => page.evaluate((event) => window.emitAlternative(event), event)
      await emit({
        type: 'synthesis_section',
        language: 'ja',
        section: 'readyHistories',
        data: [history],
      })
      const preview = meanings.getByRole('link').filter({ hasText: 'Stretching preview' })
      await preview.waitFor()
      assert.equal(page.url(), current)
      assert.equal(await selected.evaluate((el) => document.activeElement === el), true)
      await page.getByText('Second spring history (journey fixture).', { exact: true }).waitFor()
      await preview.click()
      await page.getByText('Stretching preview (journey fixture).', { exact: true }).waitFor()
      await page.goBack()
      await page.getByText('Second spring history (journey fixture).', { exact: true }).waitFor()
      await emit({
        type: 'synthesis_section',
        language: 'ja',
        section: 'synthesis_reset',
        data: null,
      })
      await preview.waitFor({ state: 'hidden' })
      await emit({ type: 'error', errorType: 'rate_limit', message: 'Rate limited' })
      await page.getByRole('button', { name: 'Retry', exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.__requests), 1)
      assert.equal(await page.evaluate(() => window.__streams.length), 0)
    }
  )

  await scenario(
    'Back after a same-word history change never retries a rate-limited alternative',
    async (page, context) => {
      await fetch('http://127.0.0.1:4198', {
        method: 'POST',
        body: JSON.stringify(['del', 'entry:v1:張る']),
      })
      const calls = []
      await context.route('**/api/etymology?**', async (route) => {
        calls.push(new URL(route.request().url()).searchParams.get('word'))
        await route.fulfill({ status: 429, json: { success: false, error: 'Rate limited' } })
      })
      await page.goto(base)
      await auto(page)
      await page.getByRole('combobox', { name: 'Word language' }).click()
      await page.getByRole('option', { name: 'Japanese', exact: true }).click()
      const input = page.getByRole('combobox', { name: 'Look up a word or expression' })
      await input.fill('haru')
      await input.press('Enter')
      await page.getByRole('button', { name: 'Retry', exact: true }).waitFor()
      const original = page.url()
      await page
        .getByRole('navigation', { name: 'Meanings for はる' })
        .getByRole('link')
        .filter({ hasText: 'Second spring history' })
        .click()
      await page.getByText('Second spring history (journey fixture).', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('lookup'), 'はる')
      await page.goBack()
      await page.waitForURL(original)
      await page.getByText('Cached spring meaning (journey fixture).', { exact: true }).waitFor()
      // Allow an accidental metadata refresh and deferred batch to reach the intercepted API.
      await page.waitForTimeout(1000)
      assert.deepEqual(calls, ['張る'])
    }
  )

  await scenario(
    'Empty kana index retains content and opens the first recovered meaning',
    async (page, context) => {
      let checked = false
      const index = journeyEntry('かき', { ja: [['Saved kaki reading index', '/kaki/']] })
      const destination = journeyEntry('柿', { ja: [['Persimmon recovery', '/kaki/']] })
      destination.entries.ja.histories[0].transliteration = 'kaki'
      const group = {
        reading: 'かき',
        members: [
          { word: 'かき', language: 'ja', lookupSupport: 'linked' },
          { word: '柿', language: 'ja', lookupSupport: 'linked' },
        ],
        languages: [],
        choices: [],
      }
      await context.route('**/api/lookup-group?**', (route) => route.fulfill({ json: { group } }))
      await context.route('**/api/etymology?**', async (route) => {
        assert.equal(new URL(route.request().url()).searchParams.get('word'), '柿')
        checked = true
        group.members[1].lookupSupport = 'verified'
        group.choices.push({
          word: '柿',
          language: 'ja',
          label: '柿 — Persimmon recovery',
          historyId: destination.entries.ja.primaryHistoryId,
        })
        group.languages.push({ word: '柿', language: 'ja' })
        // Persist through the local fixture backend, just as the real route does.
        await fetch('http://127.0.0.1:4198', {
          method: 'POST',
          body: JSON.stringify(['set', 'entry:v1:柿', JSON.stringify(destination)]),
        })
        await route.fulfill({ json: { success: true, data: destination } })
      })
      await page.goto(`${base}/word/ja/${encodeURIComponent(index.word)}`)
      await page.getByText('Saved kaki reading index (journey fixture).', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Retrace', exact: true }).waitFor()
      assert.equal(checked, false)
      assert.equal(await page.evaluate(() => window.__streams.length), 0)
      await page.getByRole('button', { name: 'Check related entries', exact: true }).click()
      await page.waitForURL(/%E6%9F%BF/)
      await page.getByText('Persimmon recovery (journey fixture).', { exact: true }).waitFor()
      assert.equal(checked, true)
      await auto(page)
    }
  )

  await scenario(
    'All cached matching readings survive beyond four across selection and reload',
    async (page) => {
      const requests = []
      page.on('request', (request) => {
        if (request.url().includes('/api/etymology')) requests.push(request.url())
      })
      await page.goto(`${base}/word/ja/${encodeURIComponent('こう')}`)
      const picker = page.getByRole('button', { name: /Change meaning/ })
      await picker.click()
      const meanings = page.getByRole('navigation', { name: 'Meanings for こう' })
      await meanings.waitFor()
      assert.equal(await meanings.getByRole('link').count(), 6)
      assert.equal(await meanings.getByRole('link').filter({ hasText: '甲' }).count(), 0)
      await meanings.getByRole('link').filter({ hasText: '光 —' }).click()
      await page.waitForURL(/%E5%85%89/)
      if (!(await meanings.isVisible())) await picker.click()
      assert.equal(await meanings.getByRole('link').count(), 6)
      await page.reload()
      await picker.click()
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
      const progress = page.getByRole('status').filter({ hasText: /Consulting sources for/ })
      await progress.waitFor()
      await progress.waitFor({ state: 'hidden' })
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

  await scenario(
    'Searching the same spelling in another language starts its missing trace',
    async (page) => {
      await page.goto(base)
      await auto(page)
      for (const [index, [code, name, meaning]] of [
        ['en', 'English', 'Cooking vessel'],
        ['es', 'Spanish', 'Bread'],
      ].entries()) {
        await page.getByRole('combobox', { name: 'Word language' }).click()
        await page.getByRole('option', { name, exact: true }).click()
        const input = page.getByRole('combobox', { name: 'Look up a word or expression' })
        await input.fill('pan')
        await input.press('Enter')
        await page.waitForURL(base + '/word/' + code + '/pan')
        await streams(page, index + 1)
        assert.equal(
          new URL(await page.evaluate(() => window.__streams.at(-1).url), base).searchParams.get(
            'language'
          ),
          code
        )
        await send(page, {
          type: 'result',
          data: journeyEntry('pan', { [code]: [[meaning, '/test/']] }),
        })
        await page.getByText(meaning + ' (journey fixture).', { exact: true }).waitFor()
      }
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
    'Explicit search refreshes a stale entry once while direct visits and reloads stay passive',
    async (page) => {
      await page.goto(base + '/word/oldword')
      await page.getByRole('button', { name: 'Retrace', exact: true }).waitFor()
      await auto(page)
      assert.equal(await page.evaluate(() => window.__streams.length), 0)
      await page.goto(base)
      await search(page, 'oldword')
      await streams(page, 1)
      assert.equal(
        new URL(await page.evaluate(() => window.__streams[0].url), base).searchParams.get(
          'refresh'
        ),
        '1'
      )
      await page.getByText('Saved old meaning (journey fixture).', { exact: true }).waitFor()
      await page.evaluate(() => window.__streams[0].fail())
      await page
        .getByText('Retrace interrupted. Your saved entry is still available.', { exact: true })
        .waitFor()
      await page.getByText('Saved old meaning (journey fixture).', { exact: true }).waitFor()
      await page.waitForTimeout(2000)
      assert.equal(await page.evaluate(() => window.__streams.length), 1)
      await page.getByRole('button', { name: 'Retrace', exact: true }).click()
      await streams(page, 2)
      await send(page, {
        type: 'result',
        data: journeyEntry('oldword', { en: [['Refreshed meaning', '/test/']] }),
      })
      await page.getByText('Refreshed meaning (journey fixture).', { exact: true }).waitFor()
      await page.reload()
      await auto(page)
      assert.equal(await page.evaluate(() => window.__streams.length), 0)
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
