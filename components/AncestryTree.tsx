'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { AncestryGraph, AncestryStage } from '@/lib/types'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import { sourceLabel } from '@/lib/sourceLabels'

interface AncestryTreeProps {
  graph: AncestryGraph
  word: string
  language?: LanguageCode
}

type Marker = 'attested' | 'inferred' | 'reconstructed'

const MARKER_CLASS: Record<Marker, string> = {
  attested: 'bg-muted border-muted',
  inferred: 'bg-paper border-muted',
  reconstructed: 'bg-paper border-muted border-dashed',
}

const MARKER_LABEL: Record<Marker, string> = {
  attested: 'found in sources',
  inferred: 'inferred',
  reconstructed: 'reconstructed',
}

function markerFor(stage: AncestryStage): Marker {
  if (stage.isReconstructed) return 'reconstructed'
  return stage.confidence === 'low' ? 'inferred' : 'attested'
}

function provenance(stage: AncestryStage): string {
  if (stage.isReconstructed) {
    return 'Reconstructed: not written down anywhere, inferred by comparing its descendants.'
  }
  switch (stage.confidence) {
    case 'high':
      return 'Found in two or more of the sources consulted.'
    case 'medium':
      return 'Found in one of the sources consulted.'
    case 'low':
      return 'Not found in the sources consulted; inferred by the model.'
    default:
      return 'Source support was not assessed for this stage.'
  }
}

const STEP_MS = 60
const NODE_WIDTH = 'w-full max-w-60'

