import type { ReactNode, KeyboardEventHandler } from 'react'

/** Shared geometry for URL-addressable etymological meanings. */
export function EntryChoices({
  label,
  onKeyDown,
  children,
}: {
  label: string
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  children: ReactNode
}) {
  return (
    <div
      role="navigation"
      onKeyDown={onKeyDown}
      aria-label={label}
      className="mt-8 grid grid-cols-1 gap-x-8 gap-y-3 border-b border-rule sm:grid-cols-2"
    >
      {children}
    </div>
  )
}

export function entryChoiceClass(selected: boolean): string {
  return `-mb-px min-w-0 border-b pb-3 text-left transition-colors ${selected ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`
}

function numeral(value: number): string {
  let text = ''
  for (const [number, symbol] of [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ] as const) {
    while (value >= number) {
      text += symbol
      value -= number
    }
  }
  return text
}

export function EntryChoiceLabel({
  index,
  details,
  children,
}: {
  index: number
  details: string
  children: ReactNode
}) {
  return (
    <>
      <span className="label block">
        {numeral(index + 1)} · {details}
      </span>
      <span className="mt-1 line-clamp-2 block min-h-[3em] font-serif leading-normal">
        {children}
      </span>
    </>
  )
}
