'use client'

import { useTheme, type Theme } from '@/lib/hooks/useTheme'

const themeConfig: Record<Theme, { label: string; icon: string; next: Theme }> = {
  system: { label: 'System theme', icon: '◐', next: 'light' },
  light: { label: 'Light theme', icon: '☀', next: 'dark' },
  dark: { label: 'Dark theme', icon: '☾', next: 'system' },
}

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const config = themeConfig[theme]

  return (
    <button
      onClick={() => setTheme(config.next)}
      aria-label={`${config.label} — click to switch to ${themeConfig[config.next].label.toLowerCase()}`}
      title={config.label}
      className="text-charcoal/60 hover:text-charcoal dark:text-cream/60 dark:hover:text-cream
        transition-colors duration-200 text-lg px-2 py-1 rounded
        hover:bg-charcoal/5 dark:hover:bg-cream/5"
    >
      <span className="inline-block transition-transform duration-200 hover:scale-110">
        {config.icon}
      </span>
    </button>
  )
}
