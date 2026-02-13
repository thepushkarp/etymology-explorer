'use client'

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import {
  AncestryGraph,
  AncestryStage,
  AncestryBranch,
  ConvergencePoint,
  StageConfidence,
} from '@/lib/types'
import { AncestryTimeline } from './AncestryTimeline'
import {
  branchColors,
  confidenceConfig,
  sourcePillColors,
  defaultSourcePillColors,
  getStageColors,
} from '@/lib/themeColors'

interface AncestryTreeProps {
  graph: AncestryGraph
  word: string
  isSimple?: boolean
}

/**
 * Evidence panel shown when a stage is clicked.
 * On desktop: popover tooltip. On mobile: inline accordion.
 */
function EvidencePanel({ stage }: { stage: AncestryStage }) {
  if (!stage.evidence || stage.evidence.length === 0) return null

  return (
    <div
      className="
        mt-2 w-full
        border-l-4 border-stone-300 dark:border-stone-700
        bg-stone-50/80 dark:bg-stone-900/40 rounded-r-md
        px-3 py-2
      "
    >
      {stage.evidence.map((ev, i) => (
        <div key={`${ev.source}-${i}`} className="mb-1 last:mb-0">
          <span
            className={`
              inline-block text-[9px] font-semibold uppercase tracking-wider
              px-1.5 py-0.5 rounded border mb-1
              ${sourcePillColors[ev.source] || defaultSourcePillColors}
            `}
          >
            {ev.source}
          </span>
          <p className="font-serif text-[11px] italic text-charcoal/70 leading-snug">
            {ev.snippet}
          </p>
        </div>
      ))}
    </div>
  )
}

/**
 * Confidence dot indicator for a stage
 */
function ConfidenceBadge({ confidence }: { confidence?: StageConfidence }) {
  if (!confidence) return null

  const config = confidenceConfig[confidence]
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full
        text-[8px] font-semibold uppercase tracking-wider leading-none
        ${confidence === 'high' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700' : ''}
        ${confidence === 'medium' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700' : ''}
        ${confidence === 'low' ? 'bg-stone-100 dark:bg-stone-900/40 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700' : ''}
      `}
      title={config.label}
      aria-label={config.label}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${config.color}`} />
      {config.label}
    </span>
  )
}

/**
 * Source attribution pills shown below stage note
 */
function SourcePills({ stage }: { stage: AncestryStage }) {
  if (!stage.confidence) return null

  // If we have evidence, show source pills; otherwise show "AI" pill
  if (stage.evidence && stage.evidence.length > 0) {
    const sources = [...new Set(stage.evidence.map((e) => e.source))]
    return (
      <div className="flex items-center justify-center gap-1 mt-1">
        {sources.map((source) => (
          <span
            key={source}
            className={`
              text-[8px] font-semibold uppercase tracking-wider
              px-1.5 py-0.5 rounded border leading-none
              ${sourcePillColors[source] || defaultSourcePillColors}
            `}
          >
            {source}
          </span>
        ))}
      </div>
    )
  }

  // Low confidence with no evidence = AI-inferred
  if (stage.confidence === 'low') {
    return (
      <div className="flex items-center justify-center mt-1">
        <span className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-700 leading-none">
          AI
        </span>
      </div>
    )
  }

  return null
}

