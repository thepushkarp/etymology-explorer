import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntryNavigation } from './EntryNavigation'
import { entryNavigation } from '@/lib/entryNavigation'

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
