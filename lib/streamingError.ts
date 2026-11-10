import type { ScriptTarget, StreamEvent, WordSuggestion } from '@/lib/types'
import { normalizeScriptTargets } from './scriptTargets'

export interface StreamingUiError {
  type: 'nonsense' | 'network-error' | 'typo'
  message: string
  suggestions: WordSuggestion[]
  otherScripts?: ScriptTarget[]
}

export function toStreamingUiError(
  event: Extract<StreamEvent, { type: 'error' }>
): StreamingUiError {
  const offers = normalizeScriptTargets(event.otherScripts)
  const metadata = offers.length ? { otherScripts: offers } : {}
  if (event.errorType === 'nonsense') {
    return {
      type: 'nonsense',
      message: event.message,
      suggestions: [],
      ...metadata,
    }
  }

  if (event.errorType === 'typo') {
    return {
      type: 'typo',
      message: event.message,
      suggestions: (event.suggestions ?? []).map((word) => ({ word, distance: 0 })),
      ...metadata,
    }
  }

  return {
    type: 'network-error',
    message: event.message,
    suggestions: [],
    ...metadata,
  }
}
