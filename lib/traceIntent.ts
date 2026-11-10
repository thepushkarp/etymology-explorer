import { canonicalizeWord, isValidWord } from './validation'
/**
 * In-app navigation signal for /word/{word} pages.
 *
 * COST INVARIANT: an uncached word page may auto-start a live trace (an LLM
 * call) ONLY when the visit came from an in-app navigation. The signal is a
 * short-lived sessionStorage flag written by the navigation handler right
 * before router.push — something a direct load or a crawler fetching the
 * URL (even one executing JS, like Googlebot) can never carry. Everyone
 * else gets the explicit "Trace it live" button.
 */

import type { LanguageCode } from './languages'

const STORAGE_KEY = 'etymex:trace-intent'

/** An intent older than this is stale (leftover from an interrupted
 *  navigation or a restored tab) and must not auto-trace. */
const INTENT_TTL_MS = 30_000

interface TraceIntent {
  word: string
  hint?: LanguageCode
  at: number
}

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    // Storage access can throw (privacy modes, sandboxed iframes)
    return null
  }
}

/** Record that the next word-page visit is an in-app navigation for `word` */
export function markTraceIntent(word: string, hint?: LanguageCode): void {
  if (!isValidWord(word)) return
  const storage = getStorage()
  if (!storage) return
  try {
    const intent: TraceIntent = { word: canonicalizeWord(word), hint, at: Date.now() }
    storage.setItem(STORAGE_KEY, JSON.stringify(intent))
  } catch {
    // Quota/security errors just mean the visit behaves like a direct load
  }
}

/**
 * Check and clear the in-app navigation signal. Single-use: the flag is
 * removed on ANY word-page view (matching or not) so a stale intent can
 * never auto-trace a later direct load.
 */
function takeTraceIntent(word: string): TraceIntent | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    storage.removeItem(STORAGE_KEY)

    const intent = JSON.parse(raw) as Partial<TraceIntent>
    if (typeof intent.word !== 'string' || typeof intent.at !== 'number') return null
    if (!isValidWord(intent.word) || !isValidWord(word)) return null

    if (
      canonicalizeWord(intent.word) !== canonicalizeWord(word) ||
      Date.now() - intent.at >= INTENT_TTL_MS
    )
      return null
    return intent as TraceIntent
  } catch {
    return null
  }
}

export function consumeTraceIntent(word: string): boolean {
  return takeTraceIntent(word) !== null
}

/**
 * Defer intent consumption until effect setup survives the current task.
 * React Strict Mode replays setup/cleanup synchronously: its first cleanup
 * cancels this task before consuming the single-use flag or opening a request.
 */
export function scheduleTraceIntent(
  word: string,
  hint: LanguageCode | undefined,
  start: (word: string, hint?: LanguageCode) => void
): () => void {
  const timer = setTimeout(() => {
    const intent = takeTraceIntent(word)
    if (intent) start(word, hint ?? intent.hint)
  }, 0)
  return () => clearTimeout(timer)
}
