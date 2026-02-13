'use client'

import { useSyncExternalStore } from 'react'
import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { useTheme, type Theme } from '@/lib/hooks/useTheme'

const themeConfig: Record<Theme, { label: string; next: Theme }> = {
  light: { label: 'Light', next: 'dark' },
  dark: { label: 'Dark', next: 'system' },
  system: { label: 'Auto', next: 'light' },
}

const themeIcon = {
  light: SunIcon,
  dark: MoonIcon,
  system: ComputerDesktopIcon,
} as const

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  if (!hydrated) {
    return (
      <button
        aria-label="Theme selector"
        className="inline-flex items-center gap-2.5 rounded-full border border-charcoal/25 bg-surface px-4 py-2
        text-sm font-semibold text-charcoal shadow-sm"
      >
        <ComputerDesktopIcon className="h-4 w-4" />
        <span>Auto</span>
      </button>
    )
  }

  const current = themeConfig[theme]
  const next = themeConfig[current.next]
  const Icon = themeIcon[theme]

  return (
    <button
      onClick={() => setTheme(current.next)}
      aria-label={`Theme: ${current.label}. Click to switch to ${next.label}`}
      title={`Theme: ${current.label} (next: ${next.label})`}
      className="inline-flex items-center gap-2.5 rounded-full border border-charcoal/25 bg-surface px-4 py-2
      text-sm font-semibold text-charcoal shadow-sm transition-colors duration-200
      hover:bg-cream-dark/60 hover:border-charcoal/45"
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
      <span>{current.label}</span>
    </button>
  )
}
