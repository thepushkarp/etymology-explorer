import { expect, test } from 'bun:test'
import { relevantScriptTargets } from './scriptTargets'
import { etymologyResult } from './testSupport/etymologyResult'
import type { ScriptTarget } from './types'

test('an unrelated Japanese romanization stays out of existing results, with explicit lookup preserved', () => {
  const targets: ScriptTarget[] = [
    { word: 'サモサ', language: 'ja' },
    { word: 'समोसा', language: 'hi' },
  ]
  const result = etymologyResult({
    word: 'samosa',
    ancestryGraph: {
      branches: [
        {
          root: 'sambōsag',
          stages: [
            { stage: 'Middle Persian', form: 'sambōsag', note: '' },
            { stage: 'Hindustani', form: 'समोसा', note: '' },
          ],
        },
      ],
    },
  })
  expect(relevantScriptTargets(targets, [result])).toEqual([targets[1]])
  expect(relevantScriptTargets(targets, [result], 'ja')).toEqual(targets)
})

test('a Japanese connection in a secondary history remains discoverable', () => {
  const result = etymologyResult({ word: 'shiro', definition: 'A stew.' })
  result.histories.push(
    ...etymologyResult({
      word: 'shiro',
      definition: 'Fungal mycelium.',
      ancestryGraph: {
        branches: [{ root: '城', stages: [{ stage: 'Japanese', form: '城', note: '' }] }],
      },
    }).histories
  )
  const targets: ScriptTarget[] = [{ word: 'しろ', language: 'ja' }]
  expect(relevantScriptTargets(targets, [result])).toEqual(targets)
  expect(relevantScriptTargets(targets, [{ language: 'ja' }])).toEqual(targets)
  expect(relevantScriptTargets(targets, [])).toEqual([])
})
