'use client'

import { useRef, useState } from 'react'
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
      // @ts-expect-error - dynamic import, not in package.json at build time
      const html2canvas = (await import('html2canvas')).default

      const canvas = await html2canvas(ancestryTreeRef.current, {
        backgroundColor: '#faf8f3',
        scale: 2,
        logging: false,
      })

      canvas.toBlob((blob: Blob | null) => {
        if (!blob) return

        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${word}-etymology.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        showFeedback()
        setIsOpen(false)
      })
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
          w-8 h-8
          rounded-md
          border border-charcoal/20
          text-charcoal/60
          hover:bg-cream-dark/30
          hover:border-charcoal/30
          transition-colors
          duration-200
        "
        title="Share"
        aria-label="Share menu"
        aria-expanded={isOpen}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.769-.283 1.093m0-2.186l6.566-3.391m3.534 2.3a2.25 2.25 0 100-2.186m0 2.186c.18.324.283.696.283 1.093s-.103.769-.283 1.093m0-2.186l-6.566-3.391"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="
            absolute right-0 mt-2
            w-48
            bg-white
            border border-charcoal/15
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
              border-b border-charcoal/5
              flex items-center gap-2
            "
          >
            <svg
              className="w-4 h-4 text-charcoal/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m2.121 2.121a4.5 4.5 0 016.364 0m-1.06-4.61a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 006.364 6.364l1.757-1.757"
              />
            </svg>
            Copy link
            {feedback === 'copied' && <span className="ml-auto text-xs text-emerald-600">✓</span>}
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
              border-b border-charcoal/5
              flex items-center gap-2
            "
          >
            <svg
              className="w-4 h-4 text-charcoal/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.66V18a2.25 2.25 0 002.25 2.25h10.5m-12-12V9m0 0V5.25M9 21H5.25A2.25 2.25 0 013 18.75V5.25A2.25 2.25 0 015.25 3H9"
              />
            </svg>
            Copy as text
            {feedback === 'copied' && <span className="ml-auto text-xs text-emerald-600">✓</span>}
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
            <svg
              className="w-4 h-4 text-charcoal/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            Share as image
            {feedback === 'copied' && <span className="ml-auto text-xs text-emerald-600">✓</span>}
          </button>
        </div>
      )}
    </div>
  )
}
