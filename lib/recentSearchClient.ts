import { canonicalizeWord, isValidWord } from './validation'

/** Only explicit navigation and successful live traces call this function. */
export async function recordRecentSearchIntent(word: string): Promise<void> {
  if (!isValidWord(word)) return
  try {
    const response = await fetch('/api/recent-searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: canonicalizeWord(word) }),
      keepalive: true,
    })
    if (!response.ok) console.warn('[RecentSearches] Recording unavailable:', response.status)
  } catch {
    // A failed preview update must not interrupt navigation or a completed trace.
    console.warn('[RecentSearches] Recording unavailable')
  }
}
