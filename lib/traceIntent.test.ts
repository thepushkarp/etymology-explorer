import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

/**
 * Auto-trace gating: an uncached /word page may only start an LLM trace
 * when the in-app navigation flag is present, matching, and fresh.
 */

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }
  clear(): void {
    this.store.clear()
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

const sessionStorage = new MemoryStorage()
const globalRef = globalThis as { window?: unknown }
const originalWindow = globalRef.window
globalRef.window = { sessionStorage }

const { consumeTraceIntent, markTraceIntent, wordPagePath } = await import('./traceIntent')

afterAll(() => {
  if (originalWindow === undefined) {
    delete globalRef.window
  } else {
    globalRef.window = originalWindow
  }
})

beforeEach(() => {
  sessionStorage.clear()
})

describe('wordPagePath', () => {
  test('canonicalizes and encodes the word', () => {
    expect(wordPagePath('  Nice ')).toBe('/word/nice')
    expect(wordPagePath('Café')).toBe(`/word/${encodeURIComponent('café')}`)
  })
})

describe('consumeTraceIntent', () => {
  test('flag absent (direct load / crawler): no auto-trace', () => {
    expect(consumeTraceIntent('nice')).toBe(false)
  })

  test('flag present and matching: auto-trace exactly once', () => {
    markTraceIntent('nice')

    expect(consumeTraceIntent('nice')).toBe(true)
    // Single-use: a reload of the same page must not auto-trace again
    expect(consumeTraceIntent('nice')).toBe(false)
  })

  test('matching is canonicalized (case, whitespace, NFKC)', () => {
    markTraceIntent('  NiCe ')
    expect(consumeTraceIntent('nice')).toBe(true)
  })

  test('flag for a different word: no auto-trace, and the stale flag is cleared', () => {
    markTraceIntent('alpha')

    expect(consumeTraceIntent('beta')).toBe(false)
    // The stale flag must not linger and auto-trace a later /word/alpha load
    expect(consumeTraceIntent('alpha')).toBe(false)
  })

  test('expired flag: no auto-trace', () => {
    sessionStorage.setItem(
      'etymex:trace-intent',
      JSON.stringify({ word: 'nice', at: Date.now() - 60_000 })
    )

    expect(consumeTraceIntent('nice')).toBe(false)
  })

  test('malformed flag payloads are rejected and cleared', () => {
    sessionStorage.setItem('etymex:trace-intent', 'not-json')
    expect(consumeTraceIntent('nice')).toBe(false)

    sessionStorage.setItem('etymex:trace-intent', JSON.stringify({ word: 42 }))
    expect(consumeTraceIntent('nice')).toBe(false)
  })
})
