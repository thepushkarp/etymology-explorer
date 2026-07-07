/**
 * Error sanitization utilities.
 * Prevents API keys and secrets from leaking into logs.
 */

const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9\-_]{20,}/g,
  /sk-or-v1-[a-zA-Z0-9]{16,}/g, // Bare OpenRouter keys (no Bearer prefix)
  /AIza[0-9A-Za-z\-_]{35}/g,
  /Bearer\s+[a-zA-Z0-9._\-]{20,}/gi, // Bearer tokens
  /[a-zA-Z0-9_]*api[_-]?key[:\s="']+\S{20,}/gi, // Generic API key assignments
  // Upstash REST tokens: long base64-ish strings starting with "A". The 36+
  // length floor keeps ordinary words (max ~29 chars in English) untouched.
  /\bA[A-Za-z0-9+/_-]{35,}={0,2}/g,
]

/** Env vars whose exact values must never appear in error messages. */
const SECRET_ENV_VARS = [
  'OPENROUTER_API_KEY',
  'ETYMOLOGY_KV_REST_API_TOKEN',
  'ELEVENLABS_API_KEY',
  'ADMIN_SECRET',
] as const

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

  // Exact-value redaction of configured secrets — catches shapes the
  // patterns above miss (e.g. tokens embedded in URLs or JSON payloads).
  for (const envVar of SECRET_ENV_VARS) {
    const value = process.env[envVar]
    if (value && value.length >= 8 && message.includes(value)) {
      message = message.split(value).join('[REDACTED]')
    }
  }

  return message
}
