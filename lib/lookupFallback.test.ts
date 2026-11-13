import { beforeEach, expect, mock, test } from 'bun:test'
import { CONFIG } from './config'
import type { LlmUsage } from './types'
import type { OpenRouterRequest } from './openrouterResponses'

if (process.env.LOOKUP_TEST_WORKER !== '1') {
  test('lookup proposal budget, singleflight, cancellation and spend boundaries', async () => {
    const child = Bun.spawn([process.execPath, '--no-env-file', 'test', import.meta.path], {
      env: { ...process.env, LOOKUP_TEST_WORKER: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [code, output, error] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(code, output + error).toBe(0)
  })
} else {
  const values = new Map<string, unknown>()
  const flags = { ...CONFIG.features, lookupFallback: true }
  let budget = 'normal'
  let available = true
  let calls = 0
  const spend: LlmUsage[] = []
  let gate: Promise<void> | undefined
  let invalid = false
  const usage = { inputTokens: 20, outputTokens: 10, costUSD: 0.001 }
  const redis = {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: unknown, options?: { nx?: boolean }) => {
      if (options?.nx && values.has(key)) return null
      values.set(key, value)
      return 'OK'
    },
    del: async (key: string) => values.delete(key),
  }
  mock.module('./config', () => ({ CONFIG: { ...CONFIG, features: flags } }))
  mock.module('./redis', () => ({ getRedis: () => (available ? redis : null) }))
  mock.module('./costGuard', () => ({
    getCostMode: async () => budget,
    recordSpend: async (value: LlmUsage) => {
      spend.push(value)
    },
  }))
  const transport = await import('./openrouterResponses')
  mock.module('./openrouterResponses', () => ({
    ...transport,
    createOpenRouterResponse: async (
      request: OpenRouterRequest,
      timeout: number,
      signal?: AbortSignal
    ) => {
      calls++
      expect(request.max_output_tokens).toBe(768)
      expect(request.reasoning).toMatchObject({ effort: 'low' })
      expect(request.provider).toEqual({ require_parameters: true })
      expect(timeout).toBe(15_000)
      await gate
      if (signal?.aborted) throw Object.assign(new Error('cancelled'), { usage })
      return {
        output_text: invalid
          ? '{}'
          : JSON.stringify({
              candidates: [{ word: 'たたかう', reading: 'tatakau', relationship: 'form' }],
            }),
        usage: { input_tokens: 20, output_tokens: 10, cost: 0.001 },
      }
    },
  }))
  const { proposeLookup } = await import('./lookupFallback')
  beforeEach(() => {
    values.clear()
    calls = 0
    spend.length = 0
    flags.lookupFallback = true
    available = true
    budget = 'normal'
    gate = undefined
    invalid = false
  })

  test('concurrent normalized lookups make one paid call and release the lookup lock', async () => {
    let finish!: () => void
    gate = new Promise((resolve) => {
      finish = resolve
    })
    const first = proposeLookup('tatakae', 'ja')
    while (!calls) await new Promise((resolve) => setTimeout(resolve, 1))
    await expect(proposeLookup('TATAKAE', 'ja')).rejects.toThrow('in progress')
    finish()
    const result = await first
    expect(await proposeLookup('tatakae', 'ja')).toEqual(result)
    expect(calls).toBe(1)
    expect(spend).toEqual([usage])
    expect([...values.keys()].some((key) => key.startsWith('lock:'))).toBe(false)
  })

  test('invalid output and cancellation still account usage without a retry', async () => {
    invalid = true
    expect(await proposeLookup('bad', 'ja')).toEqual([])
    expect(spend).toEqual([usage])
    const controller = new AbortController()
    let finish!: () => void
    gate = new Promise((resolve) => {
      finish = resolve
    })
    const pending = proposeLookup('cancel', 'ja', controller.signal)
    while (calls < 2) await new Promise((resolve) => setTimeout(resolve, 1))
    controller.abort()
    finish()
    await expect(pending).rejects.toThrow()
    expect(spend).toEqual([usage, usage])
    expect([...values.keys()].some((key) => key.startsWith('lock:'))).toBe(false)
  })

  test('disabled flag, exhausted budget and unavailable Redis make no paid calls', async () => {
    flags.lookupFallback = false
    expect(await proposeLookup('x', 'ja')).toEqual([])
    flags.lookupFallback = true
    budget = 'cache_only'
    expect(await proposeLookup('x', 'ja')).toEqual([])
    budget = 'normal'
    available = false
    expect(await proposeLookup('x', 'ja')).toEqual([])
    expect(calls).toBe(0)
  })
}
