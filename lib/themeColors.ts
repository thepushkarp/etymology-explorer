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

const stonePalette: StageColorSet = {
  bg: 'bg-[#ece7de] dark:bg-[#2b241f]',
  border: 'border-[#c5b7a4] dark:border-[#64564b]',
  text: 'text-[#5c5044] dark:text-[#d3c5b5]',
}

const slatePalette: StageColorSet = {
  bg: 'bg-[#e2e6e6] dark:bg-[#252b2d]',
  border: 'border-[#9ca8ab] dark:border-[#546267]',
  text: 'text-[#415057] dark:text-[#d2dde0]',
}

const bronzePalette: StageColorSet = {
  bg: 'bg-[#ece3d6] dark:bg-[#2d241e]',
  border: 'border-[#b89d7e] dark:border-[#6f5947]',
  text: 'text-[#6b533c] dark:text-[#dbc3a7]',
}

const rosePalette: StageColorSet = {
  bg: 'bg-[#ebe1dc] dark:bg-[#2d2220]',
  border: 'border-[#b69a90] dark:border-[#6c554d]',
  text: 'text-[#6a4e47] dark:text-[#dbc0b8]',
}

const olivePalette: StageColorSet = {
  bg: 'bg-[#e3e4da] dark:bg-[#25261f]',
  border: 'border-[#a5a287] dark:border-[#5e5d49]',
  text: 'text-[#53533f] dark:text-[#d2d1b9]',
}

// ---------------------------------------------------------------------------
// Stage colors – one entry per language/period label
// ---------------------------------------------------------------------------

export const stageColors: Record<string, StageColorSet> = {
  'Proto-Indo-European': stonePalette,
  PIE: stonePalette,
  Greek: slatePalette,
  Latin: bronzePalette,
  'Old French': rosePalette,
  French: rosePalette,
  'Middle English': olivePalette,
  'Old English': olivePalette,
  English: stonePalette,
  Germanic: slatePalette,
  'Proto-Germanic': stonePalette,
  'Scientific Latin': bronzePalette,
  Arabic: bronzePalette,
  Sanskrit: bronzePalette,
  Hebrew: slatePalette,
}

export const defaultStageColors: StageColorSet = {
  bg: 'bg-[#e7e1d7] dark:bg-[#29231e]',
  border: 'border-[#c2b4a1] dark:border-[#63564a]',
  text: 'text-[#5e5247] dark:text-[#d3c6b7]',
}

// ---------------------------------------------------------------------------
// Branch colors – used to distinguish different root paths in AncestryTree
// ---------------------------------------------------------------------------

export const branchColors: BranchColorSet[] = [
  { accent: 'border-[#9ca8ab] dark:border-[#546267]', line: 'bg-[#c6d0d3] dark:bg-[#495860]' },
  { accent: 'border-[#a5a287] dark:border-[#5e5d49]', line: 'bg-[#cbc8b8] dark:bg-[#555642]' },
  { accent: 'border-[#b89d7e] dark:border-[#6f5947]', line: 'bg-[#d9c2ab] dark:bg-[#655040]' },
  { accent: 'border-[#b69a90] dark:border-[#6c554d]', line: 'bg-[#d5bbb2] dark:bg-[#674f48]' },
]

// ---------------------------------------------------------------------------
// Confidence indicators
// ---------------------------------------------------------------------------

export const confidenceConfig: Record<StageConfidence, ConfidenceColorSet> = {
  high: { color: 'bg-[#7d6b47] dark:bg-[#c5a36a]', label: 'Verified' },
  medium: { color: 'bg-[#7a705b] dark:bg-[#b9a781]', label: 'Verified' },
  low: { color: 'bg-stone-400 dark:bg-stone-500', label: 'AI-inferred' },
}

// ---------------------------------------------------------------------------
// Source pill colors – evidence source badges
// ---------------------------------------------------------------------------

export const sourcePillColors: Record<string, string> = {
  etymonline:
    'bg-[#ece3d6] dark:bg-[#2d241e] text-[#6b533c] dark:text-[#dbc3a7]' +
    ' border-[#b89d7e] dark:border-[#6f5947]',
  wiktionary:
    'bg-[#e2e6e6] dark:bg-[#252b2d] text-[#415057] dark:text-[#d2dde0]' +
    ' border-[#9ca8ab] dark:border-[#546267]',
}

export const defaultSourcePillColors =
  'bg-[#e7e1d7] dark:bg-[#29231e] text-[#5e5247] dark:text-[#d3c6b7]' +
  ' border-[#c2b4a1] dark:border-[#63564a]'

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
