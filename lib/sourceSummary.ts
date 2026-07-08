/**
 * Compact summary of the source-fetch phase, carried into the synthesis view
 * once the individual source chips are swapped out. Pure and presentational —
 * the type-only `SourceProgress` import is erased, so nothing new enters the
 * runtime module graph.
 */

import type { SourceProgress } from './streamReducer'

export interface SourceSummary {
  /** Sources that finished successfully */
  completed: number
  /** Sources that failed */
  failed: number
  /** Sources that settled either way (completed + failed) */
  settled: number
  /** Denominator for the summary line — never-emitting optimistic seeds are
   * excluded, so this equals `settled` rather than the seeded source count */
  total: number
  /** Wall-clock time for the parallel fetch = max timing over completed
   * sources (parallel ⇒ wall ≈ max, not sum); null when none reported timing */
  wallMs: number | null
  /** True when at least one source settled and none failed */
  allSucceeded: boolean
}

export function summarizeSources(sources: SourceProgress[]): SourceSummary {
  let completed = 0
  let failed = 0
  let wallMs: number | null = null

  for (const source of sources) {
    if (source.status === 'complete') {
      completed += 1
      if (typeof source.timing === 'number') {
        wallMs = wallMs === null ? source.timing : Math.max(wallMs, source.timing)
      }
    } else if (source.status === 'failed') {
      failed += 1
    }
  }

  const settled = completed + failed

  return {
    completed,
    failed,
    settled,
    total: settled,
    wallMs,
    allSucceeded: settled > 0 && failed === 0,
  }
}

/**
 * Render the summary as a single muted line, or null when nothing has settled.
 *
 * Examples: "6 sources · 2.3s", "1 source · 0.8s", "5 of 6 sources · 2.4s",
 * "0 of 3 sources" (all failed ⇒ no wall time).
 */
export function formatSourceSummary(summary: SourceSummary): string | null {
  if (summary.settled === 0) return null

  const noun = summary.total === 1 ? 'source' : 'sources'
  const count = summary.allSucceeded
    ? `${summary.total} ${noun}`
    : `${summary.completed} of ${summary.total} ${noun}`

  if (summary.wallMs === null) return count

  return `${count} · ${(summary.wallMs / 1000).toFixed(1)}s`
}
