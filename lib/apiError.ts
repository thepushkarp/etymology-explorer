type StreamErrorType = 'rate_limit' | 'budget' | 'network' | 'unknown'

export interface ClassifiedApiError {
  message: string
  status: number
  streamErrorType: StreamErrorType
}

const AUTH_PATTERNS = [
  '401',
  'invalid_api_key',
  'authentication_error',
  'api key not valid',
  'unauthenticated',
  'permission_denied',
]

const RATE_LIMIT_PATTERNS = ['429', 'rate limit', 'too many requests']

const NETWORK_PATTERNS = [
  'timeout',
  'timed out',
  'abort',
  'fetch failed',
  'networkerror',
  'econnreset',
  'socket hang up',
  'bad gateway',
  '502',
  '503',
  '504',
  'connection error',
  'upstream error',
]

const MALFORMED_RESPONSE_PATTERNS = [
  'failed to parse llm response',
  'failed to parse streamed llm response',
  'could not parse a json object from model output',
  'schema validation failed',
  'no text response from openai responses api',
  'streaming completed without output text',
]

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return String(error)
}

function includesAny(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => message.includes(pattern))
}

export function classifyApiError(error: unknown): ClassifiedApiError {
  const message = getErrorMessage(error).toLowerCase()

  if (includesAny(message, AUTH_PATTERNS)) {
    return {
      message: 'Service temporarily unavailable',
      status: 503,
      streamErrorType: 'unknown',
    }
  }

  if (includesAny(message, RATE_LIMIT_PATTERNS)) {
    return {
      message: 'Service is busy, please try again shortly',
      status: 429,
      streamErrorType: 'rate_limit',
    }
  }

  if (includesAny(message, NETWORK_PATTERNS)) {
    return {
      message: 'The etymology engine took too long to respond. Please try again.',
      status: 503,
      streamErrorType: 'network',
    }
  }

  if (includesAny(message, MALFORMED_RESPONSE_PATTERNS)) {
    return {
      message: 'The etymology engine returned an unreadable response. Please try again.',
      status: 503,
      streamErrorType: 'unknown',
    }
  }

  return {
    message: 'An unexpected error occurred. Please try again.',
    status: 500,
    streamErrorType: 'unknown',
  }
}
