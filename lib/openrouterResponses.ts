import { CONFIG } from '@/lib/config'
import { getEnv } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/fetchUtils'
import type { LlmUsage } from '@/lib/types'

const ROOTS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['roots'],
  properties: {
    roots: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

type TextFormat = {
  type: 'text'
}

type JsonSchemaFormat = {
  type: 'json_schema'
  name: string
  strict: true
  schema: object
}

type ReasoningEffort = 'low' | 'medium' | 'high' | 'minimal' | 'none' | 'xhigh'

export type OpenRouterRequest = {
  model: string
  input: string
  reasoning: { effort: ReasoningEffort }
  max_output_tokens: number
  text: { format: JsonSchemaFormat | TextFormat }
  instructions?: string
}

type OpenRouterResponseContentItem = {
  type?: string
  text?: string
}

type OpenRouterResponseOutputItem = {
  type?: string
  content?: OpenRouterResponseContentItem[]
}

type OpenRouterUsage = {
  input_tokens?: number
  output_tokens?: number
  cost?: number | null // OpenRouter-reported USD cost (present on unary + streaming)
  output_tokens_details?: {
    reasoning_tokens?: number
  } | null
}

type OpenRouterIncompleteDetails = {
  reason?: string | null
}

export type OpenRouterResponseLike = {
  status?: string | null
  output_text?: string | null
  output?: OpenRouterResponseOutputItem[]
  usage?: OpenRouterUsage | null
  incomplete_details?: OpenRouterIncompleteDetails | null
  max_output_tokens?: number | null
  error?: {
    message?: string
  } | null
}

type OpenRouterStreamEvent = {
  type?: string
  delta?: string
  text?: string
  part?: {
    type?: string
    text?: string
  }
  response?: OpenRouterResponseLike
  error?: {
    message?: string
  }
}

const OPENROUTER_RESPONSES_URL = 'https://openrouter.ai/api/v1/responses'

function buildRequest(
  input: string,
  maxOutputTokens: number,
  format: JsonSchemaFormat | TextFormat,
  reasoningEffort: ReasoningEffort,
  model?: string
): OpenRouterRequest {
  return {
    model: model ?? CONFIG.model,
    input,
    reasoning: { effort: reasoningEffort },
    max_output_tokens: maxOutputTokens,
    text: { format },
  }
}

export function buildSynthesisRequest(input: string, model?: string): OpenRouterRequest {
  return buildRequest(input, CONFIG.synthesisMaxTokens, { type: 'text' }, 'low', model)
}

export function buildRootExtractionRequest(input: string): OpenRouterRequest {
  return buildRequest(
    input,
    CONFIG.rootExtractionMaxTokens,
    {
      type: 'json_schema',
      name: 'root_object',
      strict: true,
      schema: ROOTS_JSON_SCHEMA,
    },
    'none'
  )
}

type StreamAccumulator = {
  fullText: string
  finalResponse: OpenRouterResponseLike | null
}

type StreamReduction = StreamAccumulator & {
  emittedText: string
}

function finalizeStreamText(state: StreamAccumulator, text: string): StreamReduction {
  if (!text) {
    return {
      emittedText: '',
      fullText: state.fullText,
      finalResponse: state.finalResponse,
    }
  }

  if (!state.fullText) {
    return {
      emittedText: text,
      fullText: text,
      finalResponse: state.finalResponse,
    }
  }

  if (text.startsWith(state.fullText)) {
    const suffix = text.slice(state.fullText.length)
    return {
      emittedText: suffix,
      fullText: text,
      finalResponse: state.finalResponse,
    }
  }

  return {
    emittedText: '',
    fullText: state.fullText,
    finalResponse: state.finalResponse,
  }
}

export function reduceStreamEvent(
  state: StreamAccumulator,
  event: OpenRouterStreamEvent
): StreamReduction {
  if (
    (event.type === 'response.output_text.delta' || event.type === 'response.content_part.delta') &&
    typeof event.delta === 'string'
  ) {
    return {
      emittedText: event.delta,
      fullText: state.fullText + event.delta,
      finalResponse: state.finalResponse,
    }
  }

  if (event.type === 'response.output_text.done' && typeof event.text === 'string') {
    return finalizeStreamText(state, event.text)
  }

  if (
    event.type === 'response.content_part.done' &&
    event.part?.type === 'output_text' &&
    typeof event.part.text === 'string'
  ) {
    return finalizeStreamText(state, event.part.text)
  }

  if ((event.type === 'response.completed' || event.type === 'response.done') && event.response) {
    return {
      emittedText: '',
      fullText: state.fullText,
      finalResponse: event.response,
    }
  }

  if (
    (event.type === 'response.failed' || event.type === 'error') &&
    (event.response?.error?.message || event.error?.message)
  ) {
    throw new Error(event.response?.error?.message ?? event.error?.message)
  }

  if (event.error?.message) {
    throw new Error(event.error.message)
  }

  return {
    emittedText: '',
    fullText: state.fullText,
    finalResponse: state.finalResponse,
  }
}

export function extractOutputText(response: OpenRouterResponseLike): string {
  if (response.output_text && response.output_text.trim().length > 0) {
    return response.output_text
  }

  const fallbackText = (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text?.trim() ?? '')
    .filter((item) => item.length > 0)
    .join('')

  if (fallbackText.length > 0) {
    return fallbackText
  }

  const outputTypes = (response.output ?? [])
    .map((item) => {
      const contentTypes = (item.content ?? [])
        .map((content) => content.type ?? 'unknown')
        .join(',')
      return `${item.type ?? 'unknown'}[${contentTypes}]`
    })
    .join(';')

  const incompleteReason = response.incomplete_details?.reason ?? 'none'
  const reasoningTokens = response.usage?.output_tokens_details?.reasoning_tokens ?? 0
  const maxOutputTokens = response.max_output_tokens ?? 'unknown'

  throw new Error(
    `No text response from OpenRouter Responses API ` +
      `(status=${response.status ?? 'unknown'}, ` +
      `incomplete=${incompleteReason}, ` +
      `reasoningTokens=${reasoningTokens}, ` +
      `maxOutputTokens=${maxOutputTokens}, ` +
      `output=${outputTypes || 'none'})`
  )
}

export function extractUsage(response: OpenRouterResponseLike): LlmUsage {
  const cost = response.usage?.cost
  return {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    ...(typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? { costUSD: cost } : {}),
  }
}

function extractErrorMessage(payload: unknown, status: number): string {
  const prefix = `${status}`

  if (payload && typeof payload === 'object') {
    const maybe = payload as {
      error?: { message?: string }
      message?: string
    }

    if (typeof maybe.error?.message === 'string' && maybe.error.message.length > 0) {
      return `${prefix} ${maybe.error.message}`
    }

    if (typeof maybe.message === 'string' && maybe.message.length > 0) {
      return `${prefix} ${maybe.message}`
    }
  }

  return `OpenRouter request failed with status ${status}`
}

function buildHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getEnv().OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  }
}

