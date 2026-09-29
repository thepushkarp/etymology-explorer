'use client'

import { useEffect, useRef } from 'react'

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  )
}

/** Run `handler` when `key` is pressed outside a text field, without modifiers. */
export function useHotkey(key: string, handler: () => void) {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== key || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return
      event.preventDefault()
      handlerRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key])
}
