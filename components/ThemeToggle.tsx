'use client'

import { MoonIcon, SunIcon } from '@/components/Icons'

// The inline script in app/layout.tsx applies the stored preference before
// paint; the icon is picked by CSS so the button needs no hydration state.
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark')
  try {
    localStorage.setItem('theme-preference', isDark ? 'dark' : 'light')
  } catch {
    // Storage may be unavailable (private mode); the toggle still applies.
  }
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      className="-m-2 p-2 text-lg text-muted transition-colors hover:text-ink"
    >
      <SunIcon className="dark:hidden" />
      <MoonIcon className="hidden dark:block" />
    </button>
  )
}
