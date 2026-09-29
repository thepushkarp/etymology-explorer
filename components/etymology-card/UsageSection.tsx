'use client'

import { useMemo, useState } from 'react'
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
  const { data } = ngram

  const points = useMemo(() => {
    const max = Math.max(...data.map((point) => point.count)) || 1
    return data.map((point, index) => ({
      x: PAD + (index / Math.max(data.length - 1, 1)) * (WIDTH - PAD * 2),
      y: PAD + (1 - point.count / max) * (HEIGHT - PAD * 2),
    }))
  }, [data])

  const peak = data.reduce(
    (best, point, index) => (point.count > data[best].count ? index : best),
    0
  )
  const shown = hover ?? peak
  const line = `M${points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join('L')}`

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - bounds.left) / bounds.width
    setHover(Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1)))))
  }

  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted" aria-live="polite">
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
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
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
  title: string
  unavailableMessage: string
}

export function UsageSection({ ngram, unavailable, title, unavailableMessage }: UsageSectionProps) {
  if (ngram && ngram.data.length > 1) {
    return (
      <Section id="entry-usage" title={title}>
        <UsageChart ngram={ngram} />
      </Section>
    )
  }
  if (!unavailable) return null
  return (
    <Section id="entry-usage" title={title}>
      <p className="font-serif italic text-muted">{unavailableMessage}</p>
    </Section>
  )
}
