'use client'

import { useMemo } from 'react'
import type { NgramResult } from '@/lib/types'

interface UsageTimelineProps {
  data: NgramResult['data']
  word: string
  height?: number
  showYearLabels?: boolean
}

function formatPeakUsage(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0'

  // Google Ngram values are relative frequencies. Tiny values are easier to read as "per million".
  if (count < 0.01) {
    const perMillion = count * 1_000_000
    return `${perMillion.toLocaleString(undefined, { maximumFractionDigits: 2 })} per million words`
  }

  if (count < 1) {
    return `${(count * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
  }

  return count.toLocaleString(undefined, { maximumSignificantDigits: 3 })
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

  const decadeTicks = useMemo(() => {
    if (minYear === 0 || maxYear === 0 || maxYear <= minYear) return []

    const startDecade = Math.ceil(minYear / 10) * 10
    const endDecade = Math.floor(maxYear / 10) * 10
    const range = maxYear - minYear
    const ticks: Array<{ year: number; offsetPercent: number }> = []

    for (let year = startDecade; year <= endDecade; year += 10) {
      ticks.push({
        year,
        offsetPercent: ((year - minYear) / range) * 100,
      })
    }

    return ticks
  }, [minYear, maxYear])

  if (!data || data.length === 0) return null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 200 ${height}`}
        className="w-full h-auto text-charcoal/70"
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

      {showYearLabels && decadeTicks.length > 0 && (
        <div className="mt-1 relative h-8">
          <div className="absolute inset-x-0 top-0 h-px bg-charcoal/15" />
          {decadeTicks.map((tick) => (
            <div
              key={tick.year}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${tick.offsetPercent}%` }}
            >
              <span className="mx-auto block h-1.5 w-px bg-charcoal/35" />
              <span className="mt-0.5 block origin-top -rotate-45 text-[9px] leading-none text-charcoal-light/75 font-mono tabular-nums">
                {tick.year}
              </span>
            </div>
          ))}
        </div>
      )}

      {showYearLabels && decadeTicks.length === 0 && (
        <div className="mt-1 flex justify-between text-[11px] text-charcoal-light/75">
          <span className="font-mono tabular-nums">{minYear}</span>
          <span className="font-mono tabular-nums">{maxYear}</span>
        </div>
      )}

      <div className="mt-2 text-[11px] text-charcoal-light/75">
        Peak usage: {formatPeakUsage(maxCount)}
      </div>
    </div>
  )
}
