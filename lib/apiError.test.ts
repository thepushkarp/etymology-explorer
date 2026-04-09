import { describe, expect, test } from 'bun:test'
import { classifyApiError } from '@/lib/apiError'

describe('apiError', () => {
  test('maps OpenAI timeouts to a retryable network-style message', () => {
    const classified = classifyApiError(
      new Error('Streaming failed: OpenAI request timeout after 120000ms')
    )

    expect(classified).toEqual({
      message: 'The etymology engine took too long to respond. Please try again.',
      status: 503,
      streamErrorType: 'network',
    })
  })

  test('maps malformed provider output to a specific service response message', () => {
    const classified = classifyApiError(
      new Error(
        'Failed to parse streamed LLM response: Could not parse a JSON object from model output'
      )
    )

    expect(classified).toEqual({
      message: 'The etymology engine returned an unreadable response. Please try again.',
      status: 503,
      streamErrorType: 'unknown',
    })
  })
})
