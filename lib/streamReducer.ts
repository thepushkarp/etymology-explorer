/**
 * Pure reducer for the streaming etymology search.
 *
 * Every SSE event folds into one structured progress state: per-source
 * fetch states with timing, a coarse UI phase (drives progress display and
 * aria-live announcements), and the synthesis sections accumulated in
 * arrival (= schema render) order. Consumers read this state directly —
 * there is no growing event array to rebuild from on every render.
 */

import type {
  DisplayEtymologyResult,
  EnglishEtymologyResult,
  EtymologyResult,
  NgramResult,
  StreamEvent,
} from './types'
import { StreamingUiError, toStreamingUiError } from './streamingError'

export type StreamStatus = 'idle' | 'loading' | 'success' | 'error'

/** Coarse pipeline phase for progress UI and screen-reader announcements */
export type StreamPhase = 'idle' | 'sources' | 'synthesis' | 'done' | 'error'

export type SourceStatus = 'pending' | 'complete' | 'failed'

export interface SourceProgress {
  key: string
  label: string
  status: SourceStatus
  timing?: number
}

/** Top-level synthesis sections, named and ordered exactly as in the LLM schema */
export const SECTION_KEYS = [
  'word',
  'pronunciation',
  'definition',
  'ancestryGraph',
  'roots',
  'lore',
  'partsOfSpeech',
  'suggestions',
  'modernUsage',
  'sources',
] as const

export type SectionKey = (typeof SECTION_KEYS)[number]

/** Progressive slice of the final result, hydrated one section at a time */
export type PartialEtymology = Partial<Pick<EnglishEtymologyResult, SectionKey>>

/**
 * Fill the streamed sections into a full-shaped EtymologyResult, defaulting
 * every not-yet-arrived field to an empty value. Shared by the persistent
 * TraceHeader and the StreamingEtymologyCard body so their partial-render
 * views never drift.
 */
export function toPartialResult(
  word: string,
  sections: PartialEtymology,
  ngram?: NgramResult | null
): DisplayEtymologyResult {
  return {
    language: 'en',
    word: sections.word ?? word,
    pronunciation: sections.pronunciation ?? '',
    definition: sections.definition ?? '',
    roots: sections.roots ?? [],
    ancestryGraph: sections.ancestryGraph ?? { branches: [] },
    lore: sections.lore ?? '',
    sources: sections.sources ?? [],
    partsOfSpeech: sections.partsOfSpeech,
    suggestions: sections.suggestions,
    modernUsage: sections.modernUsage,
    ngram: ngram ?? undefined,
  }
}

export interface StreamState {
  status: StreamStatus
  phase: StreamPhase
  sources: SourceProgress[]
  parsingComplete: boolean
  roots: string[]
  /** Section names in arrival order (schema order under strict outputs) */
  sectionOrder: SectionKey[]
  sections: PartialEtymology
  enrichment: { highConfidence: number; mediumConfidence: number } | null
  /** Non-null while this request is waiting on another in-flight lookup */
  sharedWaitMs: number | null
  result: EtymologyResult | null
  error: StreamingUiError | null
}

export type StreamAction =
  | { type: 'search_started' }
  | { type: 'stream_event'; event: StreamEvent }
  | { type: 'fallback_success'; result: EtymologyResult }
  | { type: 'fallback_error'; error: StreamingUiError }
  | { type: 'reset' }

const SOURCE_LABELS: Record<string, string> = {
  etymonline: 'Etymonline',
  wiktionary: 'Wiktionary',
  freedictionary: 'Free Dictionary',
  wikipedia: 'Wikipedia',
  urbandictionary: 'Urban Dictionary',
  incelswiki: 'Incels Wiki',
}

const DEFAULT_SOURCE_ORDER = [
  'etymonline',
  'wiktionary',
  'freedictionary',
  'wikipedia',
  'urbandictionary',
  'incelswiki',
]

function normalizeSourceKey(source: string): string {
  return source.toLowerCase().replace(/\s+/g, '')
}

function defaultSources(): SourceProgress[] {
  return DEFAULT_SOURCE_ORDER.map((key) => ({
    key,
    label: SOURCE_LABELS[key] ?? key,
    status: 'pending',
  }))
}

/**
 * Update one source's status, appending it if unknown so out-of-order
 * events (a completion before its start) still land.
 */
function upsertSource(
  sources: SourceProgress[],
  rawSource: string,
  patch: Partial<Pick<SourceProgress, 'status' | 'timing'>>
): SourceProgress[] {
  const key = normalizeSourceKey(rawSource)
  const existing = sources.find((source) => source.key === key)
  if (!existing) {
    return [
      ...sources,
      { key, label: SOURCE_LABELS[key] ?? rawSource, status: 'pending', ...patch },
    ]
  }
  return sources.map((source) => (source.key === key ? { ...source, ...patch } : source))
}

function isSectionKey(section: string): section is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(section)
}

export const initialStreamState: StreamState = {
  status: 'idle',
  phase: 'idle',
  sources: [],
  parsingComplete: false,
  roots: [],
  sectionOrder: [],
  sections: {},
  enrichment: null,
  sharedWaitMs: null,
  result: null,
  error: null,
}

function applyStreamEvent(state: StreamState, event: StreamEvent): StreamState {
  switch (event.type) {
    case 'source_started':
      return { ...state, sources: upsertSource(state.sources, event.source, {}) }

    case 'source_complete':
      return {
        ...state,
        sources: upsertSource(state.sources, event.source, {
          status: 'complete',
          timing: event.timing,
        }),
      }

    case 'source_failed':
      return { ...state, sources: upsertSource(state.sources, event.source, { status: 'failed' }) }

    case 'parsing_complete':
      return { ...state, parsingComplete: true }

    case 'roots_identified':
      return { ...state, roots: event.roots }

    case 'root_research':
      // Progress detail the UI doesn't surface — skip the re-render entirely.
      return state

    case 'synthesis_started':
      return { ...state, phase: 'synthesis' }

    case 'synthesis_section': {
      if (!isSectionKey(event.section)) return state
      const alreadySeen = state.sectionOrder.includes(event.section)
      return {
        ...state,
        // Sections only stream while synthesis runs; tolerate a missing
        // synthesis_started rather than rendering them as source progress.
        phase: state.phase === 'done' || state.phase === 'error' ? state.phase : 'synthesis',
        sections: { ...state.sections, [event.section]: event.data },
        sectionOrder: alreadySeen ? state.sectionOrder : [...state.sectionOrder, event.section],
      }
    }

    case 'singleflight_wait':
      return { ...state, sharedWaitMs: event.waitedMs }

    case 'enrichment_done':
      return {
        ...state,
        enrichment: {
          highConfidence: event.highConfidence,
          mediumConfidence: event.mediumConfidence,
        },
      }

    case 'result':
      return { ...state, status: 'success', phase: 'done', result: event.data, error: null }

    case 'error':
      return { ...state, status: 'error', phase: 'error', error: toStreamingUiError(event) }
  }
}

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case 'search_started':
      return {
        ...initialStreamState,
        status: 'loading',
        phase: 'sources',
        sources: defaultSources(),
      }

    case 'stream_event':
      return applyStreamEvent(state, action.event)

    case 'fallback_success':
      return { ...state, status: 'success', phase: 'done', result: action.result, error: null }

    case 'fallback_error':
      return { ...state, status: 'error', phase: 'error', error: action.error }

    case 'reset':
      return initialStreamState
  }
}
