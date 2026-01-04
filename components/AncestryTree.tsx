'use client'

import { AncestryStage } from '@/lib/types'

interface AncestryTreeProps {
  stages: AncestryStage[]
  word: string
}

/**
 * Color palette for different language stages
 * Subtle, muted colors that feel scholarly
 */
const stageColors: Record<string, { bg: string; border: string; text: string }> = {
  'Proto-Indo-European': {
    bg: 'bg-stone-50',
    border: 'border-stone-300',
    text: 'text-stone-700',
  },
  PIE: {
    bg: 'bg-stone-50',
    border: 'border-stone-300',
    text: 'text-stone-700',
  },
  Greek: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-800',
  },
  Latin: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-800',
  },
  'Old French': {
    bg: 'bg-rose-50',
    border: 'border-rose-300',
    text: 'text-rose-800',
  },
  French: {
    bg: 'bg-rose-50',
    border: 'border-rose-300',
    text: 'text-rose-800',
  },
  'Middle English': {
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-800',
  },
  'Old English': {
    bg: 'bg-teal-50',
    border: 'border-teal-300',
    text: 'text-teal-800',
  },
  English: {
    bg: 'bg-violet-50',
    border: 'border-violet-300',
    text: 'text-violet-800',
  },
  Germanic: {
    bg: 'bg-slate-50',
    border: 'border-slate-300',
    text: 'text-slate-700',
  },
  'Proto-Germanic': {
    bg: 'bg-slate-50',
    border: 'border-slate-300',
    text: 'text-slate-700',
  },
  Arabic: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-800',
  },
  Sanskrit: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    text: 'text-yellow-800',
  },
  Hebrew: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-300',
    text: 'text-cyan-800',
  },
}

const defaultColors = {
  bg: 'bg-gray-50',
  border: 'border-gray-300',
  text: 'text-gray-700',
}

function getStageColors(stage: string) {
  // Check for exact match first
  if (stageColors[stage]) return stageColors[stage]

  // Check for partial matches (e.g., "Late Latin" should match "Latin")
  for (const [key, colors] of Object.entries(stageColors)) {
    if (stage.toLowerCase().includes(key.toLowerCase())) {
      return colors
    }
  }

  return defaultColors
}

export function AncestryTree({ stages, word }: AncestryTreeProps) {
  if (!stages || stages.length === 0) return null

  return (
    <section className="mb-8">
      <h2
        className="
          font-serif text-sm uppercase
          text-charcoal-light tracking-widest
          mb-5
        "
      >
        Etymological Journey
      </h2>

      {/* Top-down graph container */}
      <div className="flex flex-col items-center gap-0">
        {stages.map((stage, index) => {
          const colors = getStageColors(stage.stage)
          const isLast = index === stages.length - 1

          return (
            <div key={`${stage.stage}-${index}`} className="flex flex-col items-center">
              {/* Box node */}
              <div
                className={`
                  relative
                  px-4 py-3
                  rounded-lg border-2
                  ${colors.bg} ${colors.border}
                  max-w-sm w-full
                  text-center
                  shadow-sm
                `}
              >
                {/* Language badge */}
                <div
                  className={`
                    inline-block
                    text-[10px] font-semibold uppercase tracking-wider
                    ${colors.text}
                    mb-1
                  `}
                >
                  {stage.stage}
                </div>

                {/* Word form */}
                <div
                  className={`
                    font-serif text-lg
                    ${isLast ? 'font-semibold text-charcoal' : 'text-charcoal/90'}
                  `}
                >
                  {stage.form}
                </div>

                {/* Annotation */}
                <div
                  className="
                    mt-1 text-xs text-charcoal-light
                    leading-relaxed
                  "
                >
                  {stage.note}
                </div>
              </div>

              {/* Connecting edge (arrow) to next node */}
              {!isLast && (
                <div className="flex flex-col items-center py-1">
                  <div className="w-0.5 h-4 bg-charcoal/20" />
                  <svg
                    className="w-3 h-3 text-charcoal/30 -mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 12 12"
                  >
                    <path d="M6 9L1 4h10L6 9z" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}

        {/* Final result node */}
        <div className="flex flex-col items-center py-1">
          <div className="w-0.5 h-4 bg-violet-300" />
          <svg className="w-3 h-3 text-violet-400 -mt-0.5" fill="currentColor" viewBox="0 0 12 12">
            <path d="M6 9L1 4h10L6 9z" />
          </svg>
        </div>

        <div
          className="
            px-6 py-3
            rounded-lg border-2
            bg-violet-100 border-violet-400
            shadow-md
          "
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 mb-1">
            Modern English
          </div>
          <div className="font-serif text-xl font-bold text-charcoal">{word}</div>
        </div>
      </div>
    </section>
  )
}
