'use client'

import { useState } from 'react'

export type CostMode = 'normal' | 'cache_only'

interface CostModeIndicatorProps {
  initialMode?: CostMode
}

export default function CostModeIndicator({ initialMode = 'normal' }: CostModeIndicatorProps) {
  const [mode] = useState<CostMode>(() => {
    if (typeof window === 'undefined') return initialMode
    const saved = localStorage.getItem('cost-mode')
    return saved === 'cache_only' ? 'cache_only' : initialMode
  })

  if (mode === 'normal') return null

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-stone-800/30 dark:text-stone-400"
      title="Monthly budget reached — showing cached results only"
    >
      <span>📦</span>
      <span>Cached only</span>
    </div>
  )
}
