import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageTabs } from './LanguageTabs'

describe('LanguageTabs', () => {
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
})
