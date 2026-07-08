import { describe, expect, test } from 'bun:test'
import { formatSourceSummary, summarizeSources } from './sourceSummary'
import type { SourceProgress } from './streamReducer'

function source(key: string, status: SourceProgress['status'], timing?: number): SourceProgress {
  return { key, label: key, status, ...(timing !== undefined ? { timing } : {}) }
}

describe('summarizeSources', () => {
  test('counts completed, failed, and settled', () => {
    const summary = summarizeSources([
      source('a', 'complete', 1000),
      source('b', 'complete', 2000),
      source('c', 'failed'),
    ])

    expect(summary.completed).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.settled).toBe(3)
    expect(summary.total).toBe(3)
    expect(summary.allSucceeded).toBe(false)
  })

  test('excludes pending sources from the total', () => {
    const summary = summarizeSources([
      source('a', 'complete', 1000),
      source('b', 'pending'),
      source('c', 'pending'),
    ])

    expect(summary.settled).toBe(1)
    expect(summary.total).toBe(1)
    expect(summary.completed).toBe(1)
  })

  test('wall time is the max timing over completed sources', () => {
    const summary = summarizeSources([
      source('a', 'complete', 1000),
      source('b', 'complete', 2300),
      source('c', 'complete', 1500),
    ])

    expect(summary.wallMs).toBe(2300)
    expect(summary.allSucceeded).toBe(true)
  })

  test('wall time is null when no completed source reported timing', () => {
    const summary = summarizeSources([source('a', 'complete'), source('b', 'failed')])

    expect(summary.wallMs).toBeNull()
  })

  test('nothing settled yields an empty summary', () => {
    const summary = summarizeSources([source('a', 'pending'), source('b', 'pending')])

    expect(summary.settled).toBe(0)
    expect(summary.total).toBe(0)
    expect(summary.allSucceeded).toBe(false)
  })
})

describe('formatSourceSummary', () => {
  test('all succeeded, plural', () => {
    const sources = Array.from({ length: 6 }, (_, i) => source(`s${i}`, 'complete', 1000 + i * 200))
    expect(formatSourceSummary(summarizeSources(sources))).toBe('6 sources · 2.0s')
  })

  test('all succeeded, singular', () => {
    expect(formatSourceSummary(summarizeSources([source('a', 'complete', 800)]))).toBe(
      '1 source · 0.8s'
    )
  })

  test('one failed shows the completed-of-total form', () => {
    const sources = [
      ...Array.from({ length: 5 }, (_, i) => source(`s${i}`, 'complete', 2400 - i * 100)),
      source('f', 'failed'),
    ]
    expect(formatSourceSummary(summarizeSources(sources))).toBe('5 of 6 sources · 2.4s')
  })

  test('all failed omits the wall time', () => {
    const sources = Array.from({ length: 3 }, (_, i) => source(`f${i}`, 'failed'))
    expect(formatSourceSummary(summarizeSources(sources))).toBe('0 of 3 sources')
  })

  test('nothing settled returns null', () => {
    expect(formatSourceSummary(summarizeSources([source('a', 'pending')]))).toBeNull()
  })

  test('rounds wall time to one decimal', () => {
    const summary = summarizeSources([source('a', 'complete', 2345)])
    expect(formatSourceSummary(summary)).toBe('1 source · 2.3s')
  })
})
