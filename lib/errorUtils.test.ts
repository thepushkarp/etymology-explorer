import { describe, expect, test } from 'bun:test'
import { safeError } from '@/lib/errorUtils'

describe('safeError secret redaction', () => {
  test('redacts bare OpenRouter keys (no Bearer prefix)', () => {
    const message = `401 invalid key sk-or-v1-${'a1b2c3d4'.repeat(8)} rejected`

    const safe = safeError(new Error(message))

    expect(safe).not.toInclude('sk-or-v1-a1b2c3d4')
    expect(safe).toInclude('[REDACTED]')
  })

  test('redacts Upstash-style REST tokens', () => {
    const token = 'AX4gACQgOTk1MmYtNGE3Yi04ZDNjLTBiMWU2YzJhZjQ5ZQ=='
    const safe = safeError(`fetch failed for https://usw1-example.upstash.io with ${token}`)

    expect(safe).not.toInclude(token)
    expect(safe).toInclude('[REDACTED]')
  })

  test('still redacts Anthropic keys and Bearer tokens', () => {
    const safe = safeError(
      `sk-ant-api03-${'x'.repeat(24)} and Authorization: Bearer ${'y'.repeat(32)}`
    )

    expect(safe).not.toInclude('sk-ant-api03')
    expect(safe).not.toInclude('y'.repeat(32))
  })

  test('redacts exact configured secret values wherever they appear', () => {
    const previous = process.env.ETYMOLOGY_KV_REST_API_TOKEN
    process.env.ETYMOLOGY_KV_REST_API_TOKEN = 'plain-looking-token-value-123'
    try {
      const safe = safeError('POST failed: token=plain-looking-token-value-123 in body')
      expect(safe).not.toInclude('plain-looking-token-value-123')
      expect(safe).toInclude('[REDACTED]')
    } finally {
      if (previous === undefined) {
        delete process.env.ETYMOLOGY_KV_REST_API_TOKEN
      } else {
        process.env.ETYMOLOGY_KV_REST_API_TOKEN = previous
      }
    }
  })

  test('leaves ordinary error messages untouched', () => {
    const message = 'Antidisestablishmentarianism failed to parse after 5000ms'

    expect(safeError(new Error(message))).toBe(message)
  })

  test('handles non-Error values', () => {
    expect(safeError({ code: 'ECONNRESET' })).toBe('{"code":"ECONNRESET"}')
    expect(safeError('plain string')).toBe('plain string')
  })
})
