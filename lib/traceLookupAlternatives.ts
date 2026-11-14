import { canTraceLookup, compareLookupSupport } from './lookupEvidence'
import type { ApiResponse, LookupGroup, WordEntry } from './types'

/** Run only for an explicit search. Each distinct destination retains its normal
 * server budget, cache and lock. Source-linked candidates qualify regardless of count.
 * Never refresh saved entries or retry a failed request automatically. */
export async function traceLookupAlternatives(
  word: string,
  entry: WordEntry,
  signal: AbortSignal,
  publish: (group: LookupGroup | undefined) => void
): Promise<string | undefined> {
  const seen = new Set([entry.word])
  let failure: string | undefined
  async function readGroup() {
    const response = await fetch(`/api/lookup-group?word=${encodeURIComponent(word)}`, { signal })
    if (!response.ok) throw new Error(`Lookup navigation returned HTTP ${response.status}`)
    const data: { group: LookupGroup | null } = await response.json()
    signal.throwIfAborted()
    publish(data.group ?? undefined)
    return data.group
  }
  let group = await readGroup()
  if (!group) return
  while (group) {
    signal.throwIfAborted()
    const target = [...group.members]
      .filter((candidate) => canTraceLookup(candidate.lookupSupport))
      .sort((a, b) => compareLookupSupport(a.lookupSupport, b.lookupSupport))
      .find(
        (candidate) =>
          candidate.language === 'ja' &&
          !seen.has(candidate.word) &&
          !group?.choices.some((choice) => choice.word === candidate.word)
      )
    if (!target) break
    seen.add(target.word)
    const params = new URLSearchParams({ word: target.word, language: target.language })
    try {
      const response = await fetch(`/api/etymology?${params}`, { signal, cache: 'no-store' })
      const payload: ApiResponse<WordEntry> = await response.json()
      signal.throwIfAborted()
      if (!response.ok || !payload.success || !payload.data?.entries.ja) {
        // Confirmed absence stays hidden. Outages and limits remain retryable,
        // and global/rate limits stop the batch instead of starting more work.
        if (response.status !== 404)
          failure = `Could not load related entry “${target.word}”: ${payload.error ?? `HTTP ${response.status}`}`
        if ([402, 429, 503].includes(response.status)) break
      } else {
        group = await readGroup()
      }
    } catch (error) {
      signal.throwIfAborted()
      throw new Error(`Could not load related entry “${target.word}”`, { cause: error })
    }
  }
  // API-declared failures are recoverable UI state, not client exceptions.
  // The caller keeps published entries visible and offers an explicit retry.
  return failure
}
