import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
const label = process.argv[2] ?? 'baseline'
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label))
  throw new Error('Benchmark label must use letters, digits, dots, underscores, or hyphens')
const include = (scenario) => !process.env.PERF_ONLY || scenario.includes(process.env.PERF_ONLY)
const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4199'
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  headless: true,
})
const samples = []
const ngram = {
  word: 'nice',
  corpus: 'eng-2019',
  data: Array.from({ length: 220 }, (_, i) => ({
    year: 1800 + i,
    count: (Math.sin(i / 40) + 2) * 0.00001,
    matchCount: 0,
  })),
}
async function setup() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.addInitScript(
    ({ ngram }) => {
      window.__perf = { lcp: 0, longTasks: [], rectReads: 0, traces: 0 }
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf.lcp = e.startTime
      }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf.longTasks.push(e.duration)
      }).observe({ type: 'longtask', buffered: true })
      const rect = Element.prototype.getBoundingClientRect
      Element.prototype.getBoundingClientRect = function () {
        window.__perf.rectReads++
        return rect.call(this)
      }
      const fetch = window.fetch
      window.fetch = (url, init) => {
        if (String(url).startsWith('/api/ngram'))
          return new Promise((resolve) =>
            setTimeout(
              () => resolve(new Response(JSON.stringify({ success: true, data: ngram }))),
              100
            )
          )
        if (String(url).startsWith('/api/suggestions'))
          return Promise.resolve(
            new Response(JSON.stringify({ success: true, data: { suggestions: [] } }))
          )
        return fetch(url, init)
      }
      // Count trace intent without dispatching research requests or spending provider budget.
      window.EventSource = class extends EventTarget {
        constructor() {
          super()
          window.__perf.traces++
        }
        close() {}
      }
    },
    { ngram }
  )
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 200000,
    uploadThroughput: 93750,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Performance.enable')
  return { context, page, cdp }
}
const metrics = async (cdp) =>
  Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics
      .filter(({ name }) =>
        [
          'TaskDuration',
          'ScriptDuration',
          'LayoutDuration',
          'LayoutCount',
          'RecalcStyleDuration',
          'JSHeapUsedSize',
        ].includes(name)
      )
      .map(({ name, value }) => [name, value])
  )
