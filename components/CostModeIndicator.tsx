'use client'

import { useState } from 'react'

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
    degraded: {
      icon: '⚡',
      label: 'Fast mode',
      className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
    },
    cache_only: {
      icon: '📦',
      label: 'Cached only',
      className: 'bg-stone-100 dark:bg-stone-800/30 text-stone-600 dark:text-stone-400',
    },
    blocked: {
      icon: '🚫',
      label: 'Try next month',
      className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300',
    },
  }

  const { icon, label, className } = indicators[mode]

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
      title={
        mode === 'degraded'
          ? 'Some sources skipped to save budget'
          : mode === 'cache_only'
            ? 'Monthly budget exhausted, showing cached results'
            : 'Monthly budget exhausted'
      }
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
    </div>
  )
}
