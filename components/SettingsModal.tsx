'use client'

import { useState, useEffect, useRef } from 'react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  apiKey: string
  onSaveApiKey: (key: string) => void
}

export function SettingsModal({ isOpen, onClose, apiKey, onSaveApiKey }: SettingsModalProps) {
  const [inputValue, setInputValue] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync input with prop
  useEffect(() => {
    setInputValue(apiKey)
  }, [apiKey])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleSave = () => {
    onSaveApiKey(inputValue.trim())
    onClose()
  }

  const handleClear = () => {
    setInputValue('')
    onSaveApiKey('')
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="
          fixed inset-0 z-50
          bg-charcoal/40
          backdrop-blur-sm
          animate-fadeIn
        "
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="
          fixed z-50
          top-1/2 left-1/2
          -translate-x-1/2 -translate-y-1/2
          w-full max-w-md
          animate-fadeIn
        "
        style={{ animationDuration: '150ms' }}
      >
        <div
          className="
          bg-white
          rounded-xl
          shadow-2xl
          border border-charcoal/5
          overflow-hidden
          mx-4
        "
        >
          {/* Header */}
          <div
            className="
            flex items-center justify-between
            px-6 py-5
            border-b border-charcoal/10
          "
          >
            <div className="flex items-center gap-3">
              {/* Settings icon */}
              <div
                className="
                w-10 h-10
                rounded-full
                bg-cream-dark
                flex items-center justify-center
              "
              >
                <svg
                  className="w-5 h-5 text-charcoal-light"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <h2 className="font-serif text-xl text-charcoal">Settings</h2>
            </div>

            <button
              onClick={onClose}
              className="
                p-2
                text-charcoal-light/60
                hover:text-charcoal
                transition-colors
              "
              aria-label="Close settings"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6">
            <label className="block mb-4">
              <span
                className="
                block mb-2
                font-serif text-sm
                text-charcoal
              "
              >
                Anthropic API Key
              </span>
              <p
                className="
                text-xs text-charcoal-light/70
                mb-3
                font-serif
              "
              >
                Your API key is stored locally in your browser and never sent to our servers. Get
                one at{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-charcoal"
                >
                  console.anthropic.com
                </a>
              </p>

              <div className="relative">
                <input
                  ref={inputRef}
                  type={showKey ? 'text' : 'password'}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="
                    w-full
                    px-4 py-3 pr-12
                    font-mono text-sm
                    bg-cream-dark/50
                    border border-charcoal/10
                    rounded-lg
                    text-charcoal
                    placeholder:text-charcoal-light/40
                    focus:outline-none focus:border-charcoal/30
                    transition-colors
                  "
                />

                {/* Toggle visibility */}
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="
                    absolute right-3 top-1/2 -translate-y-1/2
                    p-1
                    text-charcoal-light/50
                    hover:text-charcoal
                    transition-colors
                  "
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {/* Key status */}
            {apiKey && (
              <div
                className="
                flex items-center gap-2
                text-xs font-serif
                text-green-600
                mb-4
              "
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                API key configured
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="
            flex items-center justify-between
            px-6 py-4
            bg-cream-dark/30
            border-t border-charcoal/5
          "
          >
            {apiKey ? (
              <button
                onClick={handleClear}
                className="
                  px-4 py-2
                  text-sm font-serif
                  text-red-600
                  hover:bg-red-50
                  rounded-lg
                  transition-colors
                "
              >
                Clear key
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="
                  px-4 py-2
                  text-sm font-serif
                  text-charcoal-light
                  hover:bg-white
                  rounded-lg
                  transition-colors
                "
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!inputValue.trim()}
                className="
                  px-5 py-2
                  text-sm font-serif
                  bg-charcoal text-cream
                  rounded-lg
                  hover:bg-charcoal-light
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors
                "
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Settings button that triggers the modal
 */
export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="
        fixed bottom-4 right-4 z-30
        p-3
        bg-white
        border border-charcoal/10
        rounded-full
        shadow-sm
        text-charcoal-light
        hover:text-charcoal hover:border-charcoal/20
        transition-all duration-200
      "
      aria-label="Open settings"
    >
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>
  )
}
