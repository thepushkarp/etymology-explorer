'use client'

import { memo } from 'react'
import { AncestryGraph, AncestryStage } from '@/lib/types'

interface AncestryTimelineProps {
  graph: AncestryGraph
  word: string
  isSimple?: boolean
}

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

function getStageColors(stage: string) {
  if (stageColors[stage]) return stageColors[stage]
  for (const [key, colors] of Object.entries(stageColors)) {
    if (stage.toLowerCase().includes(key.toLowerCase())) return colors
  }
  return defaultColors
}

function StageCard({ stage, index }: { stage: AncestryStage; index: number }) {
  const colors = getStageColors(stage.stage)

  return (
    <div
      className="relative pl-8 pb-4 animate-stage-reveal"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'backwards' }}
    >
      <span className="absolute left-[5px] top-5 h-2 w-2 rounded-full bg-charcoal/35" />
      <article
        className={`
          rounded-lg border px-3 py-3
          ${colors.bg} ${colors.border}
          shadow-sm transition-all duration-300
        `}
      >
        <div className="mb-1.5 flex items-center gap-2">
          <span
            className={`
              inline-flex items-center rounded-full border px-2 py-0.5
              text-[10px] font-semibold uppercase tracking-wider
              ${colors.bg} ${colors.border} ${colors.text}
            `}
          >
            {stage.stage}
          </span>
        </div>

        <p className="font-serif text-base text-charcoal leading-snug">{stage.form}</p>
        <p className="mt-1 text-xs text-charcoal/65 leading-relaxed">{stage.note}</p>
      </article>
    </div>
  )
}

export const AncestryTimeline = memo(function AncestryTimeline({
  graph,
  word,
  isSimple = false,
}: AncestryTimelineProps) {
  const visibleBranches = graph.branches.map((branch) => ({
    ...branch,
    stages: isSimple ? branch.stages.filter((stage) => !stage.isReconstructed) : branch.stages,
  }))

  const visiblePostMerge =
    isSimple && graph.postMerge
      ? graph.postMerge.filter((stage) => !stage.isReconstructed)
      : graph.postMerge

  const hasMerge = graph.mergePoint && visibleBranches.length > 1
  const hasPostMerge = visiblePostMerge && visiblePostMerge.length > 0

  const timeline = visibleBranches.reduce(
    (acc, branch, branchIdx) => {
      const headerIndex = acc.nextIndex
      const stageItems = branch.stages.map((stage, idx) => ({
        stage,
        index: headerIndex + idx + 1,
      }))

      return {
        blocks: [...acc.blocks, { branch, branchIdx, headerIndex, stageItems }],
        nextIndex: headerIndex + branch.stages.length + 1,
      }
    },
    {
      blocks: [] as Array<{
        branch: (typeof visibleBranches)[number]
        branchIdx: number
        headerIndex: number
        stageItems: Array<{ stage: AncestryStage; index: number }>
      }>,
      nextIndex: 1,
    }
  )

  const mergeIndex = timeline.nextIndex
  const postMergeItems =
    visiblePostMerge?.map((stage, idx) => ({
      stage,
      index: mergeIndex + (hasMerge ? 1 : 0) + idx,
    })) || []
  const finalIndex = mergeIndex + (hasMerge ? 1 : 0) + postMergeItems.length

  return (
    <div className="relative overflow-x-hidden rounded-lg border border-charcoal/10 bg-white/70 p-4">
      <div
        className="absolute bottom-10 left-[18px] top-8 w-0.5 bg-charcoal/20"
        aria-hidden="true"
      />

      <div className="space-y-2">
        {timeline.blocks.map(({ branch, branchIdx, headerIndex, stageItems }) => (
          <div key={`${branch.root}-${branchIdx}`} className="relative">
            <div
              className="relative pl-8 pb-3 animate-stage-reveal"
              style={{ animationDelay: `${headerIndex * 80}ms`, animationFillMode: 'backwards' }}
            >
              <span className="absolute left-[3px] top-2.5 h-3 w-3 rounded-full border border-charcoal/30 bg-cream" />
              <p className="text-[10px] uppercase tracking-[0.18em] text-charcoal/55">
                Branch {branchIdx + 1}
              </p>
              <p className="font-serif text-sm text-charcoal">{branch.root}</p>
            </div>

            {stageItems.map(({ stage, index }) => (
              <StageCard
                key={`${stage.stage}-${stage.form}-${index}`}
                stage={stage}
                index={index}
              />
            ))}
          </div>
        ))}

        {hasMerge && (
          <div
            className="relative pl-8 pb-4 animate-stage-reveal"
            style={{ animationDelay: `${mergeIndex * 80}ms`, animationFillMode: 'backwards' }}
          >
            <span className="absolute left-[2px] top-5 h-4 w-4 rounded-full border border-violet-300 bg-violet-100" />
            <article className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-3 shadow-sm transition-all duration-300">
              <p className="text-[10px] uppercase tracking-[0.16em] text-violet-600">Convergence</p>
              <p className="mt-0.5 font-serif text-base text-charcoal">{graph.mergePoint!.form}</p>
              <p className="mt-1 text-xs text-charcoal/65">{graph.mergePoint!.note}</p>
            </article>
          </div>
        )}

        {hasPostMerge &&
          postMergeItems.map(({ stage, index }) => (
            <StageCard
              key={`post-${stage.stage}-${stage.form}-${index}`}
              stage={stage}
              index={index}
            />
          ))}

        <div
          className="relative pl-8 animate-stage-reveal"
          style={{ animationDelay: `${finalIndex * 80}ms`, animationFillMode: 'backwards' }}
        >
          <span className="absolute left-[2px] top-5 h-4 w-4 rounded-full border border-violet-400 bg-violet-200" />
          <article className="rounded-lg border-2 border-violet-500 bg-violet-100 px-3 py-3 shadow-sm transition-all duration-300">
            <p className="text-[10px] uppercase tracking-[0.16em] text-violet-700">
              Modern English
            </p>
            <p className="mt-1 font-serif text-lg font-bold text-charcoal">{word}</p>
          </article>
        </div>
      </div>
    </div>
  )
})
