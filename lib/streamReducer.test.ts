import { describe, expect, test } from 'bun:test'
import {
  initialStreamState,
  streamReducer,
  toPartialResult,
  type StreamAction,
  type StreamState,
} from './streamReducer'
import type { EtymologyResult, StreamEvent } from './types'

function run(actions: StreamAction[], from: StreamState = initialStreamState): StreamState {
  return actions.reduce(streamReducer, from)
}

function events(...list: StreamEvent[]): StreamAction[] {
  return list.map((event) => ({ type: 'stream_event', event }))
}

const RESULT: EtymologyResult = {
  word: 'perfidious',
  pronunciation: '/pərˈfɪdiəs/',
  definition: 'Deceitful and untrustworthy.',
  roots: [],
  ancestryGraph: { branches: [] },
  lore: 'A story.',
  sources: [],
}

describe('search_started', () => {
  test('seeds a loading state with all six sources pending', () => {
    const state = run([{ type: 'search_started' }])

    expect(state.status).toBe('loading')
    expect(state.phase).toBe('sources')
    expect(state.sources).toHaveLength(6)
    expect(state.sources.map((s) => s.key)).toEqual([
      'etymonline',
      'wiktionary',
      'freedictionary',
      'wikipedia',
      'urbandictionary',
      'incelswiki',
    ])
    expect(state.sources.every((s) => s.status === 'pending')).toBe(true)
  })

  test('clears any previous search state', () => {
    const previous = run([
      { type: 'search_started' },
      ...events(
        { type: 'synthesis_started' },
        { type: 'synthesis_section', section: 'word', data: 'old' },
        { type: 'result', data: RESULT }
      ),
    ])

    const state = streamReducer(previous, { type: 'search_started' })

    expect(state.result).toBeNull()
    expect(state.sections).toEqual({})
    expect(state.sectionOrder).toEqual([])
    expect(state.phase).toBe('sources')
  })
})

describe('source events', () => {
  test('completion records status and timing', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'source_started', source: 'etymonline' },
        { type: 'source_complete', source: 'etymonline', timing: 812 }
      ),
    ])

    const etymonline = state.sources.find((s) => s.key === 'etymonline')
    expect(etymonline?.status).toBe('complete')
    expect(etymonline?.timing).toBe(812)
  })

  test('normalizes source names with spaces and case', () => {
    const state = run([
      { type: 'search_started' },
      ...events({ type: 'source_complete', source: 'Urban Dictionary', timing: 300 }),
    ])

    const urban = state.sources.find((s) => s.key === 'urbandictionary')
    expect(urban?.status).toBe('complete')
    expect(state.sources).toHaveLength(6) // matched the seeded entry, no duplicate
  })

  test('out-of-order completion before start still lands', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'source_complete', source: 'wiktionary', timing: 512 },
        { type: 'source_started', source: 'wiktionary' }
      ),
    ])

    const wiktionary = state.sources.find((s) => s.key === 'wiktionary')
    expect(wiktionary?.status).toBe('complete')
    expect(wiktionary?.timing).toBe(512)
  })

  test('unknown sources are appended rather than dropped', () => {
    const state = run([
      { type: 'search_started' },
      ...events({ type: 'source_complete', source: 'somefuturewiki', timing: 100 }),
    ])

    expect(state.sources).toHaveLength(7)
    expect(state.sources[6]).toMatchObject({ key: 'somefuturewiki', status: 'complete' })
  })

  test('failure marks the source failed', () => {
    const state = run([
      { type: 'search_started' },
      ...events({ type: 'source_failed', source: 'wikipedia', error: 'timeout' }),
    ])

    expect(state.sources.find((s) => s.key === 'wikipedia')?.status).toBe('failed')
  })

  test('root_research events do not produce a new state reference', () => {
    const before = run([{ type: 'search_started' }])
    const after = streamReducer(before, {
      type: 'stream_event',
      event: { type: 'root_research', root: 'fides', source: 'etymonline', status: 'ok' },
    })

    expect(after).toBe(before)
  })
})

describe('phases', () => {
  test('parsing and synthesis transitions', () => {
    let state = run([
      { type: 'search_started' },
      ...events({ type: 'parsing_complete', chainCount: 2 }),
    ])
    expect(state.parsingComplete).toBe(true)
    expect(state.phase).toBe('sources')

    state = run(events({ type: 'synthesis_started' }), state)
    expect(state.phase).toBe('synthesis')
  })

  test('roots are recorded', () => {
    const state = run([
      { type: 'search_started' },
      ...events({ type: 'roots_identified', roots: ['tele', 'phone'] }),
    ])
    expect(state.roots).toEqual(['tele', 'phone'])
  })

  test('singleflight wait is surfaced', () => {
    const state = run([
      { type: 'search_started' },
      ...events({ type: 'singleflight_wait', waitedMs: 4000 }),
    ])
    expect(state.sharedWaitMs).toBe(4000)
  })
})