for (const path of [
  '/',
  '/faq',
  '/learn/what-is-etymology',
  '/words',
  '/word/nice',
  '/word/fr/fen%C3%AAtre',
  '/word/untraced',
].filter((path) => include(`cold:${path}`))) {
  for (let run = 0; run < 5; run++) {
    const { context, page, cdp } = await setup()
    await page.goto(base + path, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    const data = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      const resources = performance.getEntriesByType('resource')
      return {
        ...window.__perf,
        ttfb: nav.responseStart,
        load: nav.loadEventEnd,
        jsBytes: resources
          .filter((r) => r.name.includes('/_next/') && r.name.endsWith('.js'))
          .reduce((sum, r) => sum + r.encodedBodySize, 0),
        jsFiles: resources.filter((r) => r.name.includes('/_next/') && r.name.endsWith('.js'))
          .length,
        nodes: document.querySelectorAll('*').length,
      }
    })
    if (data.traces !== 0) throw new Error(`Direct load unexpectedly started a trace: ${path}`)
    samples.push({ scenario: `cold:${path}`, run, ...data, ...(await metrics(cdp)) })
    await context.close()
  }
  console.log(
    label,
    path,
    samples.filter((s) => s.scenario === `cold:${path}`).map((s) => Math.round(s.lcp))
  )
}
for (let run = 0; run < (include('navigation') ? 5 : 0); run++) {
  const { context, page } = await setup()
  await page.goto(base, { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  const link = page.locator('a[href="/word/nice"]').first()
  if (process.env.PERF_PREFETCH !== 'false') await link.focus()
  await page.waitForTimeout(1000)
  const start = await page.evaluate(() => {
    const start = performance.now()
    document.querySelector('a[href="/word/nice"]').click()
    return start
  })
  await page.locator('article h1').waitFor()
  await page.waitForFunction(
    () => document.querySelector('article h1')?.textContent?.trim() === 'nice'
  )
  const navigationMs = await page.evaluate((start) => performance.now() - start, start)
  await page.waitForTimeout(700)
  samples.push({ scenario: 'navigation:home-to-cached', run, navigationMs })
  await page.goBack()
  await page.waitForTimeout(300)
  const repeatStart = await page.evaluate(() => {
    const start = performance.now()
    document.querySelector('a[href="/word/nice"]').click()
    return start
  })
  await page.waitForFunction(
    () => document.querySelector('article h1')?.textContent?.trim() === 'nice'
  )
  samples.push({
    scenario: 'navigation:repeat',
    run,
    navigationMs: await page.evaluate((start) => performance.now() - start, repeatStart),
  })
  await context.close()
}
for (const path of ['/word/nice', '/words'].filter((path) => include(`scroll:${path}`))) {
  for (let run = 0; run < 3; run++) {
    const { context, page, cdp } = await setup()
    await page.goto(base + path, { waitUntil: 'load' })
    await page.waitForTimeout(900)
    const before = await metrics(cdp)
    const scroll = await page.evaluate(async () => {
      const frames = []
      let previous = performance.now()
      const max = document.documentElement.scrollHeight - innerHeight
      for (let i = 0; i < 120; i++) {
        await new Promise(requestAnimationFrame)
        const now = performance.now()
        frames.push(now - previous)
        previous = now
        window.scrollTo(0, max * (i < 60 ? i / 60 : (120 - i) / 60))
      }
      return {
        scrollFramesOver50ms: frames.filter((ms) => ms > 50).length,
        scrollP95ms: frames.sort((a, b) => a - b)[Math.floor(frames.length * 0.95)],
      }
    })
    const after = await metrics(cdp)
    samples.push({
      scenario: `scroll:${path}`,
      run,
      ...scroll,
      taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
      layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
      layouts: after.LayoutCount - before.LayoutCount,
    })
    await context.close()
  }
}
for (let run = 0; run < (include('drag:lineage') ? 3 : 0); run++) {
  const { context, page, cdp } = await setup()
  await page.goto(base + '/word/nice', { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  const before = await metrics(cdp)
  const drag = await page.evaluate(async () => {
    const node = document.querySelector('[data-tree-node]')
    node.scrollIntoView({ block: 'center' })
    await new Promise(requestAnimationFrame)
    const rect = node.getBoundingClientRect()
    const start = window.__perf.rectReads
    const x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2
    // Synthetic pointer events have no browser capture target. Capture is
    // orthogonal to layout cost; the interactive smoke check uses real input.
    node.setPointerCapture = () => {}
    node.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: x,
        clientY: y,
        button: 0,
      })
    )
    for (let i = 0; i < 60; i++) {
      await new Promise(requestAnimationFrame)
      node.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x + Math.sin(i / 8) * 20,
          clientY: y + 10 + Math.sin(i / 8) * 8,
        })
      )
    }
    node.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
    )
    await new Promise(requestAnimationFrame)
    return {
      rectReads: window.__perf.rectReads - start,
      moved: Boolean(node.style.translate),
      edges: document.querySelectorAll('#entry-ancestry path').length,
    }
  })
  const after = await metrics(cdp)
  if (!drag.moved || drag.edges === 0) throw new Error('Lineage drag did not move a connected node')
  samples.push({
    scenario: 'drag:lineage',
    run,
    ...drag,
    taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
    layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    layouts: after.LayoutCount - before.LayoutCount,
  })
  await context.close()
}
await browser.close()
if (samples.length === 0)
  throw new Error(`No benchmark scenario matches PERF_ONLY=${process.env.PERF_ONLY}`)
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
const summary = {}
for (const scenario of new Set(samples.map((s) => s.scenario))) {
  const rows = samples.filter((s) => s.scenario === scenario)
  summary[scenario] = Object.fromEntries(
    Object.keys(rows[0])
      .filter((k) => typeof rows[0][k] === 'number' && k !== 'run')
      .map((key) => [key, Math.round(median(rows.map((s) => s[key])) * 100) / 100])
  )
}
mkdirSync('bench-results/performance', { recursive: true })
writeFileSync(
  `bench-results/performance/${label}.json`,
  JSON.stringify(
    {
      label,
      setup: {
        viewport: '390x844',
        cpuSlowdown: 4,
        latencyMs: 150,
        downloadBytesPerSecond: 200000,
        fixedNgram: true,
        researchRequests: 'mocked',
      },
      samples,
      summary,
    },
    null,
    2
  )
)
console.log(JSON.stringify(summary, null, 2))
