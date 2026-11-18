'use client'
import { useId, useRef, useState, type ReactNode, type KeyboardEventHandler } from 'react'

export function EntryChoices({
  label,
  count,
  active,
  onKeyDown,
  children,
}: {
  label: string
  count: number
  active?: string
  onKeyDown?: KeyboardEventHandler<HTMLElement>
  children: ReactNode
}) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const compact = count > 3
  // Another history can arrive while someone is navigating these links. Keep
  // the same DOM nodes and never hide the link that currently has focus.
  const visible = !compact || expanded || focusWithin
  return (
    <>
      {compact && (
        <button
          ref={button}
          type="button"
          aria-controls={id}
          aria-expanded={visible}
          onClick={() => setExpanded(!visible)}
          className="mt-3 text-left text-sm text-muted"
        >
          <span className="link">Change meaning</span>
          {active && (
            <>
              {' '}
              · <bdi>{active}</bdi>
            </>
          )}
        </button>
      )}
      <nav
        id={id}
        hidden={!visible}
        aria-label={label}
        onKeyDown={(e) => {
          if (compact && e.key === 'Escape') {
            button.current?.focus()
            setExpanded(false)
            return
          }
          onKeyDown?.(e)
        }}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocusWithin(false)
        }}
        onClick={(e) => {
          if (
            compact &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.shiftKey &&
            !e.altKey &&
            e.target instanceof Element &&
            e.target.closest('a')
          ) {
            button.current?.focus({ preventScroll: true })
            setExpanded(false)
          }
        }}
        className={
          visible ? 'flex flex-wrap items-baseline gap-x-5 gap-y-2 py-2 font-serif' : 'hidden'
        }
      >
        {children}
      </nav>
    </>
  )
}
