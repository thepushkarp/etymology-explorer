import type { LookupSupport } from './types'

// These are evidence tiers, not calibrated probabilities or ancestry confidence.
// Ties preserve source order; popularity and model scores cannot break them.
const supportRank: Record<LookupSupport, number> = {
  verified: 2,
  linked: 1,
  unverified: 0,
}

export function compareLookupSupport(a: LookupSupport, b: LookupSupport): number {
  return supportRank[b] - supportRank[a]
}

/** A source-defined relationship admits research; display still needs a matching history. */
export function canTraceLookup(support: LookupSupport): boolean {
  return support === 'verified' || support === 'linked'
}
