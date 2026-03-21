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

// ---------------------------------------------------------------------------
// Stage colors – one entry per language/period label
// ---------------------------------------------------------------------------

export const stageColors: Record<string, StageColorSet> = {
  'Proto-Indo-European': {
    bg: 'bg-stone-50/88 dark:bg-stone-950/40',
    border: 'border-stone-300 dark:border-stone-700',
    text: 'text-stone-700 dark:text-stone-300',
  },
  PIE: {
    bg: 'bg-stone-50/88 dark:bg-stone-950/40',
    border: 'border-stone-300 dark:border-stone-700',
    text: 'text-stone-700 dark:text-stone-300',
  },
  Greek: {
    bg: 'bg-sky-50/88 dark:bg-sky-950/38',
    border: 'border-sky-300 dark:border-sky-700',
    text: 'text-sky-800 dark:text-sky-200',
  },
  Latin: {
    bg: 'bg-amber-50/88 dark:bg-amber-950/38',
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-800 dark:text-amber-200',
  },
  'Old French': {
    bg: 'bg-rose-50/88 dark:bg-rose-950/38',
    border: 'border-rose-300 dark:border-rose-700',
    text: 'text-rose-800 dark:text-rose-200',
  },
  French: {
    bg: 'bg-rose-50/88 dark:bg-rose-950/38',
    border: 'border-rose-300 dark:border-rose-700',
    text: 'text-rose-800 dark:text-rose-200',
  },
  'Middle English': {
    bg: 'bg-emerald-50/88 dark:bg-emerald-950/38',
    border: 'border-emerald-300 dark:border-emerald-700',
    text: 'text-emerald-800 dark:text-emerald-200',
  },
  'Old English': {
    bg: 'bg-teal-50/88 dark:bg-teal-950/38',
    border: 'border-teal-300 dark:border-teal-700',
    text: 'text-teal-800 dark:text-teal-200',
  },
  English: {
    bg: 'bg-violet-50/88 dark:bg-violet-950/38',
    border: 'border-violet-300 dark:border-violet-700',
    text: 'text-violet-800 dark:text-violet-200',
  },
  Germanic: {
    bg: 'bg-slate-50/88 dark:bg-slate-950/40',
    border: 'border-slate-300 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
  },
  'Proto-Germanic': {
    bg: 'bg-slate-50/88 dark:bg-slate-950/40',
    border: 'border-slate-300 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
  },
  'Scientific Latin': {
    bg: 'bg-amber-50/88 dark:bg-amber-950/38',
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-800 dark:text-amber-200',
  },
  Arabic: {
    bg: 'bg-orange-50/88 dark:bg-orange-950/38',
    border: 'border-orange-300 dark:border-orange-700',
    text: 'text-orange-800 dark:text-orange-200',
  },
  Sanskrit: {
    bg: 'bg-yellow-50/88 dark:bg-yellow-950/38',
    border: 'border-yellow-300 dark:border-yellow-700',
    text: 'text-yellow-800 dark:text-yellow-200',
  },
  Hebrew: {
    bg: 'bg-cyan-50/88 dark:bg-cyan-950/38',
    border: 'border-cyan-300 dark:border-cyan-700',
    text: 'text-cyan-800 dark:text-cyan-200',
  },
}

export const defaultStageColors: StageColorSet = {
  bg: 'bg-gray-50/88 dark:bg-gray-950/40',
  border: 'border-gray-300 dark:border-gray-700',
  text: 'text-gray-700 dark:text-gray-300',
}

// ---------------------------------------------------------------------------
// Branch colors – used to distinguish different root paths in AncestryTree
// ---------------------------------------------------------------------------

export const branchColors: BranchColorSet[] = [
  { accent: 'border-sky-400 dark:border-sky-600', line: 'bg-sky-300 dark:bg-sky-700' },
  { accent: 'border-rose-400 dark:border-rose-600', line: 'bg-rose-300 dark:bg-rose-700' },
  {
    accent: 'border-emerald-400 dark:border-emerald-600',
    line: 'bg-emerald-300 dark:bg-emerald-700',
  },
  { accent: 'border-amber-400 dark:border-amber-600', line: 'bg-amber-300 dark:bg-amber-700' },
]

// ---------------------------------------------------------------------------
// Confidence indicators
// ---------------------------------------------------------------------------

export const confidenceConfig: Record<StageConfidence, ConfidenceColorSet> = {
  high: { color: 'bg-emerald-400 dark:bg-emerald-500', label: 'Verified' },
  medium: { color: 'bg-amber-400 dark:bg-amber-500', label: 'Single source' },
  low: { color: 'bg-stone-300 dark:bg-stone-600', label: 'AI-inferred' },
}

// ---------------------------------------------------------------------------
// Source pill colors – evidence source badges
// ---------------------------------------------------------------------------

export const sourcePillColors: Record<string, string> = {
  etymonline:
    'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100' +
    ' border-amber-300 dark:border-amber-700',
  wiktionary:
    'bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-100' +
    ' border-sky-300 dark:border-sky-700',
}

export const defaultSourcePillColors =
  'bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100' +
  ' border-purple-300 dark:border-purple-700'

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
