import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const streams = []
  await context.exposeBinding('recordLookupStream', (_, url) => streams.push(url))
  await context.route('**/api/etymology**', (route) => route.abort())
  await context.route('**/api/ngram**', (route) => route.fulfill({ status: 404, json: {} }))
  await context.route('**/api/recent-searches**', (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  )
  await context.addInitScript(() => {
    window.EventSource = class extends EventTarget {
      constructor(url) {
        super()
        void window.recordLookupStream(url)
      }
      close() {}
    }
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}/word/shiro`)
  await page.getByRole('link', { name: 'Japanese', exact: true }).click()
  await page.waitForURL(/\/word\/ja\//)
  const meanings = page.getByRole('navigation', { name: 'Meanings for しろ' })
  await meanings.waitFor()
  await meanings.locator('a[aria-current="page"]').waitFor()
  assert.equal(await meanings.getByRole('link').first().getAttribute('aria-current'), 'page')
  assert.equal(await page.getByText('Choose a meaning to see its origin.').count(), 0)
  assert.equal(await page.getByText('Other written forms', { exact: true }).count(), 0)
  assert.equal(streams.length, 0, JSON.stringify(streams))
  const originalChoices = await meanings.getByRole('link').allTextContents()
  const geometry = () =>
    page.evaluate(() => {
      const head = document.querySelector('main h1').getBoundingClientRect()
      const language = document
        .querySelector('[aria-label="Languages for しろ"]')
        .getBoundingClientRect()
      const meanings = document
        .querySelector('[aria-label="Meanings for しろ"]')
        .getBoundingClientRect()
      return [language.y - head.y, meanings.y - head.y, meanings.height]
    })
  const originalGeometry = await geometry()
  const assertStable = async () => {
    assert.deepEqual(await meanings.getByRole('link').allTextContents(), originalChoices)
    const current = await geometry()
    current.forEach((value, index) =>
      assert.ok(
        Math.abs(value - originalGeometry[index]) < 2,
        `Lookup layout shifted: ${originalGeometry} → ${current}`
      )
    )
  }
  const white = meanings.getByRole('link').filter({ hasText: '白 —' }).first()
  await white.hover()
  assert.equal(streams.length, 0, JSON.stringify(streams))
  await white.focus()
  await page.keyboard.press('Enter')
  await page.waitForURL(/%E7%99%BD\?lookup=.*history=/)
  await meanings.getByRole('link').filter({ hasText: '白 —' }).first().waitFor()
  assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), '白')
  const whiteUrl = page.url()
  const serverContext = await browser.newContext({ javaScriptEnabled: false })
  const serverPage = await serverContext.newPage()
  await serverPage.goto(whiteUrl)
  assert.deepEqual(
    await serverPage
      .getByRole('navigation', { name: 'Meanings for しろ' })
      .getByRole('link')
      .allTextContents(),
    originalChoices
  )
  assert.equal(await serverPage.getByRole('link', { name: 'English', exact: true }).count(), 1)
  assert.equal(await serverPage.getByRole('heading', { level: 1 }).innerText(), '白')
  await serverContext.close()
  await assertStable()
  assert.equal(await meanings.getByText(/haku|byaku|shira/).count(), 0)
  const imperative = meanings.getByRole('link').filter({ hasText: 'しろ —' }).first()
  await imperative.click()
  await page.waitForURL((url) => url.href !== whiteUrl)
  const imperativeUrl = page.url()
  await meanings.locator('a[aria-current="page"]').waitFor()
  await assertStable()
  await page.goBack()
  await page.waitForURL(whiteUrl)
  await assertStable()
  await page.goForward()
  await page.waitForURL(imperativeUrl)
  const metadataRequests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/lookup-group')) metadataRequests.push(request.url())
  })
  await page.reload()
  await meanings.locator('a[aria-current="page"]').waitFor()
  await assertStable()
  assert.equal(metadataRequests.length, 0)
  assert.equal(streams.length, 0, JSON.stringify(streams))
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: '/tmp/etymex-lookup-group-mobile.png', fullPage: false })
  const mobileGeometry = await geometry()
  await meanings.getByRole('link').filter({ hasText: '白 —' }).first().click()
  await page.waitForURL(/%E7%99%BD\?lookup=.*history=/)
  await meanings.locator('a[aria-current="page"]').waitFor()
  assert.deepEqual(await meanings.getByRole('link').allTextContents(), originalChoices)
  const mobileWhiteGeometry = await geometry()
  mobileWhiteGeometry.forEach((value, index) =>
    assert.ok(Math.abs(value - mobileGeometry[index]) < 2)
  )
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.screenshot({ path: '/tmp/etymex-lookup-group-desktop.png', fullPage: false })

  // Direct kanji searches discard the lookup context even in the same browser tab.
  await page.goto(`${base}/word/ja/${encodeURIComponent('白')}`)
  await page.getByRole('navigation', { name: 'Languages for 白' }).waitFor()
  assert.equal(await page.getByRole('navigation', { name: 'Meanings for しろ' }).count(), 0)
  assert.equal(await page.getByRole('link', { name: 'English', exact: true }).count(), 0)
  await page
    .getByRole('navigation', { name: 'Meanings for 白' })
    .getByRole('link')
    .filter({ hasText: 'haku' })
    .click()
  const focusedUrl = page.url()
  await page.reload()
  await page.waitForFunction(() =>
    document.querySelector('header h1')?.parentElement?.parentElement?.textContent?.includes('haku')
  )
  assert.equal(page.url(), focusedUrl)

  await page.goto(`${base}/word/ja/shiro`)
  await meanings.locator('a[aria-current="page"]').waitFor()
  assert.equal(await meanings.getByRole('link').first().getAttribute('aria-current'), 'page')
  assert.equal(await page.getByText('Choose a meaning to see its origin.').count(), 0)
  assert.equal(streams.length, 0, JSON.stringify(streams))
  assert.equal(await meanings.getByRole('link').filter({ hasText: '城' }).count(), 0)
  assert.equal(await meanings.getByRole('link').filter({ hasText: '代' }).count(), 0)
  const count = streams.length
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, explicitSelectedTraces: count, passiveTraces: 0 }))
} finally {
  await browser.close()
}
