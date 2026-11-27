import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntryNavigation } from './EntryNavigation'
import { entryNavigation } from '@/lib/entryNavigation'
import { etymologyResult } from '@/lib/testSupport/etymologyResult'
import { ScriptLinks } from './ScriptLinks'

test('successful, failed, and cross-script languages share ordered navigation links', () => {
  const model = entryNavigation({
    word: 'chat',
    language: 'fr',
    languages: ['pt', 'fr'],
    failedLanguages: { en: { kind: 'transient', message: 'Unavailable.', retryAt: '2099-01-01' } },
    otherScripts: [
      { word: 'しろ', language: 'ja' },
      { word: '白', language: 'ja' },
    ],
    group: {
      reading: 'chat',
      members: [{ word: 'しろ', language: 'ja', lookupSupport: 'linked' }],
      choices: [{ word: 'しろ', language: 'ja', label: 'しろ' }],
      languages: [{ word: 'しろ', language: 'ja' }],
    },
  })
  const html = renderToStaticMarkup(<EntryNavigation model={model} />)
  expect(model.tabs.map((tab) => tab.language)).toEqual(['en', 'fr', 'pt', 'ja'])
  expect(html).toContain('href="/word/fr/chat"')
  expect(html).toContain('href="/word/pt/chat"')
  expect(html).toContain(`/word/ja/${encodeURIComponent('しろ')}?lookup=chat`)
  expect(html).not.toContain('<button')
  expect(model.tabs.find((tab) => tab.language === 'ja')?.word).toBe('しろ')
})

test('a single language retains the same language row', () => {
  const model = entryNavigation({ word: 'pani', language: 'hi', languages: ['hi'] })
  expect(renderToStaticMarkup(<EntryNavigation model={model} />)).toContain('Hindi</a>')
})

test('more than three meanings stay visible without a Change meaning toggle and default to the first match', () => {
  const base = etymologyResult({ word: 'love', definition: 'Affection' })
  const senses = [
    ['h1', 'love', 'Affection'],
    ['h2', 'love', 'To feel affection'],
    ['h3', 'love', 'Zero score'],
    ['h4', 'love', 'Praise or sell'],
    ['h5', 'Love', 'Personification'],
  ] as const
  base.primaryHistoryId = 'h1'
  base.histories = senses.map(([id, sourceTitle, label]) => ({
    ...base.histories[0],
    id,
    sourceTitle,
    label,
  }))
  const model = entryNavigation({
    word: 'love',
    language: 'en',
    languages: ['en'],
    histories: base.histories,
  })
  expect(model.historyId).toBe('h1')
  const html = renderToStaticMarkup(<EntryNavigation model={model} />)
  expect(html).not.toContain('Change meaning')
  expect(html).not.toContain('hidden=""')
  expect(html).toContain('>Affection</a>')
  expect(html).toContain('>To feel affection</a>')
  expect(html).toContain('>Love — Personification</a>')
  expect(html).not.toContain('love — Affection')
})

test('dictionary links label Japanese and other languages using the same rule', () => {
  for (const [language, word, label] of [
    ['ja', '城', 'Japanese'],
    ['hi', 'पानी', 'Hindi'],
    ['ur', 'پانی', 'Urdu'],
  ] as const) {
    const html = renderToStaticMarkup(<ScriptLinks targets={[{ word, language }]} />)
    expect(html).toContain(`${label} entries`)
    expect(html).toContain(`lang="${language}"`)
    expect(html).toContain('dir="auto"')
    expect(html).not.toContain('Japanese lookup')
  }
  const mixed = renderToStaticMarkup(
    <ScriptLinks
      targets={[
        { word: '城', language: 'ja' },
        { word: 'पानी', language: 'hi' },
      ]}
    />
  )
  expect(mixed).toContain('Other language entries')
  expect(mixed).toContain('Japanese ')
  expect(mixed).toContain('Hindi ')
})
