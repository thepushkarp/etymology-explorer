import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntryView } from './EntryView'
import { etymologyResult } from '@/lib/testSupport/etymologyResult'
import type { WordEntry } from '@/lib/types'
import { assembleLookupGroup, lookupGroupSeed } from '@/lib/lookupGroups'

const entry: WordEntry = {
  word: 'sale',
  languages: ['en', 'it'],
  entries: {
    en: etymologyResult({ word: 'sale', language: 'en', definition: 'The act of selling.' }),
    it: etymologyResult({
      word: 'sale',
      language: 'it',
      definition: 'Salt, a mineral used in food.',
    }),
  },
  otherLanguages: [],
  revision: 1,
  tracedAt: '2026-11-10T00:00:00.000Z',
}

describe('EntryView merged entries', () => {
  test('an empty kana index keeps saved content, recovery and direct dictionary links', () => {
    const result = etymologyResult({
      word: 'かき',
      language: 'ja',
      definition: 'Saved reading index.',
    })
    Object.assign(result.histories[0], {
      entryKind: 'unresolved',
      transliteration: 'kaki',
      counterparts: [
        { word: '柿', language: 'ja' },
        { word: '牡蠣', language: 'ja' },
      ],
    })
    const saved: WordEntry = { ...entry, word: 'かき', languages: ['ja'], entries: { ja: result } }
    const group = assembleLookupGroup(lookupGroupSeed(saved)!, [saved])
    const html = renderToStaticMarkup(
      <EntryView entry={saved} language="ja" stale lookupGroup={group} />
    )
    expect(html).toContain('Saved reading index.')
    expect(html).toContain('Retrace</button>')
    expect(html).toContain('Check related entries')
    expect(html).toContain(`/word/ja/${encodeURIComponent('柿')}`)
    expect(html).not.toContain('This reading is not available')
  })
  test('an empty reading group renders unavailable instead of another reading’s content', () => {
    const saved: WordEntry = {
      ...entry,
      word: '白',
      languages: ['ja'],
      entries: {
        ja: etymologyResult({
          word: '白',
          language: 'ja',
          transliteration: 'haku',
          definition: 'Unrelated haku history.',
        }),
      },
    }
    const html = renderToStaticMarkup(
      <EntryView
        entry={saved}
        language="ja"
        selection={{ lookup: 'しろ' }}
        lookupGroup={{
          reading: 'しろ',
          members: [{ word: '白', language: 'ja', lookupSupport: 'linked' }],
          choices: [],
          languages: [{ word: 'shiro', language: 'en' }],
        }}
      />
    )
    expect(html).toContain('This reading is not available in the saved entry.')
    expect(html).not.toContain('Unrelated haku history.')
    expect(html).not.toContain('haku')
    expect(html).toContain(`href="/word/ja/${encodeURIComponent('白')}"`)
    expect(html).toContain('/word/en/shiro?lookup=')
  })

  test('selects the requested language without mixing sibling definitions', () => {
    const html = renderToStaticMarkup(<EntryView entry={entry} language="it" />)
    expect(html).toContain('Salt, a mineral used in food.')
    expect(html).not.toContain('The act of selling.')
    expect(html).toContain('lang="it" dir="auto"')
    expect(html).toContain('href="/word/it/sale"')
  })

  test('preserves stale entry content alongside the explicit retrace action', () => {
    const html = renderToStaticMarkup(<EntryView entry={entry} stale />)
    expect(html).toContain('The act of selling.')
    expect(html).toContain('Retrace</button>')
    expect(renderToStaticMarkup(<EntryView entry={entry} />)).not.toContain('Retrace</button>')
  })

  test('keeps failed language tabs and an explicit cooldown-gated retry after reload', () => {
    const partial: WordEntry = {
      ...entry,
      languages: ['it'],
      entries: { it: entry.entries.it },
      failedLanguages: {
        en: {
          kind: 'validation',
          message: 'The English entry could not be completed.',
          retryAt: '2099-01-01T00:00:00.000Z',
        },
      },
    }
    const saved = renderToStaticMarkup(<EntryView entry={partial} />)
    expect(saved).toContain('Salt, a mineral used in food.')
    expect(saved).toContain('href="/word/en/sale"')
    expect(saved).toContain('English</a>')

    const failed = renderToStaticMarkup(<EntryView entry={partial} language="en" />)
    expect(failed).toContain('The English entry could not be completed.')
    expect(failed).toContain('Retry English</button>')
    expect(failed).toContain('disabled=""')
    expect(failed).toContain('dateTime="2099-01-01T00:00:00.000Z"')
    expect(failed).not.toContain('No supported English entry was found')
  })

  test('offers an explicit cooldown-gated retry for an unavailable language', () => {
    const html = renderToStaticMarkup(
      <EntryView
        entry={{
          ...entry,
          failedLanguages: {
            fr: {
              kind: 'unavailable',
              message: 'No supported French entry is available.',
              retryAt: '2026-11-10T00:00:00.000Z',
            },
          },
        }}
        language="fr"
      />
    )
    expect(html).toContain('No supported French entry is available.')
    expect(html).toContain('Retry French</button>')
    expect(html).toContain('disabled=""')
    expect(html).toContain('dateTime="2026-11-10T00:00:00.000Z"')
  })

  test('keeps a saved entry readable when its latest retrace failed', () => {
    const html = renderToStaticMarkup(
      <EntryView
        entry={{
          ...entry,
          failedLanguages: {
            it: {
              kind: 'transient',
              message: 'The latest Italian trace could not be completed.',
              retryAt: '2099-01-01T00:00:00.000Z',
            },
          },
        }}
        language="it"
      />
    )
    expect(html).toContain('Salt, a mineral used in food.')
    expect(html).toContain('The latest Italian trace could not be completed.')
    expect(html).toContain('Retry Italian</button>')
  })

  test('renders an unavailable requested language without dereferencing an absent result', () => {
    const html = renderToStaticMarkup(<EntryView entry={entry} language="fr" />)
    expect(html).toContain('No supported French entry was found')
    expect(html).toContain('href="/word/en/sale"')
    const incomplete = renderToStaticMarkup(
      <EntryView entry={{ ...entry, incomplete: true }} language="fr" />
    )
    expect(incomplete).toContain('French entry is temporarily unavailable')
    expect(incomplete).not.toContain('No supported French entry was found')
  })

  test('shows a verified Japanese destination alongside a successful English entry', () => {
    const result = etymologyResult({
      word: 'tsunami',
      definition: 'A large sea wave.',
      ancestryGraph: {
        branches: [
          {
            root: '津波',
            stages: [{ stage: 'Japanese', form: '津波', note: 'Source of the English borrowing.' }],
          },
        ],
      },
    })
    const html = renderToStaticMarkup(
      <EntryView
        entry={{
          ...entry,
          word: 'tsunami',
          languages: ['en'],
          entries: { en: result },
          otherScripts: [{ word: '津波', language: 'ja' }],
        }}
        lookupGroup={{
          reading: 'tsunami',
          members: [{ word: '津波', language: 'ja', lookupSupport: 'verified' }],
          choices: [{ word: '津波', language: 'ja', historyId: 'wave', label: '津波 — wave' }],
          languages: [
            { word: 'tsunami', language: 'en' },
            { word: '津波', language: 'ja' },
          ],
        }}
      />
    )
    expect(html).toContain('A large sea wave.')
    expect(html).toContain('Japanese</a>')
    expect(html).not.toContain('Japanese lookup')
    expect(html).toContain(`href="/word/ja/${encodeURIComponent('津波')}?lookup=tsunami`)
  })

  test('shows only the selected history’s source-attested counterpart', () => {
    const result = etymologyResult({ word: 'किताब', language: 'hi', definition: 'A book.' })
    result.histories[0].counterparts = [{ word: 'کتاب', language: 'ur' }]
    result.histories.push({
      ...result.histories[0],
      id: 'unselected-history',
      counterparts: [{ word: '書', language: 'ja' }],
    })
    const html = renderToStaticMarkup(
      <EntryView entry={{ ...entry, word: 'किताब', languages: ['hi'], entries: { hi: result } }} />
    )
    expect(html).toContain(`href="/word/ur/${encodeURIComponent('کتاب')}"`)
    expect(html).toContain('lang="ur" dir="auto"')
    expect(html).toContain('Other written forms')
    expect(html).not.toContain(encodeURIComponent('書'))
  })
})

