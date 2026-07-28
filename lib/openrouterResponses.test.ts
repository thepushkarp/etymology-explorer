import { describe, expect, test } from 'bun:test'
import {
  buildRootExtractionRequest,
  buildSynthesisRequest,
  extractOutputText,
  reduceStreamEvent,
  extractUsage,
} from '@/lib/openrouterResponses'

describe('openrouterResponses', () => {
  test('buildSynthesisRequest uses strict json_schema mode with low reasoning', () => {
    const request = buildSynthesisRequest('Analyze this word')

    expect(request.model).toBe('openai/gpt-5.6-luna')
    expect(request.reasoning).toEqual({ effort: 'low', exclude: true })
    expect(request.models).toEqual(['openai/gpt-5.4-mini', 'google/gemini-3.5-flash'])
    expect(request.max_output_tokens).toBe(9000)
    expect(request.text.format).toMatchObject({
      type: 'json_schema',
      name: 'etymology_result',
      strict: true,
      schema: { type: 'object', additionalProperties: false },
    })
    expect(request.provider).toEqual({ require_parameters: true })
    expect('temperature' in request).toBe(false)
  })

  test('selects the strict paired-prose schema for an explicit beta language', () => {
    const request = buildSynthesisRequest('Analizza casa', undefined, 'it')
    const format = request.text.format
    expect(format.type).toBe('json_schema')
    if (format.type !== 'json_schema') throw new Error('expected json schema')
    const schema = format.schema as {
      properties: { language: { enum: string[] }; definition: { properties: object } }
    }
    expect(schema.properties.language.enum).toContain('it')
    expect(Object.keys(schema.properties.definition.properties)).toEqual(['en', 'local'])
  })

  test('buildSynthesisRequest adapts reasoning to model capabilities', () => {
    expect(buildSynthesisRequest('Analyze', 'openai/gpt-5.6-luna').reasoning).toEqual({
      effort: 'low',
      exclude: true,
    })
    expect(buildSynthesisRequest('Analyze', 'google/gemini-3.5-flash').reasoning).toEqual({
      effort: 'low',
      exclude: true,
    })
    expect(buildSynthesisRequest('Analyze', 'moonshotai/kimi-k2.6').reasoning).toEqual({
      enabled: false,
      exclude: true,
    })
    expect(buildSynthesisRequest('Analyze', 'z-ai/glm-5.2').reasoning).toEqual({
      enabled: false,
      exclude: true,
    })
    expect(buildSynthesisRequest('Analyze', 'minimax/minimax-m3').reasoning).toEqual({
      enabled: false,
      exclude: true,
    })
    expect(buildSynthesisRequest('Analyze', 'xiaomi/mimo-v2.5').reasoning).toEqual({
      effort: 'none',
      exclude: true,
    })
    expect(buildSynthesisRequest('Analyze', 'tencent/hy3').reasoning).toEqual({
      effort: 'none',
      exclude: true,
    })
    expect('reasoning' in buildSynthesisRequest('Analyze', 'deepseek/deepseek-v4-flash')).toBe(
      false
    )
  })

  test('buildRootExtractionRequest keeps Luna reasoning low and private', () => {
    const request = buildRootExtractionRequest('Analyze roots')

    expect(request.model).toBe('openai/gpt-5.6-luna')
    expect(request.reasoning).toEqual({ effort: 'low', exclude: true })
    expect(request.models).toEqual(['openai/gpt-5.4-mini', 'google/gemini-3.5-flash'])
    // require_parameters is synthesis-only: adding it here slow-routed the
    // ~100-token extraction call from ~1s to 15s+ in live tests.
    expect('provider' in request).toBe(false)
    expect(request.max_output_tokens).toBe(100)
    expect(request.text.format).toMatchObject({
      type: 'json_schema',
      name: 'root_object',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['roots'],
        properties: {
          roots: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    })
    expect('temperature' in request).toBe(false)
  })

  test('an explicit model override does not inherit production fallbacks', () => {
    const request = buildSynthesisRequest('Analyze', 'openai/gpt-5.6-luna')

    expect(request.model).toBe('openai/gpt-5.6-luna')
    expect('models' in request).toBe(false)
    expect(request.reasoning).toEqual({ effort: 'low', exclude: true })
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

  test('extractOutputText includes payload shape details when no text is present', () => {
    expect(() =>
      extractOutputText({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        max_output_tokens: 4096,
        usage: {
          output_tokens_details: {
            reasoning_tokens: 4096,
          },
        },
        output: [
          {
            type: 'message',
            content: [{ type: 'refusal' }],
          },
        ],
      })
    ).toThrow(
      'No text response from OpenRouter Responses API (status=incomplete, incomplete=max_output_tokens, reasoningTokens=4096, maxOutputTokens=4096, output=message[refusal])'
    )
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

  test('reduceStreamEvent handles both output_text and content_part streaming variants', () => {
    expect(
      reduceStreamEvent(
        {
          fullText: '',
          finalResponse: null,
        },
        {
          type: 'response.output_text.delta',
          delta: 'Hello',
        }
      )
    ).toEqual({
      emittedText: 'Hello',
      fullText: 'Hello',
      finalResponse: null,
    })

    expect(
      reduceStreamEvent(
        {
          fullText: 'Hello',
          finalResponse: null,
        },
        {
          type: 'response.content_part.delta',
          delta: ' world',
        }
      )
    ).toEqual({
      emittedText: ' world',
      fullText: 'Hello world',
      finalResponse: null,
    })
  })

  test('reduceStreamEvent captures finalized text when OpenRouter sends done events', () => {
    expect(
      reduceStreamEvent(
        {
          fullText: '',
          finalResponse: null,
        },
        {
          type: 'response.output_text.done',
          text: 'Hello world',
        }
      )
    ).toEqual({
      emittedText: 'Hello world',
      fullText: 'Hello world',
      finalResponse: null,
    })

    expect(
      reduceStreamEvent(
        {
          fullText: 'Hello',
          finalResponse: null,
        },
        {
          type: 'response.content_part.done',
          part: {
            type: 'output_text',
            text: 'Hello world',
          },
        }
      )
    ).toEqual({
      emittedText: ' world',
      fullText: 'Hello world',
      finalResponse: null,
    })
  })

  test('reduceStreamEvent accepts both response completion event shapes', () => {
    const response = { output_text: '{"ok":true}' }

    expect(
      reduceStreamEvent(
        {
          fullText: '',
          finalResponse: null,
        },
        {
          type: 'response.completed',
          response,
        }
      )
    ).toEqual({
      emittedText: '',
      fullText: '',
      finalResponse: response,
    })

    expect(
      reduceStreamEvent(
        {
          fullText: '',
          finalResponse: null,
        },
        {
          type: 'response.done',
          response,
        }
      )
    ).toEqual({
      emittedText: '',
      fullText: '',
      finalResponse: response,
    })
  })

  test('reduceStreamEvent throws OpenRouter top-level stream errors', () => {
    expect(() =>
      reduceStreamEvent(
        {
          fullText: 'partial',
          finalResponse: null,
        },
        {
          error: {
            message: 'Provider disconnected unexpectedly',
          },
        }
      )
    ).toThrow('Provider disconnected unexpectedly')
  })

  test('reduceStreamEvent never forwards reasoning deltas as user-visible text', () => {
    expect(
      reduceStreamEvent(
        {
          fullText: 'visible',
          finalResponse: null,
        },
        {
          type: 'response.reasoning_summary_text.delta',
          delta: 'private reasoning',
        }
      )
    ).toEqual({
      emittedText: '',
      fullText: 'visible',
      finalResponse: null,
    })
  })
})
