'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AncestryGraph, AncestryStage } from '@/lib/types'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import { sourceLabel } from '@/lib/sourceLabels'

interface AncestryTreeProps {
  graph: AncestryGraph
  word: string
  language?: LanguageCode
  /** Shown when the modern word's node is selected. */
  definition?: string
}

type Family = 'pie' | 'greek' | 'latin' | 'romance' | 'germanic' | 'semitic' | 'other'

// Order matters: "Proto-Germanic" is Germanic, "Anglo-Norman" Romance, "Anglo-Latin" Latin.
const FAMILY_PATTERNS: Array<[Family, RegExp]> = [
  ['pie', /indo-european|\bPIE\b/i],
  ['latin', /latin/i],
  ['greek', /greek/i],
  [
    'romance',
    /french|norman|italian|spanish|castilian|portuguese|galician|catalan|occitan|provençal|romanian/i,
  ],
  [
    'germanic',
    /english|germanic|norse|dutch|german|frisian|gothic|saxon|icelandic|danish|swedish|norwegian|scots/i,
  ],
  ['semitic', /arabic|hebrew|aramaic|akkadian|phoenician|syriac/i],
]

const FAMILY: Record<Family, { label: string; stripe: string; swatch: string }> = {
  pie: { label: 'Proto-Indo-European', stripe: 'border-t-lang-pie', swatch: 'bg-lang-pie' },
  greek: { label: 'Greek', stripe: 'border-t-lang-greek', swatch: 'bg-lang-greek' },
  latin: { label: 'Latin', stripe: 'border-t-lang-latin', swatch: 'bg-lang-latin' },
  romance: { label: 'Romance', stripe: 'border-t-lang-romance', swatch: 'bg-lang-romance' },
  germanic: { label: 'Germanic', stripe: 'border-t-lang-germanic', swatch: 'bg-lang-germanic' },
  semitic: { label: 'Semitic', stripe: 'border-t-lang-semitic', swatch: 'bg-lang-semitic' },
  other: { label: 'Other', stripe: 'border-t-lang-other', swatch: 'bg-lang-other' },
}

function familyOf(stage: string): Family {
  return FAMILY_PATTERNS.find(([, pattern]) => pattern.test(stage))?.[0] ?? 'other'
}

type Kind = 'stage' | 'merge' | 'final'

interface TreeNode {
  key: string
  kind: Kind
  stage: string
  form: string
  note?: string
  family?: Family
  source?: AncestryStage
  delay: number
}

type Offset = { x: number; y: number }

/** Reconstructed and model-inferred forms are not directly attested in the sources. */
function isAttested(stage?: AncestryStage): boolean {
  return !stage || (!stage.isReconstructed && stage.confidence !== 'low')
}

