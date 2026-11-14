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
  EtymologyEntry,
  EtymologyResult,
  WordEntry,
  StreamEvent,
  SourceOutcome,
  ScriptTarget,
  EntrySpelling,
  LookupResolution,
} from './types'
import { LANGUAGES, isLanguageCode, type LanguageCode } from './languages'
import { StreamingUiError, toStreamingUiError } from './streamingError'
import { normalizeScriptTargets } from './scriptTargets'
import { sourceKey, sourceLabel } from './sourceLabels'

export type StreamStatus = 'idle' | 'loading' | 'success' | 'error'

/** Coarse pipeline phase for progress UI and screen-reader announcements */
export type StreamPhase = 'idle' | 'sources' | 'synthesis' | 'done' | 'error'

export type SourceStatus =
  'pending' | 'complete' | 'failed' | Exclude<SourceOutcome['status'], 'found'>

export interface SourceProgress {
  key: string
  label: string
  status: SourceStatus
  timing?: number
  reason?: string
  activities?: Record<string, { status: SourceStatus; timing?: number; reason?: string }>
}

/** Top-level synthesis sections, named and ordered exactly as in the LLM schema */
export const SECTION_KEYS = [
  'word',
  'stratum',
  'pronunciation',
  'transliteration',
  'definition',
  'ancestryGraph',
  'roots',
  'lore',
  'examples',
  'partsOfSpeech',
  'suggestions',
  'modernUsage',
  'sources',
] as const

export type SectionKey = (typeof SECTION_KEYS)[number]

/** Progressive slice of the final result, hydrated one section at a time */
export type PartialEtymology = Partial<Pick<EtymologyResult, SectionKey>>

/**
 * Project the streamed sections onto a renderable entry, defaulting every
 * not-yet-arrived field to an empty value.
 */
export function toPartialResult(
  word: string,
  sections: PartialEtymology,
  language: LanguageCode = 'en'
): EtymologyEntry {
  return {
    language,
    word: sections.word ?? word,
    stratum: sections.stratum,
    pronunciation: sections.pronunciation ?? '',
    transliteration: sections.transliteration,
    definition: sections.definition ?? '',
    roots: sections.roots ?? [],
    ancestryGraph: sections.ancestryGraph ?? { branches: [] },
    lore: sections.lore ?? '',
    examples: sections.examples,
    sources: sections.sources ?? [],
    partsOfSpeech: sections.partsOfSpeech,
    suggestions: sections.suggestions,
    modernUsage: sections.modernUsage,
  }
}

export interface LanguageStreamState {
  phase: StreamPhase
  sources: SourceProgress[]
  sections: PartialEtymology
  error?: string
}

export interface StreamState {
  lookupResolution?: LookupResolution
  word?: string
  identity?: ScriptTarget & { spellings?: EntrySpelling[] }
  languages: LanguageCode[]
  otherLanguages: string[]
  otherScripts?: ScriptTarget[]
  byLanguage: Partial<Record<LanguageCode, LanguageStreamState>>
  status: StreamStatus
  phase: StreamPhase
  sources: SourceProgress[]
  sections: PartialEtymology
  /** Non-null while this request is waiting on another in-flight lookup */
  sharedWaitMs: number | null
  result: WordEntry | null
  error: StreamingUiError | null
}

export type StreamAction =
  | { type: 'search_started'; word?: string }
  | { type: 'stream_reconnecting' }
  | { type: 'stream_event'; event: StreamEvent }
  | { type: 'fallback_success'; result: WordEntry }
  | { type: 'fallback_error'; error: StreamingUiError }

/**
 * Update one source's status, appending it if unknown so out-of-order
 * events (a completion before its start) still land.
 */
function upsertSource(
  sources: SourceProgress[],
  rawSource: string,
  patch: Partial<Pick<SourceProgress, 'status' | 'timing' | 'reason'>>,
  activityId?: string
): SourceProgress[] {
  const key = sourceKey(rawSource)
  const existing = sources.find((source) => source.key === key)
  let updated: SourceProgress = existing ?? {
    key,
    label: sourceLabel(rawSource),
    status: 'pending',
  }
  if (activityId) {
    const previous = updated.activities?.[activityId]
    const activity = {
      status: 'pending' as SourceStatus,
      timing: undefined,
      reason: undefined,
      ...previous,
      ...patch,
    }
    const activities = { ...updated.activities, [activityId]: activity }
    const values = Object.values(activities)
    // A provider can read several lexemes at once. Settled siblings must not hide active work
    // or erase a usable entry just because another lexeme has no entry at that publisher.
    const summary =
      values.find((item) => item.status === 'pending') ??
      values.find((item) => item.status === 'complete') ??
      activity
    updated = { ...updated, ...summary, activities }
  } else {
    updated = { ...updated, ...patch }
  }
  return existing
    ? sources.map((source) => (source.key === key ? updated : source))
    : [...sources, updated]
}

function isSectionKey(section: string): section is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(section)
}

function resultLanguages(state: StreamState, entry: WordEntry): LanguageCode[] {
  return [
    ...new Set([
      ...state.languages,
      ...entry.languages,
      ...Object.keys(entry.failedLanguages ?? {}),
    ]),
  ]
    .filter(isLanguageCode)
    .sort((a, b) => LANGUAGES[a].priority - LANGUAGES[b].priority)
}

export const initialStreamState: StreamState = {
  languages: [],
  otherLanguages: [],
  byLanguage: {},
  status: 'idle',
  phase: 'idle',
  sources: [],
  sections: {},
  sharedWaitMs: null,
  result: null,
  error: null,
}