describe('section accumulation', () => {
  test('sections accumulate in arrival order with their data', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'synthesis_started' },
        { type: 'synthesis_section', section: 'word', data: 'perfidious' },
        { type: 'synthesis_section', section: 'pronunciation', data: '/pərˈfɪdiəs/' },
        { type: 'synthesis_section', section: 'definition', data: 'Deceitful.' },
        { type: 'synthesis_section', section: 'ancestryGraph', data: { branches: [] } },
        { type: 'synthesis_section', section: 'lore', data: 'A story.' }
      ),
    ])

    expect(state.sectionOrder).toEqual([
      'word',
      'pronunciation',
      'definition',
      'ancestryGraph',
      'lore',
    ])
    expect(state.sections.word).toBe('perfidious')
    expect(state.sections.lore).toBe('A story.')
    expect(state.sections.ancestryGraph).toEqual({ branches: [] })
  })

  test('a repeated section replaces data without duplicating the order entry', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'synthesis_section', section: 'word', data: 'first' },
        { type: 'synthesis_section', section: 'word', data: 'second' }
      ),
    ])

    expect(state.sectionOrder).toEqual(['word'])
    expect(state.sections.word).toBe('second')
  })

  test('unknown section names are ignored', () => {
    const before = run([{ type: 'search_started' }])
    const after = streamReducer(before, {
      type: 'stream_event',
      event: { type: 'synthesis_section', section: 'futureField', data: 42 },
    })

    expect(after).toBe(before)
  })

  test('a section without a prior synthesis_started still enters the synthesis phase', () => {
    const state = run([
      { type: 'search_started' },
      ...events({ type: 'synthesis_section', section: 'word', data: 'perfidious' }),
    ])

    expect(state.phase).toBe('synthesis')
  })
})

describe('terminal events', () => {
  test('result completes the stream', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'synthesis_started' },
        { type: 'enrichment_done', highConfidence: 3, mediumConfidence: 1 },
        { type: 'result', data: RESULT }
      ),
    ])

    expect(state.status).toBe('success')
    expect(state.phase).toBe('done')
    expect(state.result).toEqual(RESULT)
    expect(state.enrichment).toEqual({ highConfidence: 3, mediumConfidence: 1 })
  })

  test('error events map to a UI error', () => {
    const state = run([
      { type: 'search_started' },
      ...events({
        type: 'error',
        message: 'Did you mean:',
        errorType: 'typo',
        suggestions: ['nice'],
      }),
    ])

    expect(state.status).toBe('error')
    expect(state.phase).toBe('error')
    expect(state.error).toEqual({
      type: 'typo',
      message: 'Did you mean:',
      suggestions: [{ word: 'nice', distance: 0 }],
    })
  })

  test('a late section after result does not regress the phase', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'result', data: RESULT },
        { type: 'synthesis_section', section: 'lore', data: 'late' }
      ),
    ])

    expect(state.phase).toBe('done')
    expect(state.status).toBe('success')
  })
})

describe('fallback and reset', () => {
  test('fallback_success behaves like a result event', () => {
    const state = run([{ type: 'search_started' }, { type: 'fallback_success', result: RESULT }])

    expect(state.status).toBe('success')
    expect(state.phase).toBe('done')
    expect(state.result).toEqual(RESULT)
  })

  test('fallback_error surfaces the error', () => {
    const state = run([
      { type: 'search_started' },
      {
        type: 'fallback_error',
        error: { type: 'network-error', message: 'Search failed', suggestions: [] },
      },
    ])

    expect(state.status).toBe('error')
    expect(state.error?.message).toBe('Search failed')
  })

  test('reset returns to the initial state', () => {
    const state = run([
      { type: 'search_started' },
      ...events({ type: 'result', data: RESULT }),
      { type: 'reset' },
    ])

    expect(state).toEqual(initialStreamState)
  })
})

describe('toPartialResult', () => {
  test('falls back to the searched word and empty defaults before sections arrive', () => {
    const partial = toPartialResult('perfidious', {})

    expect(partial.word).toBe('perfidious')
    expect(partial.pronunciation).toBe('')
    expect(partial.definition).toBe('')
    expect(partial.roots).toEqual([])
    expect(partial.ancestryGraph).toEqual({ branches: [] })
    expect(partial.sources).toEqual([])
  })

  test('prefers streamed sections and attaches the ngram when supplied', () => {
    const ngram = { word: 'perfidious', data: [{ year: 1900, count: 5 }], corpus: 'en' }
    const partial = toPartialResult(
      'perfidious',
      { word: 'perfidious', definition: 'Deceitful.' },
      ngram
    )

    expect(partial.definition).toBe('Deceitful.')
    expect(partial.ngram).toBe(ngram)
  })
})
