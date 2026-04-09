import { describe, expect, test } from 'bun:test'
import {
  buildRootExtractionRequest,
  buildSynthesisRequest,
  extractOutputText,
  extractUsage,
} from '@/lib/openrouterResponses'

describe('openrouterResponses', () => {
  test('buildSynthesisRequest uses OpenRouter responses config for gpt-5.4-mini', () => {
    const request = buildSynthesisRequest('Analyze this word')

    expect(request.model).toBe('openai/gpt-5.4-mini')
    expect(request.reasoning).toEqual({ effort: 'medium' })
    expect(request.max_output_tokens).toBe(4096)
    expect(request.text.format).toMatchObject({
      type: 'json_schema',
      name: 'etymology_result',
      strict: true,
    })
    expect('temperature' in request).toBe(false)
  })

  test('buildRootExtractionRequest keeps the same no-temperature reasoning defaults', () => {
    const request = buildRootExtractionRequest('Analyze roots')

    expect(request.model).toBe('openai/gpt-5.4-mini')
    expect(request.reasoning).toEqual({ effort: 'medium' })
    expect(request.max_output_tokens).toBe(100)
    expect(request.text.format).toMatchObject({
      type: 'json_schema',
      name: 'root_array',
      strict: true,
    })
    expect('temperature' in request).toBe(false)
  })

  test('extractOutputText prefers output_text and falls back to output content text', () => {
    expect(extractOutputText({ output_text: '{"ok":true}' })).toBe('{"ok":true}')

    expect(
      extractOutputText({
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: '{"fallback":true}' },
              { type: 'other_ignored' },
            ],
          },
        ],
      })
    ).toBe('{"fallback":true}')
  })

  test('extractUsage normalizes token counts from the responses payload', () => {
    expect(
      extractUsage({
        usage: {
          input_tokens: 12,
          output_tokens: 34,
        },
      })
    ).toEqual({ inputTokens: 12, outputTokens: 34 })
  })
})
