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
const stageColors: Record<string, { bg: string; border: string; text: string; line: string }> = {
  'Proto-Indo-European': {
    bg: 'bg-stone-100',
    border: 'border-stone-300',
    text: 'text-stone-700',
    line: 'bg-stone-300',
  },
  PIE: {
    bg: 'bg-stone-100',
    border: 'border-stone-300',
    text: 'text-stone-700',
    line: 'bg-stone-300',
  },
  Greek: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    line: 'bg-blue-200',
  },
  Latin: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    line: 'bg-amber-200',
  },
  'Old French': {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-800',
    line: 'bg-rose-200',
  },
  French: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-800',
    line: 'bg-rose-200',
  },
  'Middle English': {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    line: 'bg-emerald-200',
  },
  'Old English': {
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-800',
    line: 'bg-teal-200',
  },
  English: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-800',
    line: 'bg-violet-300',
  },
  Germanic: {
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    text: 'text-slate-700',
    line: 'bg-slate-300',
  },
  'Proto-Germanic': {
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    text: 'text-slate-700',
    line: 'bg-slate-300',
  },
  Arabic: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    line: 'bg-orange-200',
  },
  Sanskrit: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    line: 'bg-yellow-200',
  },
  Hebrew: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    text: 'text-cyan-800',
    line: 'bg-cyan-200',
  },
}

const defaultColors = {
  bg: 'bg-gray-50',
  border: 'border-gray-200',
  text: 'text-gray-700',
  line: 'bg-gray-300',
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
          mb-4
        "
      >
        Etymological Journey
      </h2>

      <div className="relative">
        {/* The tree visualization */}
        <div className="flex flex-col gap-0">
          {stages.map((stage, index) => {
            const colors = getStageColors(stage.stage)
            const isLast = index === stages.length - 1
            const isFirst = index === 0

            return (
              <div key={`${stage.stage}-${index}`} className="relative">
                {/* Connecting line from previous */}
                {!isFirst && (
                  <div
                    className={`
                      absolute left-4 -top-0 w-0.5 h-3
                      ${getStageColors(stages[index - 1].stage).line}
                    `}
                  />
                )}

                {/* Stage node */}
                <div className="flex items-start gap-3">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center pt-1">
                    <div
                      className={`
                        w-3 h-3 rounded-full border-2
                        ${colors.border} ${colors.bg}
                        ${isLast ? 'ring-2 ring-offset-1 ring-violet-300' : ''}
                      `}
                    />
                    {/* Connecting line to next */}
                    {!isLast && <div className={`w-0.5 h-full min-h-[2rem] ${colors.line}`} />}
                  </div>

                  {/* Stage content */}
                  <div
                    className={`
                      flex-1 pb-3
                      ${isLast ? 'pb-0' : ''}
                    `}
                  >
                    {/* Language/period label */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        className={`
                          text-xs font-medium uppercase tracking-wider
                          px-2 py-0.5 rounded
                          ${colors.bg} ${colors.text} ${colors.border} border
                        `}
                      >
                        {stage.stage}
                      </span>

                      {/* Word form */}
                      <span
                        className={`
                          font-serif text-base
                          ${isLast ? 'font-semibold text-charcoal' : 'text-charcoal/80 italic'}
                        `}
                      >
                        {stage.form}
                      </span>
                    </div>

                    {/* Annotation */}
                    <p
                      className="
                        mt-1 text-sm text-charcoal-light
                        leading-relaxed
                      "
                    >
                      {stage.note}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Final word indicator */}
        <div
          className="
            mt-3 pt-3 border-t border-dashed border-charcoal/10
            flex items-center gap-2
          "
        >
          <span className="text-xs text-charcoal-light uppercase tracking-wider">→</span>
          <span className="font-serif text-lg font-semibold text-charcoal">{word}</span>
        </div>
      </div>
    </section>
  )
}
