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

/** Anything the details panel can describe: a stage, or the combined form. */
type NodeInfo = Pick<AncestryStage, 'stage' | 'form' | 'note'> & Partial<AncestryStage>

/** Reconstructed and model-inferred forms are not directly attested in the sources. */
function isAttested(node: NodeInfo): boolean {
  return !node.isReconstructed && node.confidence !== 'low'
}

function provenance(node: NodeInfo): string | null {
  if (node.isReconstructed) {
    return 'Reconstructed: never written down, inferred by comparing its descendants.'
  }
  switch (node.confidence) {
    case 'high':
      return 'Found in two or more of the sources consulted.'
    case 'medium':
      return 'Found in one of the sources consulted.'
    case 'low':
      return 'Not found in the sources consulted; inferred by the model.'
    default:
      return null
  }
}

const STEP_MS = 60
const LABEL = 'label block text-[0.625rem] tracking-[0.08em] sm:text-xs sm:tracking-[0.14em]'
const BOX = 'w-full max-w-60 border px-2 py-2 text-center sm:px-4 sm:py-3'

function Connector({ grow = false }: { grow?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`block w-px bg-faint/60 ${grow ? 'min-h-4 flex-1' : 'h-4 sm:h-6'}`}
    />
  )
}

function Node({
  id,
  node,
  open,
  onToggle,
  delay,
}: {
  id: string
  node: NodeInfo
  open: boolean
  onToggle: (id: string) => void
  delay: number
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      aria-expanded={open}
      aria-controls={`${id}-details`}
      style={{ animationDelay: `${delay}ms` }}
      className={`animate-rise ${BOX} transition-[border-color,background-color,transform] duration-200 ${
        isAttested(node) ? '' : 'border-dashed'
      } ${open ? 'border-ink bg-wash' : 'border-faint/70 hover:-translate-y-px hover:border-muted'}`}
    >
      <span className={LABEL}>{node.stage}</span>
      <span className="mt-0.5 block break-words font-serif text-base italic text-ink sm:mt-1 sm:text-lg">
        {node.form}
      </span>
    </button>
  )
}

function Details({ id, node }: { id: string; node: NodeInfo }) {
  const ref = useRef<HTMLDivElement>(null)
  const line = provenance(node)

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [id])

  return (
    <div
      ref={ref}
      id={`${id}-details`}
      role="region"
      aria-label={`${node.stage} ${node.form}`}
      className="animate-rise mx-auto mt-6 max-w-lg border-t border-ink pt-4 text-sm"
      style={{ animationDuration: '200ms' }}
    >
      <p className="label">{node.stage}</p>
      <p className="mt-1 font-serif text-lg">
        <em>{node.form}</em>
        {node.note && <span className="text-muted"> — {node.note}</span>}
      </p>
      {line && <p className="mt-2 text-muted">{line}</p>}
      {node.evidence && node.evidence.length > 0 && (
        <ul className="mt-3 space-y-2">
          {node.evidence.map((item, index) => (
            <li key={`${item.source}-${index}`} className="leading-snug">
              <span className="label mr-2">{sourceLabel(item.source)}</span>
              <q className="font-serif italic">{item.snippet}</q>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Curves joining the bottom of each branch column into the node below. */
function MergeCurves({ count }: { count: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-6 w-full text-faint sm:h-8"
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

  // Close the details on Escape or on a click outside the tree.
  useEffect(() => {
    if (!openId) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenId(null)
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

  const split = branches.length > 1
  const columns = branches.length === 3 ? 3 : 2
  const combined: NodeInfo | null =
    split && mergePoint ? { stage: 'Combined', form: mergePoint.form, note: mergePoint.note } : null

  // Every selectable node by id, so the shared details panel can look one up.
  const nodes = new Map<string, NodeInfo>()
  const node = (key: string, info: NodeInfo, delay: number) => {
    const id = `${treeId}-${key}`
    nodes.set(id, info)
    return (
      <Node
        key={key}
        id={id}
        node={info}
        open={openId === id}
        onToggle={(clicked) => setOpenId((current) => (current === clicked ? null : clicked))}
        delay={delay}
      />
    )
  }

  // Nodes reveal top to bottom; the joined tail starts after the longest branch.
  const tailStart = Math.max(...branches.map((branch) => branch.stages.length))
  const tailDelay = (index: number) => (tailStart + index) * STEP_MS
  const mergeOffset = combined ? 1 : 0
  const hasUnattested = [...branches.flatMap((branch) => branch.stages), ...postMerge].some(
    (stage) => !isAttested(stage)
  )

  const branchColumns = branches.map((branch, branchIndex) => (
    <div
      key={`${branch.root}-${branchIndex}`}
      className="flex w-full min-w-0 flex-col items-center"
    >
      {split && (
        <p className="mb-2 max-w-full truncate font-serif text-sm italic text-ink sm:mb-3">
          {branch.root}
        </p>
      )}
      {branch.stages.map((stage, index) => (
        <div key={index} className="flex w-full flex-col items-center">
          {index > 0 && <Connector />}
          {node(`${branchIndex}-${index}`, stage, index * STEP_MS)}
        </div>
      ))}
      {/* Stretch to the column bottom so every branch meets the merge curves. */}
      {split && <Connector grow />}
    </div>
  ))

  const openNode = openId ? nodes.get(openId) : undefined

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
        {split ? (
          <>
            <div
              className={`grid w-full gap-x-2 gap-y-6 sm:gap-x-6 ${
                columns === 3 ? 'grid-cols-3' : 'grid-cols-2'
              }`}
            >
              {branchColumns}
            </div>
            <MergeCurves count={columns} />
          </>
        ) : (
          <>
            {branchColumns}
            <Connector />
          </>
        )}

        {combined && (
          <>
            {node('merge', combined, tailDelay(0))}
            <Connector />
          </>
        )}
        {postMerge.map((stage, index) => (
          <div key={index} className="flex w-full flex-col items-center">
            {node(`post-${index}`, stage, tailDelay(mergeOffset + index))}
            <Connector />
          </div>
        ))}
        <div
          className={`animate-rise ${BOX} border-accent`}
          style={{ animationDelay: `${tailDelay(mergeOffset + postMerge.length)}ms` }}
        >
          <span className={LABEL}>Modern {LANGUAGES[language].englishName}</span>
          <span className="mt-0.5 block font-serif text-lg text-ink sm:mt-1 sm:text-xl">
            {word}
          </span>
        </div>
      </div>

      {openId && openNode && <Details id={openId} node={openNode} />}

      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
        {hasUnattested && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-4 border border-dashed border-muted"
            />
            not directly attested
          </span>
        )}
        {!openId && <span>Select a stage for details</span>}
      </p>
    </div>
  )
}
