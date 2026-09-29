'use client'

import { useState } from 'react'

/** Native share sheet on touch devices; copies the canonical URL elsewhere. */
export function ShareButton() {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = window.location.href
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ url, title: document.title }).catch(() => undefined)
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard permission denied: nothing useful to show.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="text-sm text-muted transition-colors hover:text-ink"
      aria-live="polite"
    >
      {copied ? 'Link copied' : 'Share'}
    </button>
  )
}
