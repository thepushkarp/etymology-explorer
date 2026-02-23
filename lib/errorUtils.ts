/**
 * Error sanitization utilities.
 * Prevents API keys and secrets from leaking into logs.
 */

const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9\-_]{20,}/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
  /Bearer\s+[a-zA-Z0-9._\-]{20,}/gi, // Bearer tokens
  /[a-zA-Z0-9_]*api[_-]?key[:\s="']+\S{20,}/gi, // Generic API key assignments
]

/**
 * Extract a safe error message from an unknown error value.
 * Redacts any detected secrets before returning.
 */
export function safeError(error: unknown): string {
  let message: string

  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  } else {
    try {
      message = JSON.stringify(error)
    } catch {
      message = String(error)
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexps
    pattern.lastIndex = 0
    message = message.replace(pattern, '[REDACTED]')
  }

  return message
}
