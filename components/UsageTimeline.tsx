'use client'

import { useMemo } from 'react'
import type { NgramResult } from '@/lib/types'

interface UsageTimelineProps {
  data: NgramResult['data']
  word: string
  height?: number
  showYearLabels?: boolean
}

export default function UsageTimeline({
  data,
  word,
  height = 60,
  showYearLabels = false,
}: UsageTimelineProps) {
  const { path, areaPath, maxCount, minYear, maxYear } = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        path: '',
        areaPath: '',
        maxCount: 0,
        minYear: 0,
        maxYear: 0,
      }
    }

    const width = 200
    const padding = 4
    const effectiveWidth = width - padding * 2
    const effectiveHeight = height - padding * 2

    const counts = data.map((d) => d.count)
    const max = Math.max(...counts)
    const years = data.map((d) => d.year)
    const minY = Math.min(...years)
    const maxY = Math.max(...years)

    const points = data.map((d, i) => {
      const x = data.length === 1 ? width / 2 : padding + (i / (data.length - 1)) * effectiveWidth
      const normalized = max === 0 ? 0 : d.count / max
      const y = padding + effectiveHeight - normalized * effectiveHeight
      return { x, y }
    })

    const linePath = `M ${points.map((point) => `${point.x},${point.y}`).join(' L ')}`
    const fillPath = `${linePath} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`

    return {
      path: linePath,
      areaPath: fillPath,
      maxCount: max,
      minYear: minY,
      maxYear: maxY,
    }
  }, [data, height])

  if (!data || data.length === 0) return null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 200 ${height}`}
        className="w-full h-auto text-charcoal/65"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Usage timeline for ${word}`}
      >
        <defs>
          <linearGradient id={`ngram-gradient-${word}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill={`url(#ngram-gradient-${word})`} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>

      {showYearLabels && (
        <div className="mt-1 flex justify-between text-[11px] text-charcoal-light/70">
          <span>{minYear}</span>
          <span>{maxYear}</span>
        </div>
      )}

      <div className="mt-1 text-[11px] text-charcoal-light/70">
        Peak usage: {maxCount.toLocaleString(undefined, { maximumSignificantDigits: 3 })}
      </div>
    </div>
  )
}
