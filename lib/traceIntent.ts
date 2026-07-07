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

const STORAGE_KEY = 'etymex:trace-intent'

/** An intent older than this is stale (leftover from an interrupted
 *  navigation or a restored tab) and must not auto-trace. */
const INTENT_TTL_MS = 30_000

interface TraceIntent {
  word: string
  at: number
}

function normalizeWord(word: string): string {
  return word.normalize('NFKC').trim().toLowerCase()
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

/** Canonical in-app path for a word page */
export function wordPagePath(word: string): string {
  return `/word/${encodeURIComponent(normalizeWord(word))}`
}

/** Record that the next word-page visit is an in-app navigation for `word` */
export function markTraceIntent(word: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    const intent: TraceIntent = { word: normalizeWord(word), at: Date.now() }
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
export function consumeTraceIntent(word: string): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return false
    storage.removeItem(STORAGE_KEY)

    const intent = JSON.parse(raw) as Partial<TraceIntent>
    if (typeof intent.word !== 'string' || typeof intent.at !== 'number') return false

    return intent.word === normalizeWord(word) && Date.now() - intent.at < INTENT_TTL_MS
  } catch {
    return false
  }
}
