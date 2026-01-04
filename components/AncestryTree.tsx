'use client'

import { AncestryGraph, AncestryStage, AncestryBranch } from '@/lib/types'

interface AncestryTreeProps {
  graph: AncestryGraph
  word: string
}

/**
 * Color palette for different language stages
 */
const stageColors: Record<string, { bg: string; border: string; text: string }> = {
  'Proto-Indo-European': { bg: 'bg-stone-50', border: 'border-stone-300', text: 'text-stone-700' },
  PIE: { bg: 'bg-stone-50', border: 'border-stone-300', text: 'text-stone-700' },
  Greek: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-800' },
  Latin: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800' },
  'Old French': { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-800' },
  French: { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-800' },
  'Middle English': { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800' },
  'Old English': { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-800' },
  English: { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-800' },
  Germanic: { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-700' },
  'Proto-Germanic': { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-700' },
  'Scientific Latin': { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800' },
  Arabic: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800' },
  Sanskrit: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800' },
  Hebrew: { bg: 'bg-cyan-50', border: 'border-cyan-300', text: 'text-cyan-800' },
}

const defaultColors = { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700' }

// Branch colors for distinguishing different root paths
const branchColors = [
  { accent: 'border-blue-400', line: 'bg-blue-300' },
  { accent: 'border-rose-400', line: 'bg-rose-300' },
  { accent: 'border-emerald-400', line: 'bg-emerald-300' },
  { accent: 'border-amber-400', line: 'bg-amber-300' },
]

function getStageColors(stage: string) {
  if (stageColors[stage]) return stageColors[stage]
  for (const [key, colors] of Object.entries(stageColors)) {
    if (stage.toLowerCase().includes(key.toLowerCase())) return colors
  }
  return defaultColors
}

function StageNode({ stage, isLast }: { stage: AncestryStage; isLast?: boolean }) {
  const colors = getStageColors(stage.stage)
  return (
    <div
      className={`
        px-3 py-2 rounded-lg border-2
        ${colors.bg} ${colors.border}
        text-center shadow-sm
      `}
    >
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text} mb-0.5`}>
        {stage.stage}
      </div>
      <div
        className={`font-serif text-sm ${isLast ? 'font-semibold text-charcoal' : 'text-charcoal/90'}`}
      >
        {stage.form}
      </div>
      <div className="mt-0.5 text-[10px] text-charcoal-light leading-tight">{stage.note}</div>
    </div>
  )
}

function VerticalConnector({ color = 'bg-charcoal/20' }: { color?: string }) {
  return (
    <div className="flex flex-col items-center py-0.5">
      <div className={`w-0.5 h-3 ${color}`} />
      <svg className="w-2 h-2 text-charcoal/30 -mt-0.5" fill="currentColor" viewBox="0 0 12 12">
        <path d="M6 9L2 5h8L6 9z" />
      </svg>
    </div>
  )
}

function BranchColumn({ branch, branchIndex }: { branch: AncestryBranch; branchIndex: number }) {
  const branchColor = branchColors[branchIndex % branchColors.length]

  return (
    <div className="flex flex-col items-center">
      {/* Root label */}
      <div
        className={`
          px-2 py-1 mb-1
          text-[10px] font-bold uppercase tracking-wider
          text-charcoal bg-white
          border-2 ${branchColor.accent}
          rounded-full shadow-sm
        `}
      >
        {branch.root}
      </div>

      {/* Stages */}
      {branch.stages.map((stage, idx) => (
        <div key={`${stage.stage}-${idx}`} className="flex flex-col items-center">
          {idx > 0 && <VerticalConnector color={branchColor.line} />}
          <StageNode stage={stage} isLast={idx === branch.stages.length - 1} />
        </div>
      ))}
    </div>
  )
}

export function AncestryTree({ graph, word }: AncestryTreeProps) {
  if (!graph || !graph.branches || graph.branches.length === 0) return null

  const hasMerge = graph.mergePoint && graph.branches.length > 1
  const hasPostMerge = graph.postMerge && graph.postMerge.length > 0

  return (
    <section className="mb-8">
      <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-5">
        Etymological Journey
      </h2>

      <div className="flex flex-col items-center">
        {/* Branches side by side */}
        <div
          className={`
            grid gap-4 w-full
            ${graph.branches.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' : ''}
            ${graph.branches.length === 2 ? 'grid-cols-2 max-w-lg mx-auto' : ''}
            ${graph.branches.length >= 3 ? 'grid-cols-3 max-w-2xl mx-auto' : ''}
          `}
        >
          {graph.branches.map((branch, idx) => (
            <BranchColumn key={branch.root} branch={branch} branchIndex={idx} />
          ))}
        </div>

        {/* Merge point (if multiple branches) */}
        {hasMerge && (
          <>
            {/* Merge lines converging */}
            <div className="relative w-full max-w-lg h-8 mt-2">
              <svg
                className="w-full h-full"
                viewBox="0 0 100 20"
                preserveAspectRatio="none"
                fill="none"
              >
                {graph.branches.length === 2 && (
                  <>
                    <path
                      d="M25 0 L50 18"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-charcoal/20"
                    />
                    <path
                      d="M75 0 L50 18"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-charcoal/20"
                    />
                  </>
                )}
                {graph.branches.length === 3 && (
                  <>
                    <path
                      d="M17 0 L50 18"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-charcoal/20"
                    />
                    <path
                      d="M50 0 L50 18"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-charcoal/20"
                    />
                    <path
                      d="M83 0 L50 18"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-charcoal/20"
                    />
                  </>
                )}
              </svg>
            </div>

            {/* Merge node */}
            <div
              className="
                px-4 py-2 rounded-lg border-2
                bg-gradient-to-b from-violet-50 to-purple-50
                border-violet-400
                text-center shadow-md
                max-w-sm
              "
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 mb-0.5">
                Combined
              </div>
              <div className="font-serif text-base font-semibold text-charcoal">
                {graph.mergePoint!.form}
              </div>
              <div className="mt-0.5 text-[10px] text-charcoal-light">{graph.mergePoint!.note}</div>
            </div>
          </>
        )}

        {/* Post-merge evolution */}
        {hasPostMerge && (
          <div className="flex flex-col items-center">
            {graph.postMerge!.map((stage, idx) => (
              <div key={`post-${idx}`} className="flex flex-col items-center">
                <VerticalConnector color="bg-violet-300" />
                <StageNode stage={stage} isLast={idx === graph.postMerge!.length - 1} />
              </div>
            ))}
          </div>
        )}

        {/* Final word */}
        <div className="flex flex-col items-center mt-1">
          <div className="w-0.5 h-4 bg-violet-400" />
          <svg className="w-3 h-3 text-violet-500 -mt-0.5" fill="currentColor" viewBox="0 0 12 12">
            <path d="M6 9L1 4h10L6 9z" />
          </svg>
        </div>

        <div
          className="
            px-6 py-3
            rounded-lg border-2
            bg-violet-100 border-violet-500
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