test('server rendering respects a requested history and never substitutes an unmatched grouped reading', () => {
  const result = etymologyResult({
    word: '白',
    language: 'ja',
    definition: 'Unrelated haku story.',
  })
  result.histories[0].id = 'haku'
  result.primaryHistoryId = 'haku'
  const saved: WordEntry = { ...entry, word: '白', languages: ['ja'], entries: { ja: result } }
  const html = renderToStaticMarkup(
    <EntryView
      entry={saved}
      language="ja"
      selection={{ lookup: 'しろ' }}
      lookupGroup={{
        reading: 'しろ',
        members: [{ word: '白', language: 'ja', lookupSupport: 'linked' }],
        languages: [{ word: 'しろ', language: 'ja' }],
        choices: [{ word: '白', language: 'ja', label: '白 — white' }],
      }}
    />
  )
  expect(html).not.toContain('Unrelated haku story.')
  expect(html).toContain('This reading is not available')
  result.histories.push({
    ...result.histories[0],
    id: 'shiro',
    definition: 'The selected white reading.',
  })
  const focused = renderToStaticMarkup(
    <EntryView entry={saved} language="ja" selection={{ historyId: 'shiro' }} />
  )
  expect(focused).toContain('The selected white reading.')
  expect(focused).not.toContain('Unrelated haku story.</p>')
})
