'use client'

import { useTheme, type Theme } from '@/lib/hooks/useTheme'

const themeConfig: Record<Theme, { label: string; short: string; icon: string }> = {
  system: { label: 'System theme', short: 'Auto', icon: '◐' },
  light: { label: 'Light theme', short: 'Light', icon: '☀' },
  dark: { label: 'Dark theme', short: 'Dark', icon: '☾' },
}

const themeOrder: Theme[] = ['system', 'light', 'dark']

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      className="inline-flex items-center rounded-full border border-charcoal/15 bg-charcoal/5 p-0.5
      dark:border-cream/20 dark:bg-cream/10"
      role="group"
      aria-label="Theme selector"
    >
      {themeOrder.map((mode) => {
        const active = theme === mode

        return (
          <button
            key={mode}
            onClick={() => setTheme(mode)}
            aria-label={themeConfig[mode].label}
            aria-pressed={active}
            title={themeConfig[mode].label}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors duration-200 ${
              active
                ? 'bg-white text-charcoal shadow-sm dark:bg-[#3a3128] dark:text-[#f2e7d2]'
                : 'text-charcoal/60 hover:text-charcoal dark:text-cream/70 dark:hover:text-cream'
            }`}
          >
            <span className="text-[11px]">{themeConfig[mode].icon}</span>
            <span className="font-medium">{themeConfig[mode].short}</span>
          </button>
        )
      })}
    </div>
  )
}
