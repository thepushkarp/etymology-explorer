const SECRET_PATTERNS = [
  /(sk-[a-zA-Z0-9\-_]+)/g,
  /(Bearer\s+[a-zA-Z0-9\-_.]+)/gi,
  /(x-api-key\s*[:=]\s*[a-zA-Z0-9\-_]+)/gi,
]

export function redactSensitiveText(input: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), input)
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactSensitiveText(error.message)
  }
  return 'Unknown error'
}
