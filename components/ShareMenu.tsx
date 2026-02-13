'use client'

import { useRef, useState } from 'react'
import {
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
  PhotoIcon,
  ShareIcon,
} from '@heroicons/react/24/outline'
import { EtymologyResult } from '@/lib/types'

interface ShareMenuProps {
  word: string
  result: EtymologyResult
  ancestryTreeRef?: React.RefObject<HTMLDivElement | null>
}

export function ShareMenu({ word, result, ancestryTreeRef }: ShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [feedback, setFeedback] = useState<'copied' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = (e: React.MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setIsOpen(false)
    }
  }

  const showFeedback = () => {
    setFeedback('copied')
    setTimeout(() => setFeedback(null), 2000)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showFeedback()
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  const handleCopyAsText = async () => {
    try {
      const ancestryText = result.ancestryGraph?.branches
        ?.map((branch) => {
          const stages = branch.stages.map((s) => `${s.form} (${s.stage})`).join(' ← ')
          return `${branch.root}: ${stages}`
        })
        .join('\n')

      const text = `${result.word}
Pronunciation: ${result.pronunciation}
Definition: ${result.definition}

Roots:
${result.roots.map((r) => `• ${r.root} (${r.origin}): ${r.meaning}`).join('\n')}

Ancestry:
${ancestryText || 'N/A'}

Story:
${result.lore}`

      await navigator.clipboard.writeText(text)
      showFeedback()
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  const handleShareAsImage = async () => {
    if (!ancestryTreeRef?.current) {
      console.warn('Ancestry tree ref not available')
      return
    }

    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(ancestryTreeRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: 'var(--cream)',
      })

      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${word}-etymology.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      showFeedback()
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to capture image:', err)
    }
  }

  return (
    <div ref={menuRef} className="relative" onClick={handleClickOutside}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          inline-flex items-center justify-center
          w-9 h-9
          rounded-md
          border border-charcoal/25
          text-charcoal
          hover:bg-cream-dark/50
          hover:border-charcoal/45
          transition-colors
          duration-200
        "
        title="Share"
        aria-label="Share menu"
        aria-expanded={isOpen}
      >
        <ShareIcon className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          className="
            absolute right-0 mt-2
            w-48
            bg-surface
            border border-border-soft
            rounded-md
            shadow-sm
            z-50
            overflow-hidden
          "
        >
          <button
            onClick={handleCopyLink}
            className="
              w-full text-left
               px-4 py-2.5
               text-sm font-serif
               text-charcoal/80
               hover:bg-cream-dark/20
               transition-colors
               border-b border-border-soft
               flex items-center gap-2
             "
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4 text-charcoal/70" />
            Copy link
            {feedback === 'copied' && (
              <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">✓</span>
            )}
          </button>

          <button
            onClick={handleCopyAsText}
            className="
              w-full text-left
               px-4 py-2.5
               text-sm font-serif
               text-charcoal/80
               hover:bg-cream-dark/20
               transition-colors
               border-b border-border-soft
               flex items-center gap-2
             "
          >
            <DocumentTextIcon className="h-4 w-4 text-charcoal/70" />
            Copy as text
            {feedback === 'copied' && (
              <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">✓</span>
            )}
          </button>

          <button
            onClick={handleShareAsImage}
            className="
              w-full text-left
               px-4 py-2.5
               text-sm font-serif
               text-charcoal/80
               hover:bg-cream-dark/20
               transition-colors
               flex items-center gap-2
             "
          >
            <PhotoIcon className="h-4 w-4 text-charcoal/70" />
            Share as image
            {feedback === 'copied' && (
              <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">✓</span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
