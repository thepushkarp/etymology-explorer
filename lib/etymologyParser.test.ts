import { expect, test } from 'bun:test'
import {
  parseEtymonlineText,
  parseWiktionaryText,
  formatParsedChainsForPrompt,
  parseDictionaryText,
} from './etymologyParser'

test('an institution founding date is not a word attestation', () => {
  const chain = parseWiktionaryText(
    'The Bank of England is one of the first modern central banks, established in 1694.\nInherited from Middle English banke.\n1625, Francis Bacon: Let it be no bank or common stock.',
    'bank'
  )
  expect(chain.dateAttested).toBeUndefined()
  expect(formatParsedChainsForPrompt([chain])).not.toContain('First attested: 1694')
})

test('specialist chains retain publisher identity and localized language abbreviations', () => {
  for (const [provider, text] of [
    ['deMauro', 'sec. XIII; dal lat. fenestra.'],
    ['dle', 'Del lat. fenestra.'],
    ['tlfi', 'Empr. au lat. fenestra.'],
    ['priberam', 'Do latim fenestra.'],
  ] as const) {
    const chain = parseDictionaryText(text, 'window', provider, {
      provider,
      historyId: 'history:window',
      evidenceScopeId: 'scope:window',
    })
    expect(chain.provider).toBe(provider)
    expect(chain.sourceFamily).toBe(provider === 'dle' ? 'raeAsale' : provider)
    expect(chain.links.map(({ language, form }) => [language, form])).toEqual([
      ['Latin', 'fenestra'],
    ])
    expect(chain.historyId).toBe('history:window')
  }
})
test('explicit lexical attestation and Etymonline opening dates survive', () => {
  expect(
    parseWiktionaryText('First attested in 1625. From Middle French banque.', 'bank').dateAttested
  ).toBe('1625')
  expect(parseEtymonlineText('1590s, from Latin perfidia.', 'perfidy').dateAttested).toBe('1590s')
})

test('historical language qualifiers are not mistaken for ancestral words', () => {
  for (const [text, language, form] of [
    ['Do latim vulgar *iānuella ‘portinha’.', 'Vulgar Latin', '*iānuella'],
    ['Del griego antiguo φλέγμα.', 'Ancient Greek', 'φλέγμα'],
    ['Du latin vulgaire *cattus.', 'Vulgar Latin', '*cattus'],
    ['Dal greco antico λόγος.', 'Ancient Greek', 'λόγος'],
    ['From Old English hūs.', 'Old English', 'hūs'],
  ]) {
    const [link] = parseDictionaryText(text, 'word', 'wiktionaryNative').links
    expect(link.language).toBe(language)
    expect(link.form).toBe(form)
    expect(link.isReconstructed).toBe(form.startsWith('*'))
    expect(text).toContain(link.rawSnippet)
  }
})
