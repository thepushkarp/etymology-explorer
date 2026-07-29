import { describe, expect, test } from 'bun:test'
import { getLlmUsageFromError, isRecoverableBetaValidationError } from '@/lib/llm'

describe('getLlmUsageFromError', () => {
  test('extracts usage attached to a failed-synthesis error', () => {
    const error = Object.assign(new Error('Failed to parse LLM response'), {
      usage: { inputTokens: 3800, outputTokens: 1200, costUSD: 0.0082 },
    })

    expect(getLlmUsageFromError(error)).toEqual({
      inputTokens: 3800,
      outputTokens: 1200,
      costUSD: 0.0082,
    })
  })

  test('returns undefined for transport errors without usage', () => {
    expect(getLlmUsageFromError(new Error('OpenRouter request timeout after 90000ms'))).toBe(
      undefined
    )
  })

  test('returns undefined for non-error values and malformed usage shapes', () => {
    expect(getLlmUsageFromError(null)).toBe(undefined)
    expect(getLlmUsageFromError('boom')).toBe(undefined)
    expect(getLlmUsageFromError(Object.assign(new Error('x'), { usage: 'not-usage' }))).toBe(
      undefined
    )
    expect(
      getLlmUsageFromError(Object.assign(new Error('x'), { usage: { inputTokens: 'many' } }))
    ).toBe(undefined)
  })
})

describe('isRecoverableBetaValidationError', () => {
  test('admits selected-language post-processing validation failures', () => {
    expect(
      isRecoverableBetaValidationError(
        new Error('Schema validation failed: model changed the source-defined history set'),
        'es'
      )
    ).toBe(true)
  })

  test('does not retry English or non-validation failures', () => {
    const validationError = new Error('Schema validation failed: primary history is missing')

    expect(isRecoverableBetaValidationError(validationError, 'en')).toBe(false)
    expect(isRecoverableBetaValidationError(new Error('OpenRouter request failed'), 'it')).toBe(
      false
    )
  })
})
