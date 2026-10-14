import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4199'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.__traces = 0
    window.EventSource = class extends EventTarget {
      constructor() {
        super()
        window.__traces++
      }
      close() {}
    }
    const fetch = window.fetch
    window.fetch = (url, init) =>
      String(url).startsWith('/api/ngram')
        ? Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 404 }))
        : fetch(url, init)
  })
  await page.goto(`${base}/words`)
  await page.waitForTimeout(500)
  assert.equal(await page.locator('main a[href^="/word/"]').count(), 1000)
  await page.locator('a[href="/word/nice"]').focus()
  assert.equal(await page.evaluate(() => sessionStorage.getItem('etymex:trace-intent')), null)
  assert.equal(await page.evaluate(() => window.__traces), 0)
  await page.keyboard.press('Enter')
  await page.waitForURL('**/word/nice')
  await page.waitForFunction(() => document.querySelector('article h1')?.textContent === 'nice')
  assert.equal(await page.evaluate(() => window.__traces), 0)
  await page.goBack()
  await page.locator('a[href="/word/fr/fen%C3%AAtre"]').click()
  await page.waitForURL('**/word/fr/fen%C3%AAtre')
  assert.equal(await page.locator('article h1').textContent(), 'fenêtre')
  assert.ok((await page.locator('#entry-ancestry').textContent()).includes('Modern French'))

  // Hover may fetch cache-only RSC data; it must never grant trace intent.
  await page.goto(base)
  await page.locator('a[href="/word/nice"]').hover()
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => sessionStorage.getItem('etymex:trace-intent')), null)
  await page.goto(`${base}/word/untraced`)
  assert.equal(await page.evaluate(() => window.__traces), 0)
  await page.getByRole('button', { name: 'Trace its origins' }).waitFor()

  await page.goto(`${base}/word/nice`)
  await page.waitForTimeout(500)
  const cdp = await context.newCDPSession(page)
  const touchListeners = async () => {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: "document.querySelector('#entry-ancestry svg').parentElement",
    })
    return (
      await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
    ).listeners.filter((listener) => listener.type === 'touchmove' && !listener.passive).length
  }
  assert.equal(await touchListeners(), 0)
  const node = page.locator('[data-tree-node]').first()
  await node.scrollIntoViewIfNeeded()
  const box = await node.boundingBox()
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2
  const touch = { x, y }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] })
  await page.waitForTimeout(350)
  assert.equal(await touchListeners(), 1)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 15, y: y + 15 }],
  })
  await page.waitForTimeout(50)
  assert.ok(await node.evaluate((element) => Boolean(element.style.translate)))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(50)
  assert.equal(await touchListeners(), 0)
  await page.getByRole('button', { name: 'Reset layout' }).click()
  assert.equal(await node.evaluate((element) => element.style.translate), '')
  await page.setViewportSize({ width: 1280, height: 900 })
  assert.equal(await page.locator('#entry-ancestry path').count(), 8)
  await page.waitForFunction(() => {
    const canvas = document
      .querySelector('#entry-ancestry svg')
      .parentElement.getBoundingClientRect()
    const node = document.querySelector('[data-tree-node]').getBoundingClientRect()
    const start = `M${Math.round(node.left + node.width / 2 - canvas.left)},${Math.round(node.bottom - canvas.top)} `
    return document.querySelector('#entry-ancestry path').getAttribute('d').startsWith(start)
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.ok(
    await node.evaluate((element) => parseFloat(getComputedStyle(element).animationDuration) < 0.01)
  )
  assert.deepEqual(errors, [])
  await context.close()
  console.log(
    'Browser verification passed: index links, languages, crawler gate, touch drag, resize, reduced motion'
  )
} finally {
  await browser.close()
}
