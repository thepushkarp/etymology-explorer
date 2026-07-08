'use client'

import { formatSourceSummary, summarizeSources } from '@/lib/sourceSummary'
import type { SourceProgress } from '@/lib/streamReducer'

interface SourceSummaryLineProps {
  sources: SourceProgress[]
}

/**
 * Compact residue of the source chips, carried into the synthesis view beneath
 * the persistent header. Echoes the `sources` eyebrow style and visually rhymes
 * with the final card's Sources section without duplicating it. Renders nothing
 * until at least one source has settled.
 */
export function SourceSummaryLine({ sources }: SourceSummaryLineProps) {
  const line = formatSourceSummary(summarizeSources(sources))
  if (!line) return null

  return (
    <p className="mt-5 text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">{line}</p>
  )
}
