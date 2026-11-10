import { describe, expect, test } from 'bun:test'
import {
  initialStreamState,
  streamReducer,
  toPartialResult,
  type StreamAction,
  type StreamState,
} from './streamReducer'
import type { WordEntry, StreamEvent } from './types'
import type { PartialEtymology } from './streamReducer'
import { etymologyResult } from '@/lib/testSupport/etymologyResult'

function run(actions: StreamAction[], from: StreamState = initialStreamState): StreamState {
  return actions.reduce(streamReducer, from)
}

function events(...list: StreamEvent[]): StreamAction[] {
  return list.map((event) => ({ type: 'stream_event', event }))
}

const LANGUAGE_RESULT = etymologyResult({
  word: 'perfidious',
  pronunciation: '/pərˈfɪdiəs/',
  definition: 'Deceitful and untrustworthy.',
  lore: 'A story.',
})
const RESULT: WordEntry = {
  word: LANGUAGE_RESULT.word,
  languages: ['en'],
  entries: { en: LANGUAGE_RESULT },
  otherLanguages: [],
  tracedAt: '2026-11-10T00:00:00.000Z',
  revision: 1,
}

describe('search_started', () => {
  test('canonical identity survives reconnects and is cleared for a new search', () => {
    const state = run([
      { type: 'search_started' },
      ...events({ type: 'entry_identity', word: '津波', requestedWord: 'つなみ', language: 'ja' }),
      { type: 'stream_reconnecting' },
    ])
    expect(state.identity?.word).toBe('津波')
    expect(state.identity?.language).toBe('ja')
    expect(streamReducer(state, { type: 'search_started' }).identity).toBeUndefined()
  })

  test('starts empty so source events define the providers for every language', () => {
    const state = run([{ type: 'search_started' }])

    expect(state.status).toBe('loading')
    expect(state.phase).toBe('sources')
    expect(state.sources).toEqual([])
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
    expect(state.phase).toBe('sources')
  })

  test('keeps the saved result through a same-word retry and reconnect', () => {
    const previous = run(events({ type: 'result', data: RESULT }))
    const retry = run(
      [{ type: 'search_started', word: RESULT.word }, { type: 'stream_reconnecting' }],
      previous
    )
    expect(retry.status).toBe('loading')
    expect(retry.result).toBe(RESULT)
    expect(run([{ type: 'search_started', word: 'another' }], retry).result).toBeNull()
  })
})

