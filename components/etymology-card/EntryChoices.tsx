'use client'
import type { ReactNode, KeyboardEventHandler } from 'react'

export function EntryChoices({
  label,
  onKeyDown,
  children,
}: {
  label: string
  onKeyDown?: KeyboardEventHandler<HTMLElement>
  children: ReactNode
}) {
  return (
    <nav
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-baseline gap-x-5 gap-y-2 pt-3 pb-1 font-serif"
    >
      {children}
    </nav>
  )
}
