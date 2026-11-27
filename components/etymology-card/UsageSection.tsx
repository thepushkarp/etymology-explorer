'use client'

import { useMemo, useRef, useState } from 'react'
import type { NgramResult } from '@/lib/types'
import { Section } from './Section'

const WIDTH = 600
const HEIGHT = 120
const PAD = 4

/** Google Ngram values are relative frequencies; tiny ones read best per million words. */
export function formatFrequency(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0'
  if (count < 0.01) {
    const perMillion = count * 1_000_000
    return `${perMillion.toLocaleString('en', { maximumFractionDigits: 2 })} per million words`
  }
  return `${(count * 100).toLocaleString('en', { maximumFractionDigits: 2 })}%`
}

function UsageChart({ ngram }: { ngram: NgramResult }) {
  const [hover, setHover] = useState<number | null>(null)
  const boundsRef = useRef<DOMRect | null>(null)
  const { data } = ngram

  const { points, peak, line } = useMemo(() => {
    let max = 0
    let best = 0
    for (let index = 0; index < data.length; index++) {
      if (data[index].count > max) {
        max = data[index].count
        best = index
      }
    }
    const scale = max || 1
    const denom = Math.max(data.length - 1, 1)
    const computed = data.map((point, index) => ({
      x: PAD + (index / denom) * (WIDTH - PAD * 2),
      y: PAD + (1 - point.count / scale) * (HEIGHT - PAD * 2),
    }))
    const path = `M${computed.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join('L')}`
    return { points: computed, peak: best, line: path }
  }, [data])

  const shown = hover ?? peak

  const onPointerEnter = (event: React.PointerEvent<SVGSVGElement>) => {
    boundsRef.current = event.currentTarget.getBoundingClientRect()
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = boundsRef.current ?? event.currentTarget.getBoundingClientRect()
    boundsRef.current = bounds
    const ratio = (event.clientX - bounds.left) / bounds.width
    const next = Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))))
    setHover((current) => (current === next ? current : next))
  }

  const onPointerLeave = () => {
    boundsRef.current = null
    setHover(null)
  }

  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">
        <span className="font-serif text-ink">{data[shown].year}</span>
        {hover === null ? ' — peak usage, ' : ' — '}
        {formatFrequency(data[shown].count)}
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-28 w-full touch-none overflow-visible text-ink"
        role="img"
        aria-label={`Usage of ${ngram.word} in books, ${data[0].year}–${data[data.length - 1].year}`}
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} stroke="var(--rule)" />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={points[shown].x}
          x2={points[shown].x}
          y1={0}
          y2={HEIGHT}
          stroke="var(--faint)"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-muted">
        <span>{data[0].year}</span>
        <span>{data[data.length - 1].year}</span>
      </div>
    </figure>
  )
}

interface UsageSectionProps {
  ngram?: NgramResult
  unavailable?: boolean
}

export function UsageSection({ ngram, unavailable }: UsageSectionProps) {
  if (ngram && ngram.data.length > 1) {
    return (
      <Section id="entry-usage" title="Usage over time">
        <UsageChart ngram={ngram} />
      </Section>
    )
  }
  if (!unavailable) return null
  return (
    <Section id="entry-usage" title="Usage over time">
      <p className="font-serif italic text-muted">
        Usage history is not available for this word yet.
      </p>
    </Section>
  )
}