function StageNode({
  stage,
  isLast,
  animationDelay,
  isSimple,
}: {
  stage: AncestryStage
  isLast?: boolean
  animationDelay?: number
  isSimple?: boolean
}) {
  const [showEvidence, setShowEvidence] = useState(false)
  const nodeRef = useRef<HTMLDivElement>(null)
  const colors = getStageColors(stage.stage)
  const isReconstructed = stage.isReconstructed
  const hasEvidence = !isSimple && stage.evidence && stage.evidence.length > 0

  // Close evidence panel on outside click
  useEffect(() => {
    if (!showEvidence) return
    function handleClick(e: MouseEvent) {
      if (nodeRef.current && !nodeRef.current.contains(e.target as Node)) {
        setShowEvidence(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showEvidence])

  const handleToggle = useCallback(() => {
    if (hasEvidence) setShowEvidence((prev) => !prev)
  }, [hasEvidence])

  return (
    <div
      ref={nodeRef}
      className="flex flex-col items-center w-full animate-stage-reveal"
      style={
        animationDelay !== undefined
          ? { animationDelay: `${animationDelay}ms`, animationFillMode: 'backwards' }
          : undefined
      }
    >
      <div
        onClick={handleToggle}
        className={`
          px-3 py-2 rounded-lg w-full
          ${isReconstructed ? 'border-2 border-dashed' : 'border-2'}
          ${isReconstructed ? 'bg-stone-50/60 dark:bg-stone-900/40 border-stone-300 dark:border-stone-700' : `${colors.bg} ${colors.border}`}
          text-center shadow-sm transition-all duration-300
          ${hasEvidence ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
        `}
      >
        {/* Header row: language label + confidence dot */}
        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          <div
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              isReconstructed ? 'text-stone-500 dark:text-stone-400' : colors.text
            }`}
          >
            {stage.stage}
          </div>
          {!isSimple && <ConfidenceBadge confidence={stage.confidence} />}
        </div>

        {/* Form */}
        <div
          className={`
            font-serif text-sm
            ${isReconstructed ? 'italic text-stone-600 dark:text-stone-400' : ''}
            ${isLast ? 'font-semibold text-charcoal' : 'text-charcoal/90'}
          `}
        >
          {stage.form}
        </div>

        {/* Reconstructed label */}
        {!isSimple && isReconstructed && (
          <div className="text-[8px] uppercase tracking-widest text-stone-400 dark:text-stone-500 mt-0.5">
            reconstructed
          </div>
        )}

        {/* Note */}
        <div className="mt-0.5 text-[10px] text-charcoal-light leading-tight">{stage.note}</div>

        {/* Source pills */}
        {!isSimple && <SourcePills stage={stage} />}

        {/* Inline evidence preview (always visible) */}
        {hasEvidence && !showEvidence && (
          <div className="mt-1.5 pt-1.5 border-t border-stone-200/60 dark:border-stone-700/60">
            <p className="font-serif text-[9px] italic text-charcoal/50 leading-snug line-clamp-2">
              {stage.evidence![0].snippet}
            </p>
            {stage.evidence!.length > 1 && (
              <span className="text-[8px] text-charcoal/40 mt-0.5 block">
                +{stage.evidence!.length - 1} more source{stage.evidence!.length > 2 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Full evidence panel (expanded on click) */}
      {!isSimple && showEvidence && <EvidencePanel stage={stage} />}
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

/**
 * Scholarly callout showing shared PIE ancestry between branches
 * Styled as dictionary marginalia / cross-reference note
 */
function ConvergenceCallout({
  points,
  branches,
}: {
  points: ConvergencePoint[]
  branches: AncestryBranch[]
}) {
  return (
    <aside
      className="
        mb-6 p-4 w-full max-w-lg
        bg-stone-50/80 dark:bg-stone-900/40
        border-l-4 border-stone-400 dark:border-stone-600
        rounded-r-lg
      "
      role="note"
      aria-label="Shared etymology"
    >
      <h3
        className="
          text-[10px] font-semibold uppercase tracking-widest
          text-stone-600 dark:text-stone-400 mb-2
          flex items-center gap-2
        "
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        Shared Ancestry
      </h3>
      {points.map((cp, i) => {
        const branchNames = cp.branchIndices.map((idx) => branches[idx]?.root || '?')
        return (
          <p
            key={`convergence-${cp.pieRoot}-${i}`}
            className="font-serif text-sm text-charcoal/80 leading-relaxed"
          >
            <span className="font-semibold">{branchNames.join(' and ')}</span> share
            Proto-Indo-European{' '}
            <em className="text-stone-700 dark:text-stone-300">*{cp.pieRoot}</em>{' '}
            <span className="text-stone-500 dark:text-stone-400">&ldquo;{cp.meaning}&rdquo;</span>
          </p>
        )
      })}
    </aside>
  )
}

/**
 * Extract grid column class to avoid recreating inline strings
 */
function gridColsClass(count: number): string {
  if (count === 1) return 'grid-cols-1 max-w-xs mx-auto'
  if (count === 2) return 'grid-cols-2 max-w-lg mx-auto'
  return 'grid-cols-3 max-w-2xl mx-auto'
}

function BranchColumn({
  branch,
  branchIndex,
  convergencePoints,
  baseDelay,
  isSimple,
}: {
  branch: AncestryBranch
  branchIndex: number
  convergencePoints?: ConvergencePoint[]
  baseDelay: number
  isSimple?: boolean
}) {
  const branchColor = branchColors[branchIndex % branchColors.length]
  const visibleStages = isSimple
    ? branch.stages.filter((stage) => !stage.isReconstructed)
    : branch.stages

  // Find convergences this branch participates in
  const convergences =
    convergencePoints?.filter((cp) => cp.branchIndices.includes(branchIndex)) || []

  return (
    <div className="flex flex-col items-center">
      {/* Root label with convergence badge */}
      <div
        className={`
          px-2 py-1 mb-1
          text-[10px] font-bold uppercase tracking-wider
          text-charcoal bg-surface
          border-2 ${branchColor.accent}
          rounded-full shadow-sm
          flex items-center gap-1.5
          animate-stage-reveal
        `}
        style={{ animationDelay: `${baseDelay}ms`, animationFillMode: 'backwards' }}
      >
        {branch.root}
        {convergences.length > 0 && (
          <span
            className="
              w-2 h-2 rounded-full
              bg-stone-400 dark:bg-stone-500
              ring-1 ring-stone-300 dark:ring-stone-600
            "
            title={convergences.map((c) => `Shares PIE *${c.pieRoot} "${c.meaning}"`).join('; ')}
            aria-label={`Shared ancestry with PIE roots: ${convergences.map((c) => c.pieRoot).join(', ')}`}
          />
        )}
      </div>

      {/* Stages */}
      {visibleStages.map((stage, idx) => (
        <div key={`${stage.stage}-${idx}`} className="flex flex-col items-center w-full">
          {idx > 0 && <VerticalConnector color={branchColor.line} />}
          <StageNode
            stage={stage}
            isLast={idx === visibleStages.length - 1}
            animationDelay={baseDelay + (idx + 1) * 100}
            isSimple={isSimple}
          />
        </div>
      ))}
    </div>
  )
}

export const AncestryTree = memo(function AncestryTree({
  graph,
  word,
  isSimple = false,
}: AncestryTreeProps) {
  if (!graph || !graph.branches || graph.branches.length === 0) return null

  const visibleGraph = {
    ...graph,
    branches: graph.branches.map((branch) => ({
      ...branch,
      stages: isSimple ? branch.stages.filter((stage) => !stage.isReconstructed) : branch.stages,
    })),
    postMerge:
      isSimple && graph.postMerge
        ? graph.postMerge.filter((stage) => !stage.isReconstructed)
        : graph.postMerge,
  }

  const hasMerge = visibleGraph.mergePoint && visibleGraph.branches.length > 1
  const hasPostMerge = visibleGraph.postMerge && visibleGraph.postMerge.length > 0
  const hasConvergence =
    !isSimple && visibleGraph.convergencePoints && visibleGraph.convergencePoints.length > 0

  // Calculate the max stages across all branches for delay calculation
  const maxStages = Math.max(...visibleGraph.branches.map((b) => b.stages.length), 0)

  return (
    <section className="mb-8">
      <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-5">
        Etymological Journey
      </h2>

      <div className="flex flex-col items-center transition-all duration-300 ease-out">
        <div className="w-full md:hidden">
          <AncestryTimeline graph={visibleGraph} word={word} isSimple={isSimple} />
        </div>

        <div className="hidden md:flex md:flex-col md:items-center md:w-full">
          {/* Convergence callout - shared PIE ancestry */}
          {hasConvergence && (
            <ConvergenceCallout
              points={visibleGraph.convergencePoints!}
              branches={visibleGraph.branches}
            />
          )}

          {/* Branches side by side - items-end aligns at bottom for merge point */}
          <div
            className={`grid items-end gap-4 w-full ${gridColsClass(visibleGraph.branches.length)}`}
          >
            {visibleGraph.branches.map((branch, idx) => (
              <BranchColumn
                key={branch.root}
                branch={branch}
                branchIndex={idx}
                convergencePoints={visibleGraph.convergencePoints}
                baseDelay={idx * 50}
                isSimple={isSimple}
              />
            ))}
          </div>

          {/* Merge point (if multiple branches) */}
          {hasMerge && (
            <>
              {/* Merge lines converging — smooth bezier curves */}
              <div className="relative w-full max-w-lg h-8 mt-2">
                <svg
                  className="w-full h-full"
                  viewBox="0 0 100 20"
                  preserveAspectRatio="none"
                  fill="none"
                >
                  {visibleGraph.branches.length === 2 && (
                    <>
                      <path
                        d="M25 0 C25 12, 50 12, 50 18"
                        stroke="currentColor"
                        strokeWidth="1"
                        className="text-charcoal/20"
                      />
                      <path
                        d="M75 0 C75 12, 50 12, 50 18"
                        stroke="currentColor"
                        strokeWidth="1"
                        className="text-charcoal/20"
                      />
                    </>
                  )}
                  {visibleGraph.branches.length === 3 && (
                    <>
                      <path
                        d="M17 0 C17 12, 50 12, 50 18"
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
                        d="M83 0 C83 12, 50 12, 50 18"
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
                bg-gradient-to-b from-violet-50 dark:from-violet-950/40 to-purple-50 dark:to-purple-950/40
                border-violet-400 dark:border-violet-600
                text-center shadow-md
                max-w-sm
                animate-stage-reveal
              "
                style={{
                  animationDelay: `${(maxStages + 1) * 100}ms`,
                  animationFillMode: 'backwards',
                }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-0.5">
                  Combined
                </div>
                <div className="font-serif text-base font-semibold text-charcoal">
                  {visibleGraph.mergePoint!.form}
                </div>
                <div className="mt-0.5 text-[10px] text-charcoal-light">
                  {visibleGraph.mergePoint!.note}
                </div>
              </div>
            </>
          )}

          {/* Post-merge evolution */}
          {hasPostMerge && (
            <div className="flex flex-col items-center">
              {visibleGraph.postMerge!.map((stage, idx) => (
                <div key={`post-${idx}`} className="flex flex-col items-center w-full max-w-xs">
                  <VerticalConnector color="bg-violet-300 dark:bg-violet-700" />
                  <StageNode
                    stage={stage}
                    isLast={idx === visibleGraph.postMerge!.length - 1}
                    animationDelay={(maxStages + 2 + idx) * 100}
                    isSimple={isSimple}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Final word */}
          <div className="flex flex-col items-center mt-1">
            <div className="w-0.5 h-4 bg-violet-400 dark:bg-violet-600" />
            <svg
              className="w-3 h-3 text-violet-500 dark:text-violet-400 -mt-0.5"
              fill="currentColor"
              viewBox="0 0 12 12"
            >
              <path d="M6 9L1 4h10L6 9z" />
            </svg>
          </div>

          <div
            className="
            px-6 py-3
            rounded-lg border-2
            bg-violet-100 dark:bg-violet-900/30 border-violet-500 dark:border-violet-600
            shadow-md
            animate-stage-reveal
          "
            style={{
              animationDelay: `${(maxStages + 3 + (graph.postMerge?.length || 0)) * 100}ms`,
              animationFillMode: 'backwards',
            }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1">
              Modern English
            </div>
            <div className="font-serif text-xl font-bold text-charcoal">{word}</div>
          </div>
        </div>
      </div>
    </section>
  )
})
