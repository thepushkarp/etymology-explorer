'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDownIcon } from './Icons'
import { LANGUAGES, SUPPORTED_LANGUAGE_CODES, type LanguageCode } from '@/lib/languages'

const options = [
  { value: undefined, label: 'Auto' },
  ...SUPPORTED_LANGUAGE_CODES.map((value) => ({ value, label: LANGUAGES[value].englishName })),
]

export function LanguageSelect({
  value,
  onChange,
  compact = false,
}: {
  value?: LanguageCode
  onChange: (language?: LanguageCode) => void
  compact?: boolean
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const items = useRef<Array<HTMLLIElement | null>>([])
  const typed = useRef({ text: '', at: 0 })
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  )
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(selected)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  useEffect(() => {
    const item = open ? items.current[active] : null
    const menu = item?.parentElement
    if (!item || !menu) return
    // Scroll the options, keeping the surrounding reading page in place.
    if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop
    else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight)
      menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight
  }, [open, active])

  function choose(index: number) {
    onChange(options[index].value)
    setOpen(false)
    trigger.current?.focus()
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    // Typeahead owns letter keys while focused, including the page's pronunciation shortcut.
    event.stopPropagation()
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(active)
      else {
        setActive(selected)
        setOpen(true)
        typed.current.text = ''
      }
      return
    }
    const moves: Record<string, number> = {
      ArrowDown: open ? (active + 1) % options.length : selected,
      ArrowUp: open ? (active + options.length - 1) % options.length : selected,
      Home: 0,
      End: options.length - 1,
    }
    if (event.key in moves) {
      event.preventDefault()
      setActive(moves[event.key])
      setOpen(true)
      typed.current.text = ''
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      const now = Date.now()
      const text =
        (now - typed.current.at < 700 ? typed.current.text : '') + event.key.toLowerCase()
      typed.current = { text, at: now }
      const prefix = new Set(text).size === 1 ? text[0] : text
      const start = open ? active : selected
      const index = Array.from(
        { length: options.length },
        (_, offset) => (start + offset + 1) % options.length
      ).find((index) => options[index].label.toLowerCase().startsWith(prefix))
      if (index !== undefined) {
        setActive(index)
        setOpen(true)
      }
    }
  }

  return (
    <div
      ref={root}
      className={`relative shrink-0 ${compact ? '' : 'flex items-center gap-4'}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      {!compact && (
        <span id={`${id}-label`} className="text-sm text-muted">
          Language
        </span>
      )}
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label="Word language"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        onKeyDown={keyDown}
        onClick={() => {
          setActive(selected)
          setOpen(!open)
          typed.current.text = ''
        }}
        className={`flex items-center justify-between gap-2 border-rule text-left text-sm text-ink transition-colors hover:border-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${compact ? 'h-[46px] w-28 border px-2' : 'min-h-11 w-32 border-b'}`}
      >
        <span>
          {compact && (
            <span id={`${id}-label`} className="block text-xs leading-4 text-muted">
              Language
            </span>
          )}
          <span className="block leading-5">{options[selected].label}</span>
        </span>
        <ChevronDownIcon className="text-xs text-muted" />
      </button>
      {open && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className={`absolute top-full z-30 mt-2 max-h-[min(20rem,60vh)] w-44 overflow-y-auto overscroll-contain border border-rule bg-paper py-1 text-sm ${compact ? 'right-0' : 'left-0'}`}
        >
          {options.map((option, index) => (
            <li
              key={option.value ?? 'auto'}
              id={`${id}-option-${index}`}
              ref={(element) => {
                items.current[index] = element
              }}
              role="option"
              aria-label={option.label}
              aria-selected={selected === index}
              onPointerDown={(event) => event.preventDefault()}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-4 px-4 ${active === index ? 'bg-wash' : ''} ${selected === index ? 'text-accent' : 'text-ink'}`}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="w-3">
                  {selected === index ? '✓' : ''}
                </span>
                {option.label}
              </span>
              <span aria-hidden="true" className="text-xs uppercase tracking-wide text-muted">
                {option.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