function Connector({ grow = false, className = '' }: { grow?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block w-px bg-faint/60 ${grow ? 'min-h-6 flex-1' : 'h-6'} ${className}`}
    />
  )
}

/** A clickable stage: the node shows language, form, and gloss; opening it shows provenance. */
function StageNode({
  id,
  stage,
  open,
  onToggle,
  delay,
}: {
  id: string
  stage: AncestryStage
  open: boolean
  onToggle: (id: string) => void
  delay: number
}) {
  const marker = markerFor(stage)
  const detailsId = `${id}-details`

  return (
    <div
      className={`animate-rise flex flex-col items-center ${NODE_WIDTH}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <button
        type="button"
        data-node
        onClick={() => onToggle(id)}
        aria-expanded={open}
        aria-controls={detailsId}
        className={`relative w-full border px-4 py-3 text-center transition-[border-color,background-color,transform] duration-200 ${
          marker === 'reconstructed' ? 'border-dashed' : ''
        } ${
          open
            ? 'border-ink bg-wash'
            : 'border-rule bg-paper hover:-translate-y-px hover:border-muted'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute right-2 top-2 size-2 rounded-full border ${MARKER_CLASS[marker]}`}
        />
        <span className="sr-only">{MARKER_LABEL[marker]}: </span>
        <span className="label block">{stage.stage}</span>
        <span className="mt-1 block font-serif text-lg italic text-ink">{stage.form}</span>
        {stage.note && (
          <span className="mt-0.5 block text-sm leading-snug text-muted">{stage.note}</span>
        )}
      </button>

      {open && (
        <div
          id={detailsId}
          className="animate-rise w-full border border-t-0 border-ink px-4 py-3 text-left text-sm"
          style={{ animationDuration: '200ms' }}
        >
          <p className="text-muted">{provenance(stage)}</p>
          {stage.evidence && stage.evidence.length > 0 && (
            <ul className="mt-3 space-y-2">
              {stage.evidence.map((item, index) => (
                <li key={`${item.source}-${index}`} className="leading-snug">
                  <span className="label mr-2">{sourceLabel(item.source)}</span>
                  <q className="font-serif italic text-ink">{item.snippet}</q>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** A non-interactive node for the combined form and the modern word. */
function StaticNode({
  label,
  form,
  note,
  final = false,
  delay,
}: {
  label: string
  form: string
  note?: string
  final?: boolean
  delay: number
}) {
  return (
    <div
      className={`animate-rise border px-4 py-3 text-center ${NODE_WIDTH} ${
        final ? 'border-accent' : 'border-rule'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="label block">{label}</span>
      <span className={`mt-1 block font-serif text-ink ${final ? 'text-xl' : 'text-lg italic'}`}>
        {form}
      </span>
      {note && <span className="mt-0.5 block text-sm leading-snug text-muted">{note}</span>}
    </div>
  )
}

/** Curves joining the bottom of each branch column into the node below (wide screens). */
function MergeCurves({ count }: { count: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="hidden h-8 w-full text-faint sm:block"
      fill="none"
    >
      {Array.from({ length: count }, (_, index) => {
        const x = ((index + 0.5) / count) * 100
        return (
          <path
            key={index}
            d={`M${x} 0 C${x} 14, 50 10, 50 24`}
            stroke="currentColor"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}

export function AncestryTree({ graph, word, language = 'en' }: AncestryTreeProps) {
  const { branches, mergePoint, postMerge = [], convergencePoints = [] } = graph
  const [openId, setOpenId] = useState<string | null>(null)
  const treeId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  // Close the open node on Escape or on a click anywhere outside a node.
  useEffect(() => {
    if (!openId) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!rootRef.current?.contains(target) || !target?.closest('[data-node], [id$="-details"]')) {
        setOpenId(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openId])

  if (branches.length === 0) return null

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id))
  const split = branches.length > 1
  // Nodes reveal top to bottom; the joined tail starts after the longest branch.
  const tailStart = Math.max(...branches.map((branch) => branch.stages.length))
  const tailDelay = (index: number) => (tailStart + index) * STEP_MS
  const mergeNodes = split && mergePoint ? 1 : 0
  const columns = branches.length === 3 ? 3 : 2

  const stageNode = (stage: AncestryStage, key: string, delay: number) => {
    const id = `${treeId}-${key}`
    return (
      <StageNode
        key={key}
        id={id}
        stage={stage}
        open={openId === id}
        onToggle={toggle}
        delay={delay}
      />
    )
  }

  const markersUsed = new Set(
    [...branches.flatMap((branch) => branch.stages), ...postMerge].map(markerFor)
  )

  return (
    <div ref={rootRef}>
      {convergencePoints.map((point, index) => (
        <p key={`${point.pieRoot}-${index}`} className="mb-6 font-serif text-sm italic text-muted">
          {point.branchIndices.map((i) => branches[i]?.root ?? '?').join(' and ')} share
          Proto-Indo-European <span className="text-ink">*{point.pieRoot.replace(/^\*/, '')}</span>{' '}
          &lsquo;{point.meaning}&rsquo;.
        </p>
      ))}

      <div className="flex flex-col items-center">
        <div
          className={`grid w-full gap-x-6 gap-y-8 ${
            !split ? '' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          }`}
        >
          {branches.map((branch, branchIndex) => (
            <div key={`${branch.root}-${branchIndex}`} className="flex flex-col items-center">
              {split && (
                <p className="mb-3 font-serif text-sm text-muted">
                  from <em className="text-ink">{branch.root}</em>
                </p>
              )}
              {branch.stages.map((stage, index) => (
                <div key={index} className="flex w-full flex-col items-center">
                  {index > 0 && <Connector />}
                  {stageNode(stage, `${branchIndex}-${index}`, index * STEP_MS)}
                </div>
              ))}
              {/* Wide screens: stretch to the column bottom so every branch meets the curves. */}
              {split && <Connector grow className="hidden sm:block" />}
            </div>
          ))}
        </div>

        {split && <MergeCurves count={columns} />}
        {split && <Connector className="mt-8 sm:hidden" />}
        {!split && <Connector />}

        {split && mergePoint && (
          <>
            <StaticNode
              label="Combined"
              form={mergePoint.form}
              note={mergePoint.note}
              delay={tailDelay(0)}
            />
            <Connector />
          </>
        )}

        {postMerge.map((stage, index) => (
          <div key={index} className="flex w-full flex-col items-center">
            {stageNode(stage, `post-${index}`, tailDelay(mergeNodes + index))}
            <Connector />
          </div>
        ))}

        <StaticNode
          label={`Modern ${LANGUAGES[language].englishName}`}
          form={word}
          final
          delay={tailDelay(mergeNodes + postMerge.length)}
        />
      </div>

      <p className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted">
        {(['attested', 'inferred', 'reconstructed'] as const)
          .filter((marker) => markersUsed.has(marker))
          .map((marker) => (
            <span key={marker} className="inline-flex items-center gap-1.5" aria-hidden="true">
              <span className={`size-2 rounded-full border ${MARKER_CLASS[marker]}`} />
              {MARKER_LABEL[marker]}
            </span>
          ))}
        <span>Select a stage to see its sources.</span>
      </p>
    </div>
  )
}
