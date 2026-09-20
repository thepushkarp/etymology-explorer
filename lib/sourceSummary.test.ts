import { describe, expect, test } from 'bun:test'
import { formatSourceSummary } from './sourceSummary'
import type { SourceProgress } from './streamReducer'

function source(key: string, status: SourceProgress['status'], timing?: number): SourceProgress {
  return { key, label: key, status, ...(timing !== undefined ? { timing } : {}) }
}

describe('formatSourceSummary', () => {
  const cases: Array<[string, SourceProgress[], string | null]> = [
    ['no sources', [], null],
    ['pending only', [source('a', 'pending')], null],
    ['singular and rounded time', [source('a', 'complete', 2345)], '1 source · 2.3s'],
    [
      'parallel wall time excludes pending and failed timings',
      [
        source('a', 'complete', 2300),
        source('b', 'complete', 1000),
        source('c', 'failed', 9000),
        source('d', 'pending', 8000),
      ],
      '2 of 3 sources · 2.3s',
    ],
    [
      'all succeeded',
      [source('a', 'complete', 1000), source('b', 'complete', 2000)],
      '2 sources · 2.0s',
    ],
    ['all failed', [source('a', 'failed'), source('b', 'failed')], '0 of 2 sources'],
    [
      'missing completion timing',
      [source('a', 'complete'), source('b', 'failed')],
      '1 of 2 sources',
    ],
    ['zero elapsed time', [source('a', 'complete', 0)], '1 source · 0.0s'],
  ]

  test.each(cases)('%s', (_label, sources, expected) => {
    expect(formatSourceSummary(sources)).toBe(expected)
  })
})
