import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageTabs } from './LanguageTabs'

describe('LanguageTabs', () => {
  test('orders successful and failed tabs by registry priority without changing the primary link', () => {
    const html = renderToStaticMarkup(
      <LanguageTabs
        word="chat"
        languages={['pt', 'fr']}
        failedLanguages={{
          en: { kind: 'transient', message: 'Try again later.', retryAt: '2099-01-01T00:00:00Z' },
        }}
        otherLanguages={[]}
        language="en"
      />
    )
    expect(html.indexOf('English</a>')).toBeLessThan(html.indexOf('French</a>'))
    expect(html.indexOf('French</a>')).toBeLessThan(html.indexOf('Portuguese</a>'))
    expect(html).toContain('href="/word/en/chat"')
    expect(html).toContain('href="/word/chat"')
  })

  test('cached tabs expose primary and explicit English links with current-page identity', () => {
    const html = renderToStaticMarkup(
      <LanguageTabs word="sale" languages={['it', 'en']} otherLanguages={[]} language="en" />
    )
    expect(html).toContain('href="/word/sale"')
    expect(html).toContain('href="/word/en/sale"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('English</a>')
  })

  test('live tabs switch locally and retain unsupported language discoveries', () => {
    const html = renderToStaticMarkup(
      <LanguageTabs
        word="chat"
        languages={['en', 'fr']}
        otherLanguages={[
          'Dutch',
          'Tagalog',
          'Latin',
          'Swedish',
          'Danish',
          'Norwegian',
          'German',
          'Welsh',
          'Irish',
          'Scots',
        ]}
        language="fr"
        onSelect={() => {}}
      />
    )
    expect(html).toContain('<button')
    expect(html).not.toContain('href=')
    expect(html).toContain(
      'Dutch, Tagalog, Latin, Swedish, Danish, Norwegian, German, Welsh, and 2 more'
    )
    expect(html).not.toContain('Irish')
  })

  test('offers Japanese spellings without treating them as languages of a Latin query', () => {
    const html = renderToStaticMarkup(
      <LanguageTabs
        word="tsunami"
        languages={['en']}
        language="en"
        otherLanguages={[]}
        otherScripts={[
          { word: 'つなみ', language: 'ja' },
          { word: '津波', language: 'ja' },
        ]}
      />
    )
    expect(html).toContain('In other scripts')
    expect(html).toContain(`href="/word/ja/${encodeURIComponent('つなみ')}"`)
    expect(html).toContain(`href="/word/ja/${encodeURIComponent('津波')}"`)
    expect(html).toContain('lang="ja" dir="auto"')
    expect(html).not.toContain('Japanese</a>')
    expect(html).not.toContain('/word/ja/tsunami')
  })

  test('renders nothing for a single-language entry without source script offers', () => {
    expect(
      renderToStaticMarkup(
        <LanguageTabs word="pani" languages={['en']} otherLanguages={[]} otherScripts={[]} />
      )
    ).toBe('')
  })
})
