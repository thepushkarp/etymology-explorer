import { expect, test } from 'bun:test'
import { deduplicatePrompt } from './prompt-dedup'

const text =
  'Complete evidence with accented māla, uncertainty, dates and final references.\n'.repeat(15)
const scoped = (id: string, source = 'wiktionary') =>
  `<source_data name="${source}" history_id="${id}" evidence_scope_id="scope:${id}">\n${text}\n</source_data>`
const full = (source: string) =>
  `<source_data name="${source}">\nPreamble\n${text}\nFinal reference\n</source_data>`

test('retains complete scoped text and independent sources while deduplicating an exact same-provider copy', () => {
  const input = [full('wiktionary'), scoped('h1'), full('etymonline')].join('\n')
  const { prompt, replacements } = deduplicatePrompt(input)
  expect(replacements).toHaveLength(1)
  expect(prompt).toContain(scoped('h1'))
  expect(prompt).toContain(full('etymonline'))
  expect(prompt).toContain('Preamble\n<source_text_reference')
  expect(prompt).toContain('Final reference')
  expect(prompt.replace(replacements[0].reference, replacements[0].text)).toBe(input)
})

test('does not select a history by matching spelling or identical text across independent histories', () => {
  const input = [full('wiktionary'), scoped('h1'), scoped('h2')].join('\n')
  expect(deduplicatePrompt(input).prompt).toBe(input)
  const secondary = [full('etymonline'), scoped('h1')].join('\n')
  expect(deduplicatePrompt(secondary).prompt).toBe(secondary)
})

test('maps native-edition metadata without changing evidence scopes or partial source matches', () => {
  const input = [scoped('h1', 'wiktionaryNative'), full('wiktionary_native_edition')].join('\n')
  const { prompt, replacements } = deduplicatePrompt(input)
  expect(replacements).toHaveLength(1)
  expect(prompt).toContain(scoped('h1', 'wiktionaryNative'))
  const unmatched = input.replace('Preamble\n' + text, 'Preamble\nA partial excerpt.')
  expect(deduplicatePrompt(unmatched).prompt).toBe(unmatched)
})
