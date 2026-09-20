/**
 * Compact summary of the source-fetch phase, carried into the synthesis view
 * once the individual source chips are swapped out. Pure and presentational —
 * the type-only `SourceProgress` import is erased, so nothing new enters the
 * runtime module graph.
 */

import type { SourceProgress } from './streamReducer'

/** Summarize settled sources; parallel fetch time is their maximum, not their sum. */
export function formatSourceSummary(sources: readonly SourceProgress[]): string | null {
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
  if (settled === 0) return null

  const noun = settled === 1 ? 'source' : 'sources'
  const count = failed === 0 ? `${settled} ${noun}` : `${completed} of ${settled} ${noun}`

  return wallMs === null ? count : `${count} · ${(wallMs / 1000).toFixed(1)}s`
}