describe('source events', () => {
  test('parallel language progress keeps source outcomes, sections, and failures independent', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'source_started', source: 'wiktionaryEnglish' },
        { type: 'languages_resolved', languages: ['en', 'fr'], otherLanguages: ['Dutch'] },
        { type: 'source_complete', source: 'wiktionaryNative', timing: 12, language: 'en' },
        { type: 'source_failed', source: 'wiktionaryNative', error: 'timeout', language: 'fr' },
        { type: 'synthesis_section', section: 'definition', data: 'English entry', language: 'en' },
        { type: 'language_failed', language: 'fr', message: 'French unavailable' },
        { type: 'result', data: { ...RESULT, otherLanguages: ['Dutch'] } }
      ),
    ])
    expect(state.sources).toHaveLength(1)
    expect(state.byLanguage.en?.sources[0].status).toBe('complete')
    expect(state.byLanguage.fr?.sources[0].status).toBe('failed')
    expect(state.byLanguage.en?.sections.definition).toBe('English entry')
    expect(state.byLanguage.fr?.sections).toEqual({})
    expect(state.byLanguage.fr?.error).toBe('French unavailable')
    expect(state.phase).toBe('done')
    expect(state.languages).toEqual(['en', 'fr'])
    expect(state.otherLanguages).toEqual(['Dutch'])
  })

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
      ...events({ type: 'source_complete', source: 'Incels Wiki', timing: 300 }),
    ])

    const source = state.sources.find((s) => s.key === 'incelswiki')
    expect(source?.status).toBe('complete')
    expect(state.sources).toHaveLength(1)
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

    expect(state.sources).toHaveLength(1)
    expect(state.sources[0]).toMatchObject({ key: 'somefuturewiki', status: 'complete' })
  })

  test('labels other-language providers without leaving English providers pending', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'source_started', source: 'wiktionaryEnglish' },
        { type: 'source_started', source: 'wiktionaryNative' },
        { type: 'source_started', source: 'multilingualDictionary' },
        { type: 'source_started', source: 'wikidataLexeme' },
        { type: 'source_started', source: 'dicionarioAberto' }
      ),
    ])

    expect(state.sources).toEqual([
      { key: 'wiktionaryenglish', label: 'English Wiktionary', status: 'pending' },
      { key: 'wiktionarynative', label: 'Native Wiktionary', status: 'pending' },
      { key: 'multilingualdictionary', label: 'FreeDictionaryAPI', status: 'pending' },
      { key: 'wikidatalexeme', label: 'Wikidata Lexemes', status: 'pending' },
      { key: 'dicionarioaberto', label: 'Dicionário Aberto', status: 'pending' },
    ])
  })

  test('failure marks the source failed', () => {
    const state = run([
      { type: 'search_started' },
      ...events({ type: 'source_failed', source: 'wikipedia', error: 'timeout' }),
    ])

    expect(state.sources.find((s) => s.key === 'wikipedia')?.status).toBe('failed')
  })

  test('source outcomes distinguish missing entries from blocks and allow recovery', () => {
    const state = run(
      events(
        { type: 'source_outcome', source: 'incelsWiki', outcome: { status: 'not_found' } },
        {
          type: 'source_outcome',
          source: 'etymonline',
          outcome: { status: 'blocked', reason: 'Browser challenge' },
        },
        { type: 'source_outcome', source: 'deMauro', outcome: { status: 'budget_skipped' } }
      )
    )
    expect(state.sources.map((source) => source.status)).toEqual([
      'not_found',
      'blocked',
      'budget_skipped',
    ])
    expect(state.sources[1].reason).toBe('Browser challenge')
    const recovered = run(
      events({
        type: 'source_outcome',
        source: 'etymonline',
        outcome: { status: 'found' },
        timing: 500,
      }),
      state
    )
    expect(recovered.sources[1]).toMatchObject({ status: 'complete', timing: 500 })
    expect(recovered.sources[1].reason).toBeUndefined()
  })

  test('concurrent jobs keep a provider pending and retain successes across later misses', () => {
    let state = run(
      events(
        { type: 'source_started', source: 'exa', activityId: 'one', language: 'fr' },
        { type: 'source_started', source: 'exa', activityId: 'two', language: 'fr' },
        { type: 'source_complete', source: 'exa', activityId: 'one', timing: 10, language: 'fr' },
        {
          type: 'source_outcome',
          source: 'exa',
          activityId: 'one',
          outcome: { status: 'found' },
          language: 'fr',
        },
        {
          type: 'source_outcome',
          source: 'exa',
          activityId: 'es',
          outcome: { status: 'unavailable' },
          language: 'es',
        }
      )
    )
    expect(state.byLanguage.fr?.sources[0]).toMatchObject({
      label: 'Exa retrieval',
      status: 'pending',
    })
    state = run(
      events(
        {
          type: 'source_outcome',
          source: 'exa',
          activityId: 'two',
          outcome: { status: 'no_evidence' },
          language: 'fr',
        },
        { type: 'source_started', source: 'exa', activityId: 'one', language: 'fr' }
      ),
      state
    )
    expect(state.byLanguage.fr?.sources[0].status).toBe('complete')
    expect(state.byLanguage.es?.sources[0].status).toBe('unavailable')
    expect(Object.keys(state.byLanguage.fr?.sources[0].activities ?? {})).toHaveLength(2)
    expect(state.sources).toEqual([])
  })

  test('reconnection clears source jobs before a new server session reuses its IDs', () => {
    const previous = run(
      events(
        { type: 'source_started', source: 'wikipedia', activityId: 'old' },
        {
          type: 'source_outcome',
          source: 'exa',
          activityId: '1',
          outcome: { status: 'found' },
          language: 'en',
        },
        { type: 'source_started', source: 'exa', activityId: '2', language: 'en' },
        { type: 'synthesis_section', section: 'definition', data: 'An entry.', language: 'en' }
      )
    )
    const reconnected = run(
      [
        { type: 'stream_reconnecting' },
        ...events({ type: 'source_started', source: 'exa', activityId: '1', language: 'en' }),
      ],
      previous
    )
    expect(reconnected.sources).toEqual([])
    expect(reconnected.byLanguage.en?.sources[0].status).toBe('pending')
    expect(Object.keys(reconnected.byLanguage.en?.sources[0].activities ?? {})).toEqual(['1'])
    expect(reconnected.byLanguage.en?.sections.definition).toBe('An entry.')
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
    expect(state.phase).toBe('sources')

    state = run(events({ type: 'synthesis_started' }), state)
    expect(state.phase).toBe('synthesis')
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
  test('sections accumulate without losing earlier data', () => {
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

    expect(state.sections.word).toBe('perfidious')
    expect(state.sections.lore).toBe('A story.')
    expect(state.sections.ancestryGraph).toEqual({ branches: [] })
  })

  test('a repeated section replaces its previous data', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'synthesis_section', section: 'word', data: 'first' },
        { type: 'synthesis_section', section: 'word', data: 'second' }
      ),
    ])

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
  test('both result transports restore failed tabs from durable metadata', () => {
    const partial: WordEntry = {
      ...RESULT,
      failedLanguages: {
        fr: {
          kind: 'transient',
          message: 'The French entry is temporarily unavailable.',
          retryAt: '2099-01-01T00:00:00.000Z',
        },
      },
    }
    for (const action of [
      { type: 'stream_event', event: { type: 'result', data: partial } },
      { type: 'fallback_success', result: partial },
    ] as StreamAction[]) {
      const state = run([action])
      expect(state.languages).toEqual(['en', 'fr'])
      expect(state.result?.languages).toEqual(['en'])
      expect(run([{ type: 'stream_reconnecting' }], state).languages).toEqual(['en', 'fr'])
    }
  })

  test('result completes the stream', () => {
    const state = run([
      { type: 'search_started' },
      ...events(
        { type: 'roots_identified', roots: ['fides'] },
        { type: 'synthesis_started' },
        { type: 'enrichment_done', highConfidence: 3, mediumConfidence: 1 },
        { type: 'result', data: RESULT }
      ),
    ])

    expect(state.status).toBe('success')
    expect(state.phase).toBe('done')
    expect(state.result).toEqual(RESULT)
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

describe('fallback', () => {
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
})

describe('script target metadata', () => {
  test('resolution offers survive terminal errors and fallback errors then reset on a new search', () => {
    const otherScripts = [{ word: 'नमस्ते', language: 'hi' as const }]
    const resolved = run(
      events({ type: 'languages_resolved', languages: ['en'], otherLanguages: [], otherScripts })
    )
    const failed = run(
      events({ type: 'error', message: 'No entry', errorType: 'nonsense' }),
      resolved
    )
    expect(failed.otherScripts).toEqual(otherScripts)
    expect(failed.error?.otherScripts).toEqual(otherScripts)
    const fallback = run(
      [
        {
          type: 'fallback_error',
          error: { type: 'network-error', message: 'Failed', suggestions: [] },
        },
      ],
      resolved
    )
    expect(fallback.error?.otherScripts).toEqual(otherScripts)
    expect(run([{ type: 'search_started' }], failed).otherScripts).toBeUndefined()
  })

  test('both result transports retain script offers', () => {
    const otherScripts = [{ word: 'नमस्ते', language: 'hi' as const }]
    for (const action of [
      { type: 'stream_event', event: { type: 'result', data: { ...RESULT, otherScripts } } },
      { type: 'fallback_success', result: { ...RESULT, otherScripts } },
    ] as StreamAction[]) {
      expect(run([action]).otherScripts).toEqual(otherScripts)
    }
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

  test('keeps the entry language and its streamed English prose', () => {
    const sections: PartialEtymology = {
      definition: 'A representative instance.',
      examples: [{ text: 'Un exemple frappant.', translation: 'A striking example.' }],
    }

    const partial = toPartialResult('exemple', sections, 'fr')

    expect(partial.language).toBe('fr')
    expect(partial.definition).toBe('A representative instance.')
    expect(partial.examples).toEqual(sections.examples)
    expect(partial.lore).toBe('')
  })
})
