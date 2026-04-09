import { CONFIG } from '@/lib/config'
import { getEnv } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/fetchUtils'

const ROOTS_JSON_SCHEMA = {
  type: 'array',
  items: { type: 'string' },
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

export type OpenAIRequest = {
  model: string
  input: string
  reasoning: { effort: 'medium' }
  max_output_tokens: number
  text: { format: JsonSchemaFormat | TextFormat }
  instructions?: string
}

type OpenAIResponseContentItem = {
  type?: string
  text?: string
}

type OpenAIResponseOutputItem = {
  type?: string
  content?: OpenAIResponseContentItem[]
}

type OpenAIUsage = {
  input_tokens?: number
  output_tokens?: number
  output_tokens_details?: {
    reasoning_tokens?: number
  } | null
}

type OpenAIIncompleteDetails = {
  reason?: string | null
}

export type OpenAIResponseLike = {
  status?: string | null
  output_text?: string | null
  output?: OpenAIResponseOutputItem[]
  usage?: OpenAIUsage | null
  incomplete_details?: OpenAIIncompleteDetails | null
  max_output_tokens?: number | null
  error?: {
    message?: string
  } | null
}

type OpenAIStreamEvent = {
  type?: string
  delta?: string
  response?: OpenAIResponseLike
  error?: {
    message?: string
  }
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

function buildRequest(
  input: string,
  maxOutputTokens: number,
  format: JsonSchemaFormat | TextFormat
): OpenAIRequest {
  return {
    model: CONFIG.model,
    input,
    reasoning: { effort: 'medium' },
    max_output_tokens: maxOutputTokens,
    text: { format },
  }
}

export function buildSynthesisRequest(input: string): OpenAIRequest {
  return buildRequest(input, CONFIG.synthesisMaxTokens, { type: 'text' })
}

export function buildRootExtractionRequest(input: string): OpenAIRequest {
  return buildRequest(input, CONFIG.rootExtractionMaxTokens, {
    type: 'json_schema',
    name: 'root_array',
    strict: true,
    schema: ROOTS_JSON_SCHEMA,
  })
}

type StreamAccumulator = {
  fullText: string
  finalResponse: OpenAIResponseLike | null
}

type StreamReduction = StreamAccumulator & {
  emittedText: string
}

export function reduceStreamEvent(
  state: StreamAccumulator,
  event: OpenAIStreamEvent
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

  return {
    emittedText: '',
    fullText: state.fullText,
    finalResponse: state.finalResponse,
  }
}

export function extractOutputText(response: OpenAIResponseLike): string {
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
    `No text response from OpenAI Responses API ` +
      `(status=${response.status ?? 'unknown'}, ` +
      `incomplete=${incompleteReason}, ` +
      `reasoningTokens=${reasoningTokens}, ` +
      `maxOutputTokens=${maxOutputTokens}, ` +
      `output=${outputTypes || 'none'})`
  )
}

export function extractUsage(response: OpenAIResponseLike): {
  inputTokens: number
  outputTokens: number
} {
  return {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
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

  return `OpenAI request failed with status ${status}`
}

function buildHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getEnv().OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  }
}

export async function createOpenAIResponse(
  request: OpenAIRequest,
  timeoutMs = CONFIG.timeouts.llm
): Promise<OpenAIResponseLike> {
  const response = await fetchWithTimeout(
    OPENAI_RESPONSES_URL,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(request),
    },
    timeoutMs
  )

  const payload = (await response.json()) as OpenAIResponseLike
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

export async function streamOpenAIResponse(
  request: OpenAIRequest,
  onText: (delta: string) => void,
  timeoutMs = CONFIG.timeouts.llm
): Promise<OpenAIResponseLike> {
  const response = await fetchWithTimeout(
    OPENAI_RESPONSES_URL,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ ...request, stream: true }),
    },
    timeoutMs
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
    throw new Error('OpenAI streaming response body was empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let finalResponse: OpenAIResponseLike | null = null

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

        const event = JSON.parse(data) as OpenAIStreamEvent
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

  throw new Error('OpenAI streaming completed without output text')
}