export async function createOpenRouterResponse(
  request: OpenRouterRequest,
  timeoutMs: number = CONFIG.timeouts.llm,
  signal?: AbortSignal
): Promise<OpenRouterResponseLike> {
  const response = await fetchWithTimeout(
    OPENROUTER_RESPONSES_URL,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(request),
    },
    timeoutMs,
    signal
  )

  const payload = (await response.json()) as OpenRouterResponseLike
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, response.status))
  }

  if (payload.error?.message) {
    throw new Error(payload.error.message)
  }

  return payload
}

function parseSseDataBlocks(chunk: string): string[] {
  return chunk
    .split('\n\n')
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
    )
    .filter((block) => block.length > 0)
}

export async function streamOpenRouterResponse(
  request: OpenRouterRequest,
  onText: (delta: string) => void,
  timeoutMs: number = CONFIG.timeouts.llm,
  signal?: AbortSignal
): Promise<OpenRouterResponseLike> {
  const response = await fetchWithTimeout(
    OPENROUTER_RESPONSES_URL,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ ...request, stream: true }),
    },
    timeoutMs,
    signal
  )

  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    throw new Error(extractErrorMessage(payload, response.status))
  }

  if (!response.body) {
    throw new Error('OpenRouter streaming response body was empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let finalResponse: OpenRouterResponseLike | null = null

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    const boundary = buffer.lastIndexOf('\n\n')
    if (boundary !== -1) {
      const complete = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      for (const data of parseSseDataBlocks(complete)) {
        if (data === '[DONE]') {
          continue
        }

        const event = JSON.parse(data) as OpenRouterStreamEvent
        const reduced = reduceStreamEvent(
          {
            fullText,
            finalResponse,
          },
          event
        )

        fullText = reduced.fullText
        finalResponse = reduced.finalResponse

        if (reduced.emittedText.length > 0) {
          onText(reduced.emittedText)
        }
      }
    }

    if (done) {
      break
    }
  }

  if (finalResponse) {
    return finalResponse
  }

  if (fullText.length > 0) {
    return { output_text: fullText, usage: null }
  }

  throw new Error('OpenRouter streaming completed without output text')
}
