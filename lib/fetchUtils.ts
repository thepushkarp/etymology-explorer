/**
 * Fetch wrapper with AbortController-based timeout.
 * Prevents external sources from hanging requests indefinitely.
 * An optional caller signal (e.g. request.signal from a disconnected
 * client) is composed with the timeout via AbortSignal.any so either
 * one cancels the underlying request.
 */

export async function fetchWithTimeout(
  url: string | URL | Request,
  options: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const composedSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal

  try {
    return await fetch(url, { ...options, signal: composedSignal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      // Caller-initiated cancellation propagates as-is; only convert
      // our own timeout abort into a descriptive timeout error.
      if (signal?.aborted) {
        throw error
      }
      throw new Error(`Request timeout after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
