import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4217'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
})
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  await context.addInitScript(() => {
    window.lookupTraces = 0
    // Observe intent without issuing paid research requests.
    window.EventSource = class extends EventTarget {
      constructor() {
        super()
        window.lookupTraces++
      }
      close() {}
    }
  })
  await context.route('**/api/suggestions?**', (route) =>
    route.fulfill({ json: { success: true, data: { suggestions: [] } } })
  )
  await context.route('**/api/recent-searches**', (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  )
  const page = await context.newPage()
  await page.goto(base)
  const input = page.getByRole('combobox', { name: 'Look up a word or expression' })
  await input.fill('たたかえ')
  const language = page.getByRole('combobox', { name: 'Word language' })
  async function checkLanguageLayout(header = false) {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
      await page.evaluate(() => document.fonts.ready)
      const geometry = () =>
        page.evaluate(() =>
          ['input[role="combobox"]', 'button[role="combobox"]', 'main'].map((selector) => {
            const matched = document.querySelector(selector)
            const element = selector.startsWith('input') ? matched.parentElement : matched
            const { x, y, width, height } = element.getBoundingClientRect()
            return selector === 'main' ? { x, y, width } : { x, y, width, height }
          })
        )
      const before = await geometry()
      for (const name of ['Portuguese', 'Japanese', 'Auto']) {
        await language.click()
        const option = page.getByRole('option', { name, exact: true })
        if (name === 'Japanese') assert.match(await option.innerText(), /ja/i)
        await option.click()
        assert.deepEqual(await geometry(), before, `${name} must preserve layout at ${width}px`)
      }
      if (header) {
        const [input, selector] = before
        assert.equal(input.y, selector.y)
        assert.equal(input.height, selector.height)
        assert.equal(selector.height, 46)
        await page.screenshot({ path: `/tmp/etymex-header-${width}.png` })
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      )
    }
    await page.setViewportSize({ width: 390, height: 844 })
  }
  await checkLanguageLayout()
  for (const dark of [false, true]) {
    await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), dark)
    await language.click()
    assert.equal(
      await page
        .getByRole('listbox')
        .evaluate(
          (menu) =>
            getComputedStyle(menu).backgroundColor ===
            getComputedStyle(document.body).backgroundColor
        ),
      true
    )
    await language.press('End')
    assert.equal(
      await language.getAttribute('aria-activedescendant'),
      await page.getByRole('option', { name: 'Japanese', exact: true }).getAttribute('id')
    )
    await language.press('Escape')
    assert.equal(await page.getByRole('listbox').count(), 0)
    assert.match(await language.innerText(), /Auto/)
  }
  await language.click()
  await page.getByRole('heading', { name: 'Every word has a past.' }).click()
  assert.equal(await page.getByRole('listbox').count(), 0)
  await language.focus()
  await language.press('j')
  await language.press('Enter')
  assert.equal(await input.inputValue(), 'たたかえ')
  assert.equal(await page.getByText('Kana, kanji, or rōmaji.').count(), 0)
  assert.match(await page.getByLabel('Word language').locator('..').innerText(), /Language/)
  await input.dispatchEvent('compositionstart')
  await input.press('ArrowDown')
  await input.press('Enter')
  assert.equal(new URL(page.url()).pathname, '/')
  assert.equal(await page.evaluate(() => window.lookupTraces), 0)
  await input.dispatchEvent('compositionend')
  await input.press('Enter')
  await page.waitForURL('**/word/ja/**')
  await page.waitForFunction(() => window.lookupTraces === 1)
  const headerInput = page.getByRole('combobox', { name: 'Look up a word or expression' })
  await headerInput.fill('shiro')
  await page.getByRole('combobox', { name: 'Word language' }).click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  assert.equal(await headerInput.inputValue(), 'shiro')
  await checkLanguageLayout(true)
  const passive = await context.newPage()
  await passive.goto(`${base}/word/ja/${encodeURIComponent('ローカル未記録の確認用語')}`)
  await passive.getByRole('button', { name: 'Trace its origins', exact: true }).waitFor()
  assert.equal(await passive.evaluate(() => window.lookupTraces), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  console.log(
    'Passed: themed language menus, keyboard selection/dismissal, preserved input, IME confirmation, deliberate navigation, mobile width, and zero passive trace intent.'
  )
  await context.close()
} finally {
  await browser.close()
}
