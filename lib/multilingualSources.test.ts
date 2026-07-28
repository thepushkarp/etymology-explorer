import { describe, expect, test } from 'bun:test'
import { extractTocEtymology } from './multilingualSources'
import { LANGUAGES, type BetaLanguageCode } from './languages'

function fixture(language: BetaLanguageCode, languageHeading: string, etymologyHeading: string) {
  const html = `<h2 id="other">Other</h2><p>wrong language</p><h2 id="lang">${languageHeading}</h2><h3 id="ety1">${etymologyHeading}</h3><p>Dal latino casa, dimora.</p><h3 id="ety2">${etymologyHeading} 2</h3><p>De latin casa, habitation.</p><h2 id="next">Next</h2>`
  const sections = [
    { index: '1', line: 'Other', anchor: 'other', level: '2', number: '1' },
    { index: '2', line: languageHeading, anchor: 'lang', level: '2', number: '2' },
    { index: '3', line: etymologyHeading, anchor: 'ety1', level: '3', number: '2.1' },
    { index: '4', line: `${etymologyHeading} 2`, anchor: 'ety2', level: '3', number: '2.2' },
    { index: '5', line: 'Next', anchor: 'next', level: '2', number: '3' },
  ]
  return extractTocEtymology(html, sections, languageHeading, LANGUAGES[language].etymologyHeading)
}

describe('MediaWiki tocdata language sections', () => {
  test.each([
    ['it', 'Italiano', 'Etimologia'],
    ['es', 'Español', 'Etimología'],
    ['fr', 'Français', 'Étymologie'],
    ['pt', 'Português', 'Etimologia'],
  ] as const)(
    '%s selects the requested language and all numbered etymologies',
    (code, language, heading) => {
      const text = fixture(code, language, heading)
      expect(text).toContain('latino casa')
      expect(text).toContain('latin casa')
      expect(text).not.toContain('wrong language')
    }
  )

  test('a same-spelling page without the selected language is rejected', () => {
    expect(
      extractTocEtymology(
        '<h2 id="english">English</h2><p>house</p>',
        [{ index: '1', line: 'English', anchor: 'english', level: '2', number: '1' }],
        'Italiano',
        LANGUAGES.it.etymologyHeading
      )
    ).toBeNull()
  })

  test('accepts live tocdata hLevel fields and HTML-wrapped headings', () => {
    const text = extractTocEtymology(
      '<h2 id="Italiano">Italiano</h2><h3 id="Etimologia_/_Derivazione">Etimologia / Derivazione</h3><p>Dal latino casa.</p>',
      [
        {
          index: '1',
          line: '<span>Italiano</span>',
          anchor: 'Italiano',
          hLevel: 2,
          number: '1',
        },
        {
          index: 'T-1',
          line: 'Etimologia / Derivazione',
          anchor: 'Etimologia_/_Derivazione',
          hLevel: 3,
          number: '1.1',
        },
      ],
      'Italiano',
      LANGUAGES.it.etymologyHeading
    )
    expect(text).toContain('latino casa')
  })
})
