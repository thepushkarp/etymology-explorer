import type { StageConfidence } from '@/lib/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StageColorSet {
  bg: string
  border: string
  text: string
}

export interface BranchColorSet {
  accent: string
  line: string
}

export interface ConfidenceColorSet {
  color: string
  label: string
}

// Derived from --accent-soft (#b18b52 / #d0a05d)
const goldPalette: StageColorSet = {
  bg: 'bg-[#f0e8db] dark:bg-[#262019]',
  border: 'border-[#c4a06a] dark:border-[#8a6d40]',
  text: 'text-[#6a5530] dark:text-[#d4b878]',
}

// Derived from --accent-sky (#5e7893 / #8fa9c5)
const steelPalette: StageColorSet = {
  bg: 'bg-[#e4e8ee] dark:bg-[#1f2328]',
  border: 'border-[#88a0b8] dark:border-[#52687a]',
  text: 'text-[#405468] dark:text-[#a8bed0]',
}

// Derived from --accent-rose (#a6685b / #d08e7f)
const terracottaPalette: StageColorSet = {
  bg: 'bg-[#ede2dc] dark:bg-[#2a201e]',
  border: 'border-[#bf8a7a] dark:border-[#7a5548]',
  text: 'text-[#6a4a3c] dark:text-[#d4a898]',
}

// Derived from --accent-plum (#6e5870 / #b59bc0)
const plumPalette: StageColorSet = {
  bg: 'bg-[#eae2ec] dark:bg-[#262028]',
  border: 'border-[#9c88a2] dark:border-[#6a5672]',
  text: 'text-[#564060] dark:text-[#c8b2cc]',
}

// Derived from --accent-olive (#6d7d63 / #96a781)
const sagePalette: StageColorSet = {
  bg: 'bg-[#e6eae2] dark:bg-[#202620]',
  border: 'border-[#8fa486] dark:border-[#586a50]',
  text: 'text-[#465340] dark:text-[#b4c5a6]',
}

// ---------------------------------------------------------------------------
// Stage colors – one entry per language/period label
// ---------------------------------------------------------------------------

export const stageColors: Record<string, StageColorSet> = {
  'Proto-Indo-European': goldPalette,
  PIE: goldPalette,
  Greek: steelPalette,
  Latin: terracottaPalette,
  'Old French': plumPalette,
  French: plumPalette,
  'Middle English': sagePalette,
  'Old English': sagePalette,
  English: goldPalette,
  Germanic: steelPalette,
  'Proto-Germanic': goldPalette,
  'Scientific Latin': terracottaPalette,
  Arabic: terracottaPalette,
  Sanskrit: terracottaPalette,
  Hebrew: steelPalette,
}

export const defaultStageColors: StageColorSet = {
  bg: 'bg-[#ece6dc] dark:bg-[#262018]',
  border: 'border-[#baa88e] dark:border-[#6a5c48]',
  text: 'text-[#5e5040] dark:text-[#d0c0a8]',
}

// ---------------------------------------------------------------------------
// Branch colors – used to distinguish different root paths in AncestryTree
// ---------------------------------------------------------------------------

export const branchColors: BranchColorSet[] = [
  { accent: 'border-[#88a0b8] dark:border-[#52687a]', line: 'bg-[#bed0de] dark:bg-[#3e5268]' },
  { accent: 'border-[#8fa486] dark:border-[#586a50]', line: 'bg-[#bed0be] dark:bg-[#465840]' },
  { accent: 'border-[#bf8a7a] dark:border-[#7a5548]', line: 'bg-[#d8b8aa] dark:bg-[#644838]' },
  { accent: 'border-[#9c88a2] dark:border-[#6a5672]', line: 'bg-[#c8b2d0] dark:bg-[#584860]' },
]

// ---------------------------------------------------------------------------
// Confidence indicators
// ---------------------------------------------------------------------------

export const confidenceConfig: Record<StageConfidence, ConfidenceColorSet> = {
  high: { color: 'bg-[#6d7d63] dark:bg-[#96a781]', label: 'Verified' },
  medium: { color: 'bg-[#6d7d63] dark:bg-[#96a781]', label: 'Verified' },
  low: { color: 'bg-stone-400 dark:bg-stone-500', label: 'AI-inferred' },
}

// ---------------------------------------------------------------------------
// Source pill colors – evidence source badges
// ---------------------------------------------------------------------------

export const sourcePillColors: Record<string, string> = {
  etymonline:
    'bg-[#f0e8db] dark:bg-[#262019] text-[#6a5530] dark:text-[#d4b878]' +
    ' border-[#c4a06a] dark:border-[#8a6d40]',
  wiktionary:
    'bg-[#e4e8ee] dark:bg-[#1f2328] text-[#405468] dark:text-[#a8bed0]' +
    ' border-[#88a0b8] dark:border-[#52687a]',
}

export const defaultSourcePillColors =
  'bg-[#ece6dc] dark:bg-[#262018] text-[#5e5040] dark:text-[#d0c0a8]' +
  ' border-[#baa88e] dark:border-[#6a5c48]'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve stage colors by exact match first, then fuzzy substring match. */
export function getStageColors(stage: string): StageColorSet {
  if (stageColors[stage]) return stageColors[stage]
  for (const [key, colors] of Object.entries(stageColors)) {
    if (stage.toLowerCase().includes(key.toLowerCase())) return colors
  }
  return defaultStageColors
}
