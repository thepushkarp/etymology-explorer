'use client'

import { useEffect, useState } from 'react'

export type CostMode = 'normal' | 'degraded' | 'cache_only' | 'blocked'

interface CostModeIndicatorProps {
  initialMode?: CostMode
}

export default function CostModeIndicator({ initialMode = 'normal' }: CostModeIndicatorProps) {
  const [mode] = useState<CostMode>(() => {
    if (typeof window === 'undefined') return initialMode
    const saved = localStorage.getItem('cost-mode')
    return saved && ['normal', 'degraded', 'cache_only', 'blocked'].includes(saved)
      ? (saved as CostMode)
      : initialMode
  })

  if (mode === 'normal') return null

  const indicators = {
    normal: { icon: '', label: '', className: '' },
    degraded: { icon: '⚡', label: 'Fast mode', className: 'bg-amber-100 text-amber-800' },
    cache_only: { icon: '📦', label: 'Cached only', className: 'bg-stone-100 text-stone-600' },
    blocked: { icon: '🚫', label: 'Try tomorrow', className: 'bg-rose-100 text-rose-800' },
  }

  const { icon, label, className } = indicators[mode]

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
      title={
        mode === 'degraded'
          ? 'Some sources skipped to save budget'
          : mode === 'cache_only'
            ? 'Daily budget exhausted, showing cached results'
            : 'Daily budget exhausted'
      }
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
    </div>
  )
}