function provenance(stage?: AncestryStage): string | null {
  if (!stage) return null
  if (stage.isReconstructed) {
    return 'Reconstructed: never written down, inferred by comparing its descendants.'
  }
  switch (stage.confidence) {
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
const LONG_PRESS_MS = 250

/** Build every node up front, plus the edges between them, in reveal order. */
function buildTree(
  graph: AncestryGraph,
  word: string,
  language: LanguageCode,
  definition?: string
) {
  const { branches, mergePoint, postMerge = [] } = graph
  const split = branches.length > 1
  const stageNode = (key: string, stage: AncestryStage, delay: number): TreeNode => ({
    key,
    kind: 'stage',
    stage: stage.stage,
    form: stage.form,
    note: stage.note,
    family: familyOf(stage.stage),
    source: stage,
    delay,
  })

  const columns = branches.map((branch, b) =>
    branch.stages.map((stage, i) => stageNode(`b${b}-${i}`, stage, i * STEP_MS))
  )
  let step = Math.max(...columns.map((column) => column.length))
  const tail: TreeNode[] = []
  if (split && mergePoint) {
    tail.push({
      key: 'merge',
      kind: 'merge',
      stage: 'Combined',
      form: mergePoint.form,
      note: mergePoint.note,
      delay: step++ * STEP_MS,
    })
  }
  postMerge.forEach((stage, i) => tail.push(stageNode(`p${i}`, stage, step++ * STEP_MS)))
  tail.push({
    key: 'final',
    kind: 'final',
    stage: `Modern ${LANGUAGES[language].englishName}`,
    form: word,
    note: definition,
    delay: step * STEP_MS,
  })

  const edges: Array<[string, string]> = []
  for (const column of columns) {
    column.forEach((node, i) => {
      const next = column[i + 1] ?? tail[0]
      edges.push([node.key, next.key])
    })
  }
  tail.slice(1).forEach((node, i) => edges.push([tail[i].key, node.key]))

  return { split, columns, tail, edges }
}

/** State that resets whenever the graph changes (new word, new homograph history). */
function useGraphState<T>(graph: AncestryGraph, initial: T) {
  const [state, setState] = useState({ graph, value: initial })
  const value = state.graph === graph ? state.value : initial
  const set = useCallback(
    (next: T | ((current: T) => T)) =>
      setState((current) => {
        const base = current.graph === graph ? current.value : initial
        const resolved = typeof next === 'function' ? (next as (c: T) => T)(base) : next
        return { graph, value: resolved }
      }),
    // `initial` is a fresh literal each render; only the graph identity matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph]
  )
  return [value, set] as const
}

export function AncestryTree({ graph, word, language = 'en', definition }: AncestryTreeProps) {
  const [openKey, setOpenKey] = useGraphState<string | null>(graph, null)
  const [offsets, setOffsets] = useGraphState<Record<string, Offset>>(graph, {})
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [paths, setPaths] = useState<string[]>([])
  const canvasRef = useRef<HTMLDivElement>(null)
  const nodeEls = useRef(new Map<string, HTMLElement>())
  const drag = useRef<{
    key: string
    pointerId: number
    startX: number
    startY: number
    base: Offset
    min: Offset
    max: Offset
    active: boolean
    moved: boolean
    timer?: ReturnType<typeof setTimeout>
  } | null>(null)
  const suppressClick = useRef(false)

  const { split, columns, tail, edges } = buildTree(graph, word, language, definition)
  const nodes = [...columns.flat(), ...tail]
  // Edges are measured from the rendered nodes, so they follow drags, wrapping, and resizes.
  // Runs after every render and bails out when nothing moved.
  const measure = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c = canvas.getBoundingClientRect()
    const next = edges.map(([from, to]) => {
      const a = nodeEls.current.get(from)?.getBoundingClientRect()
      const b = nodeEls.current.get(to)?.getBoundingClientRect()
      if (!a || !b) return ''
      const x1 = Math.round(a.left + a.width / 2 - c.left)
      const y1 = Math.round(a.bottom - c.top)
      const x2 = Math.round(b.left + b.width / 2 - c.left)
      const y2 = Math.round(b.top - c.top)
      const bend = Math.max(Math.abs(y2 - y1) / 2, 16)
      return `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`
    })
    setPaths((previous) => (previous.join() === next.join() ? previous : next))
  }
  const measureRef = useRef(measure)

  useLayoutEffect(() => {
    measureRef.current = measure
    measure()
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => measureRef.current())
    observer.observe(canvas)
    nodeEls.current.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [graph])

  // Close the details on Escape, or on any click that is not on a node or the panel.
  useEffect(() => {
    if (!openKey) return
    // On click (not pointerdown) so closing the panel never shifts what was clicked.
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (!target?.closest('[data-tree-node], [data-tree-details]')) setOpenKey(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenKey(null)
    }
    document.addEventListener('click', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openKey, setOpenKey])

  // While a touch drag is active, stop the page from scrolling under the finger.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onTouchMove = (event: TouchEvent) => {
      if (drag.current?.active) event.preventDefault()
    }
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => canvas.removeEventListener('touchmove', onTouchMove)
  }, [])

  const endDrag = () => {
    const current = drag.current
    if (!current) return
    clearTimeout(current.timer)
    if (current.moved) {
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
    }
    drag.current = null
    setDraggingKey(null)
  }

  const onPointerDown = (key: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !canvasRef.current) return
    const c = canvasRef.current.getBoundingClientRect()
    const r = event.currentTarget.getBoundingClientRect()
    const base = offsets[key] ?? { x: 0, y: 0 }
    const touch = event.pointerType === 'touch'
    drag.current = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base,
      // Keep the node inside the tree's box.
      min: { x: c.left - r.left, y: c.top - r.top },
      max: { x: c.right - r.right, y: c.bottom - r.bottom },
      active: false,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    // Touch drags start after a short press, so an ordinary swipe still scrolls the page.
    if (touch) {
      drag.current.timer = setTimeout(() => {
        if (drag.current?.key !== key) return
        drag.current.active = true
        setDraggingKey(key)
        navigator.vibrate?.(8)
      }, LONG_PRESS_MS)
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || event.pointerId !== current.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.active) {
      if (event.pointerType === 'touch') {
        if (Math.hypot(dx, dy) > 8) endDrag()
        return
      }
      if (Math.hypot(dx, dy) < 4) return
      current.active = true
      setDraggingKey(current.key)
    }
    current.moved = true
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    setOffsets((previous) => ({
      ...previous,
      [current.key]: {
        x: current.base.x + clamp(dx, current.min.x, current.max.x),
        y: current.base.y + clamp(dy, current.min.y, current.max.y),
      },
    }))
  }

  const onClick = (key: string) => {
    if (suppressClick.current) return
    setOpenKey((current) => (current === key ? null : key))
  }

  if (graph.branches.length === 0) return null

  const renderNode = (node: TreeNode) => {
    const offset = offsets[node.key]
    const open = openKey === node.key
    return (
      <button
        key={node.key}
        ref={(element) => {
          if (element) nodeEls.current.set(node.key, element)
          else nodeEls.current.delete(node.key)
        }}
        type="button"
        data-tree-node
        onClick={() => onClick(node.key)}
        onPointerDown={onPointerDown(node.key)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={(event) => event.preventDefault()}
        aria-expanded={open}
        aria-controls={open ? 'tree-details' : undefined}
        style={{
          animationDelay: `${node.delay}ms`,
          translate: offset ? `${offset.x}px ${offset.y}px` : undefined,
        }}
        className={`animate-rise relative w-full max-w-60 cursor-grab select-none border bg-paper px-2 py-2 text-center [-webkit-touch-callout:none] sm:px-4 sm:py-3 ${
          draggingKey === node.key
            ? 'z-10 cursor-grabbing'
            : 'transition-[border-color,background-color]'
        } ${node.family ? `border-t-2 ${FAMILY[node.family].stripe}` : ''} ${
          isAttested(node.source) ? '' : 'border-dashed'
        } ${
          node.kind === 'final'
            ? open
              ? 'border-accent bg-wash'
              : 'border-accent'
            : open
              ? 'border-x-ink border-b-ink bg-wash'
              : 'border-x-faint/70 border-b-faint/70 hover:border-x-muted hover:border-b-muted'
        } ${node.family ? '' : node.kind === 'final' ? '' : open ? 'border-t-ink' : 'border-t-faint/70'}`}
      >
        <span className={LABEL}>{node.stage}</span>
        <span
          className={`mt-0.5 block break-words font-serif text-ink sm:mt-1 ${
            node.kind === 'final' ? 'text-lg sm:text-xl' : 'text-base italic sm:text-lg'
          }`}
        >
          {node.form}
        </span>
      </button>
    )
  }

  const openNode = nodes.find((node) => node.key === openKey)
  const families = [...new Set(nodes.map((node) => node.family).filter(Boolean))] as Family[]
  const hasUnattested = nodes.some((node) => !isAttested(node.source))
  const moved = Object.keys(offsets).length > 0
  const gap = 'gap-5 sm:gap-7'

  return (
    <div>
      {graph.convergencePoints?.map((point, index) => (
        <p key={`${point.pieRoot}-${index}`} className="mb-6 font-serif text-sm italic text-muted">
          {point.branchIndices.map((i) => graph.branches[i]?.root ?? '?').join(' and ')} share
          Proto-Indo-European <span className="text-ink">*{point.pieRoot.replace(/^\*/, '')}</span>{' '}
          &lsquo;{point.meaning}&rsquo;.
        </p>
      ))}

      <div ref={canvasRef} className="relative" onAnimationEnd={() => measureRef.current()}>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-faint"
          fill="none"
        >
          {paths.map((d, index) => d && <path key={index} d={d} stroke="currentColor" />)}
        </svg>

        {split ? (
          <div
            className={`grid items-start gap-x-2 sm:gap-x-6 ${
              columns.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
            }`}
          >
            {columns.map((column, b) => (
              <div key={b} className={`flex min-w-0 flex-col items-center ${gap}`}>
                <p className="-mb-2 max-w-full truncate font-serif text-sm italic text-ink sm:-mb-4">
                  {graph.branches[b].root}
                </p>
                {column.map(renderNode)}
              </div>
            ))}
          </div>
        ) : (
          <div className={`flex flex-col items-center ${gap}`}>{columns[0].map(renderNode)}</div>
        )}

        <div
          className={`flex flex-col items-center ${gap} ${split ? 'mt-10 sm:mt-12' : 'mt-5 sm:mt-7'}`}
        >
          {tail.map(renderNode)}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {families.map((family) => (
          <span key={family} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block h-0.5 w-4 ${FAMILY[family].swatch}`}
            />
            {FAMILY[family].label}
          </span>
        ))}
        {hasUnattested && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-4 border border-dashed border-muted"
            />
            not directly attested
          </span>
        )}
        {moved ? (
          <button type="button" onClick={() => setOffsets({})} className="link text-muted">
            Reset layout
          </button>
        ) : (
          !openNode && <span>Select a stage for details, or drag it</span>
        )}
      </div>
      {openNode && <TreeDetails node={openNode} onClose={() => setOpenKey(null)} />}
    </div>
  )
}

function TreeDetails({ node, onClose }: { node: TreeNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const line = provenance(node.source)

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [node.key])

  return (
    <div
      ref={ref}
      id="tree-details"
      data-tree-details
      role="region"
      aria-label="Selected stage"
      className="animate-rise mx-auto mt-6 max-w-lg border-t border-ink pt-3 text-sm"
      style={{ animationDuration: '200ms' }}
    >
      <div className="flex items-center justify-between">
        <p className="label">Selected stage</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="-mr-2 px-2 text-lg leading-none text-muted transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-muted">
        {node.family && (
          <span
            aria-hidden="true"
            className={`inline-block h-0.5 w-4 ${FAMILY[node.family].swatch}`}
          />
        )}
        {node.stage}
      </p>
      <p className="mt-1 font-serif text-lg">
        <em className={node.kind === 'final' ? 'not-italic' : ''}>{node.form}</em>
        {node.note && <span className="text-muted"> — {node.note}</span>}
      </p>
      {line && <p className="mt-2 text-muted">{line}</p>}
      {node.source?.evidence && node.source.evidence.length > 0 && (
        <ul className="mt-3 space-y-2">
          {node.source.evidence.map((item, index) => (
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
