import { StreamEvent, WordSuggestion } from '@/lib/types'

export interface StreamingUiError {
  type: 'nonsense' | 'network-error' | 'typo'
  message: string
  suggestions: WordSuggestion[]
}

export function toStreamingUiError(
  event: Extract<StreamEvent, { type: 'error' }>
): StreamingUiError {
  if (event.errorType === 'nonsense') {
    return {
      type: 'nonsense',
      message: event.message,
      suggestions: [],
    }
  }

  if (event.errorType === 'typo') {
    return {
      type: 'typo',
      message: event.message,
      suggestions: (event.suggestions ?? []).map((word) => ({ word, distance: 0 })),
    }
  }

  return {
    type: 'network-error',
    message: event.message,
    suggestions: [],
  }
}
