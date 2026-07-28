import { describe, expect, test } from 'bun:test'
import {
  cleanWiktionaryHtml,
  extractWiktionaryEntryGroups,
  type WiktionaryTocSection,
} from './wiktionaryEntryGroups'

describe('extractWiktionaryEntryGroups', () => {
  test('keeps numbered etymologies and their sense contexts separate', () => {
    const html = [
      '<h2 id="English">English</h2><p>unrelated same spelling</p>',
      '<h2 id="Italian">Italian</h2>',
      '<h3 id="Etymology_1">Etymology 1</h3><p>From Latin <i>vītis</i>, vine.</p>',
      '<h4 id="Noun_1">Noun</h4><ol><li>screw</li><li>vine</li></ol>',
      '<h3 id="Etymology_2">Etymology 2</h3><p>See <i>vita</i>, life.</p>',
      '<h4 id="Noun_2">Noun</h4><p>plural of <i>vita</i></p>',
      '<h2 id="Latin">Latin</h2><p>wrong language section</p>',
    ].join('')
    const sections: WiktionaryTocSection[] = [
      { index: '1', line: 'English', anchor: 'English', hLevel: 2, number: '1' },
      { index: '2', line: 'Italian', anchor: 'Italian', hLevel: 2, number: '2' },
      {
        index: '3',
        line: 'Etymology 1',
        anchor: 'Etymology_1',
        hLevel: 3,
        number: '2.1',
      },
      { index: '4', line: 'Noun', anchor: 'Noun_1', hLevel: 4, number: '2.1.1' },
      {
        index: '5',
        line: 'Etymology 2',
        anchor: 'Etymology_2',
        hLevel: 3,
        number: '2.2',
      },
      { index: '6', line: 'Noun', anchor: 'Noun_2', hLevel: 4, number: '2.2.1' },
      { index: '7', line: 'Latin', anchor: 'Latin', hLevel: 2, number: '3' },
    ]

    const groups = extractWiktionaryEntryGroups(
      html,
      sections,
      'Italian',
      /^Etymology(?:\s+\d+)?$/i
    )

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      index: '3',
      number: '2.1',
      heading: 'Etymology 1',
      anchor: 'Etymology_1',
    })
    expect(groups[0].text).toContain('vītis')
    expect(groups[0].text).toContain('screw')
    expect(groups[0].text).not.toContain('plural of vita')
    expect(groups[0].sections[0]).toMatchObject({
      heading: 'Noun',
      anchor: 'Noun_1',
      path: ['Noun'],
    })

    expect(groups[1].text).toContain('plural of vita')
    expect(groups[1].text).not.toContain('vītis')
    expect(groups[1].text).not.toContain('wrong language section')
  })

  test('preserves same-level native POS and form sections as distinct contexts', () => {
    const html = [
      '<h2 id="Italiano">Italiano</h2>',
      '<h3 id="Etimologia">Etimologia</h3><p>Dal latino <i>vītis</i>.</p>',
      '<h3 id="Sostantivo">Sostantivo</h3><p>Pianta rampicante; elemento filettato.</p>',
      '<h4 id="Significati">Significati</h4><ol><li>vite da uva</li><li>vite metallica</li></ol>',
      '<h3 id="Forma_flessa">Forma flessa</h3><p>Plurale di <i>vita</i>.</p>',
      '<h2 id="Altro">Altro</h2><p>testo estraneo</p>',
    ].join('')
    const sections: WiktionaryTocSection[] = [
      { index: '1', line: '<span>Italiano</span>', anchor: 'Italiano', level: '2', number: '1' },
      { index: '2', line: 'Etimologia', anchor: 'Etimologia', level: '3', number: '1.1' },
      { index: '3', line: 'Sostantivo', anchor: 'Sostantivo', level: '3', number: '1.2' },
      { index: '4', line: 'Significati', anchor: 'Significati', level: '4', number: '1.2.1' },
      {
        index: '5',
        line: 'Forma flessa',
        anchor: 'Forma_flessa',
        level: '3',
        number: '1.3',
      },
      { index: '6', line: 'Altro', anchor: 'Altro', level: '2', number: '2' },
    ]

    const [group] = extractWiktionaryEntryGroups(
      html,
      sections,
      'Italiano',
      /^Etimologia(?:\s+\d+)?$/i
    )

    expect(group.heading).toBe('Etimologia')
    expect(group.sections.map((section) => section.heading)).toEqual([
      'Sostantivo',
      'Significati',
      'Forma flessa',
    ])
    expect(group.sections[0].text).toBe('Sostantivo\nPianta rampicante; elemento filettato.')
    expect(group.sections[1]).toMatchObject({
      path: ['Sostantivo', 'Significati'],
      text: 'Significati\n- vite da uva\n- vite metallica',
    })
    expect(group.sections[2]).toMatchObject({
      path: ['Forma flessa'],
      text: 'Forma flessa\nPlurale di vita.',
    })
    expect(group.text).not.toContain('testo estraneo')
  })

  test('falls back to one structured language group when no etymology heading exists', () => {
    const html =
      '<h2 id="Italiano">Italiano</h2><h3 id="Sostantivo">Sostantivo</h3><p>Una definizione.</p><h2 id="English">English</h2><p>Not selected.</p>'
    const sections: WiktionaryTocSection[] = [
      { index: '1', line: 'Italiano', anchor: 'Italiano', level: '2', number: '1' },
      { index: '2', line: 'Sostantivo', anchor: 'Sostantivo', level: '3', number: '1.1' },
      { index: '3', line: 'English', anchor: 'English', level: '2', number: '2' },
    ]

    const groups = extractWiktionaryEntryGroups(
      html,
      sections,
      'Italiano',
      /^Etimologia(?:\s+\d+)?$/i
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ heading: 'Italiano', index: '1', anchor: 'Italiano' })
    expect(groups[0].sections[0].text).toContain('Una definizione.')
    expect(groups[0].text).not.toContain('Not selected.')
  })

  test('rejects pages without the selected language section', () => {
    expect(
      extractWiktionaryEntryGroups(
        '<h2 id="English">English</h2><p>Only English.</p>',
        [{ index: '1', line: 'English', anchor: 'English', level: '2', number: '1' }],
        'Italiano',
        /^Etimologia$/i
      )
    ).toEqual([])
  })

  test('cleans formatting while retaining list and numeric-entity sense text', () => {
    expect(
      cleanWiktionaryHtml(
        '<h3>Nom</h3><ol><li>fen&#234;tre &amp; ouverture</li><li>cadre&nbsp;vitré</li></ol><sup>[1]</sup>'
      )
    ).toBe('Nom\n- fenêtre & ouverture\n- cadre vitré')
  })
})
