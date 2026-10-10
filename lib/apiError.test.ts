import { describe, expect, test } from 'bun:test'
import { classifyApiError } from '@/lib/apiError'

describe('apiError', () => {
  test('maps OpenRouter timeouts to a retryable network-style message', () => {
    const classified = classifyApiError(
      new Error('Streaming failed: OpenRouter request timeout after 120000ms')
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

test('context overflow is explicit and never claims a network timeout', () => {
  const classified = classifyApiError(
    new Error('400 context_length_exceeded: maximum context length')
  )
  expect(classified.status).toBe(422)
  expect(classified.message).toContain('No sources were truncated')
})
test('output exhaustion has a distinct response', () => {
  expect(
    classifyApiError(new Error('OpenRouter response incomplete: max_output_tokens')).message
  ).toContain('output limit')
})
