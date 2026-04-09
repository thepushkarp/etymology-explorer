import { describe, expect, test } from 'bun:test'
import { toStreamingUiError } from '@/lib/streamingError'

describe('streamingError', () => {
  test('maps nonsense SSE errors to the nonsense UI without a network hint', () => {
    expect(
      toStreamingUiError({
        type: 'error',
        message: "That's not a word — though it does have a certain Proto-Keyboard charm.",
        errorType: 'nonsense',
      })
    ).toEqual({
      type: 'nonsense',
      message: "That's not a word — though it does have a certain Proto-Keyboard charm.",
      suggestions: [],
    })
  })

  test('maps typo SSE errors to the typo UI with clickable suggestions', () => {
    expect(
      toStreamingUiError({
        type: 'error',
        message: `Hmm, we couldn't find "teh".`,
        errorType: 'typo',
        suggestions: ['the', 'tech'],
      })
    ).toEqual({
      type: 'typo',
      message: `Hmm, we couldn't find "teh".`,
      suggestions: [
        { word: 'the', distance: 0 },
        { word: 'tech', distance: 0 },
      ],
    })
  })

  test('keeps network SSE errors mapped to the network UI', () => {
    expect(
      toStreamingUiError({
        type: 'error',
        message: 'The etymology engine took too long to respond. Please try again.',
        errorType: 'network',
      })
    ).toEqual({
      type: 'network-error',
      message: 'The etymology engine took too long to respond. Please try again.',
      suggestions: [],
    })
  })
})