function applyStreamEvent(state: StreamState, event: StreamEvent): StreamState {
  if (event.type === 'lookup_resolution')
    return {
      ...state,
      lookupResolution: event.resolution,
      ...(event.resolution.selected
        ? {
            identity: {
              ...state.identity,
              word: event.resolution.selected.word,
              language: event.resolution.selected.language,
            },
          }
        : {}),
    }
  if (event.type === 'entry_identity') {
    return {
      ...state,
      identity: { word: event.word, language: event.language, spellings: event.spellings },
    }
  }
  if (event.type === 'languages_resolved') {
    return {
      ...state,
      languages: event.languages,
      otherLanguages: event.otherLanguages,
      otherScripts: normalizeScriptTargets(event.otherScripts),
    }
  }
  if (event.type === 'language_failed') {
    const slice = state.byLanguage[event.language] ?? {
      phase: 'sources',
      sources: [],
      sections: {},
    }
    return {
      ...state,
      byLanguage: {
        ...state.byLanguage,
        [event.language]: { ...slice, phase: 'error', error: event.message },
      },
    }
  }
  if (
    event.language &&
    event.type !== 'result' &&
    event.type !== 'error' &&
    event.type !== 'singleflight_wait'
  ) {
    const language = event.language
    const slice = state.byLanguage[language] ?? { phase: 'sources', sources: [], sections: {} }
    const next = applyStreamEvent(
      { ...state, phase: slice.phase, sources: slice.sources, sections: slice.sections },
      { ...event, language: undefined }
    )
    if (
      next.sources === slice.sources &&
      next.sections === slice.sections &&
      next.phase === slice.phase
    )
      return state
    return {
      ...state,
      phase:
        state.phase === 'done' || state.phase === 'error'
          ? state.phase
          : next.phase === 'synthesis'
            ? 'synthesis'
            : state.phase,
      byLanguage: {
        ...state.byLanguage,
        [language]: {
          ...slice,
          phase: next.phase,
          sources: next.sources,
          sections: next.sections,
          ...(event.type === 'synthesis_started' ? { error: undefined } : {}),
        },
      },
    }
  }
  switch (event.type) {
    case 'source_started':
      return { ...state, sources: upsertSource(state.sources, event.source, {}, event.activityId) }

    case 'source_complete':
      return {
        ...state,
        sources: upsertSource(
          state.sources,
          event.source,
          {
            status: 'complete',
            timing: event.timing,
            reason: undefined,
          },
          event.activityId
        ),
      }

    case 'source_failed':
      return {
        ...state,
        sources: upsertSource(
          state.sources,
          event.source,
          {
            status: 'failed',
            reason: event.error,
          },
          event.activityId
        ),
      }

    case 'source_outcome':
      return {
        ...state,
        sources: upsertSource(
          state.sources,
          event.source,
          {
            status: event.outcome.status === 'found' ? 'complete' : event.outcome.status,
            timing: event.timing,
            reason: event.outcome.reason,
          },
          event.activityId
        ),
      }

    case 'parsing_complete':
    case 'roots_identified':
    case 'enrichment_done':
    case 'root_research':
      // Progress detail the UI doesn't surface — skip the re-render entirely.
      return state

    case 'synthesis_started':
      return { ...state, phase: 'synthesis' }

    case 'synthesis_section': {
      if (!isSectionKey(event.section)) return state
      return {
        ...state,
        // Sections only stream while synthesis runs; tolerate a missing
        // synthesis_started rather than rendering them as source progress.
        phase: state.phase === 'done' || state.phase === 'error' ? state.phase : 'synthesis',
        sections: { ...state.sections, [event.section]: event.data },
      }
    }

    case 'singleflight_wait':
      return { ...state, sharedWaitMs: event.waitedMs }

    case 'result':
      return {
        ...state,
        status: 'success',
        phase: 'done',
        result: event.data,
        error: null,
        languages: resultLanguages(state, event.data),
        otherLanguages: event.data.otherLanguages,
        otherScripts: normalizeScriptTargets(event.data.otherScripts ?? state.otherScripts),
      }

    case 'error':
      return {
        ...state,
        status: 'error',
        phase: 'error',
        error: toStreamingUiError({
          ...event,
          otherScripts: event.otherScripts ?? state.otherScripts,
        }),
        otherScripts: normalizeScriptTargets(event.otherScripts ?? state.otherScripts),
      }
  }
}

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case 'search_started':
      return {
        ...initialStreamState,
        word: action.word,
        status: 'loading',
        phase: 'sources',
        result: action.word && state.result?.word === action.word ? state.result : null,
      }

    case 'stream_reconnecting':
      return {
        ...state,
        sources: [],
        byLanguage: Object.fromEntries(
          Object.entries(state.byLanguage).map(([language, slice]) => [
            language,
            { ...slice, sources: [] },
          ])
        ),
        sharedWaitMs: null,
      }

    case 'stream_event':
      return applyStreamEvent(state, action.event)

    case 'fallback_success':
      return {
        ...state,
        status: 'success',
        phase: 'done',
        result: action.result,
        error: null,
        languages: resultLanguages(state, action.result),
        otherLanguages: action.result.otherLanguages,
        otherScripts: normalizeScriptTargets(action.result.otherScripts ?? state.otherScripts),
      }

    case 'fallback_error':
      return {
        ...state,
        status: 'error',
        phase: 'error',
        error: { ...action.error, otherScripts: action.error.otherScripts ?? state.otherScripts },
        otherScripts: normalizeScriptTargets(action.error.otherScripts ?? state.otherScripts),
      }
  }
}
