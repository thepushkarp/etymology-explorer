import { expect, test } from 'bun:test'
import {
  parseEtymonlineText,
  parseWiktionaryText,
  formatParsedChainsForPrompt,
} from './etymologyParser'

test('an institution founding date is not a word attestation', () => {
  const chain = parseWiktionaryText(
    'The Bank of England is one of the first modern central banks, established in 1694.\nInherited from Middle English banke.\n1625, Francis Bacon: Let it be no bank or common stock.',
    'bank'
  )
  expect(chain.dateAttested).toBeUndefined()
  expect(formatParsedChainsForPrompt([chain])).not.toContain('First attested: 1694')
})
test('explicit lexical attestation and Etymonline opening dates survive', () => {
  expect(
    parseWiktionaryText('First attested in 1625. From Middle French banque.', 'bank').dateAttested
  ).toBe('1625')
  expect(parseEtymonlineText('1590s, from Latin perfidia.', 'perfidy').dateAttested).toBe('1590s')
})
