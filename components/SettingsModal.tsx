'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { LLMProvider, LLMConfig, AnthropicModelInfo } from '@/lib/types'

// Fallback models if API fetch fails (sorted by recency)
const FALLBACK_MODELS: AnthropicModelInfo[] = [
  { id: 'claude-sonnet-4-5-20250514', displayName: 'Claude Sonnet 4.5' },
  { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
  { id: 'claude-3-7-sonnet-latest', displayName: 'Claude 3.7 Sonnet' },
  { id: 'claude-3-5-haiku-latest', displayName: 'Claude 3.5 Haiku' },
  { id: 'claude-3-5-sonnet-latest', displayName: 'Claude 3.5 Sonnet' },
]

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  llmConfig: LLMConfig
  onSaveConfig: (config: LLMConfig) => void
}

export function SettingsModal({ isOpen, onClose, llmConfig, onSaveConfig }: SettingsModalProps) {
  const [provider, setProvider] = useState<LLMProvider>(llmConfig.provider)
  const [anthropicApiKey, setAnthropicApiKey] = useState(llmConfig.anthropicApiKey)
  const [anthropicModel, setAnthropicModel] = useState(llmConfig.anthropicModel)
  const [openrouterApiKey, setOpenrouterApiKey] = useState(llmConfig.openrouterApiKey)
  const [openrouterModel, setOpenrouterModel] = useState(llmConfig.openrouterModel)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false)
  const anthropicInputRef = useRef<HTMLInputElement>(null)

  // Models state
  const [availableModels, setAvailableModels] = useState<AnthropicModelInfo[]>(FALLBACK_MODELS)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch models from Anthropic API
  const fetchModels = useCallback(
    async (apiKey: string) => {
      if (!apiKey || apiKey.length < 10) {
        setAvailableModels(FALLBACK_MODELS)
        setModelsError(null)
        return
      }

      setModelsLoading(true)
      setModelsError(null)

      try {
        const response = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        })

        const data = await response.json()

        if (data.success && data.data?.length > 0) {
          setAvailableModels(data.data)
          // If current model not in list, select first available
          if (!data.data.some((m: AnthropicModelInfo) => m.id === anthropicModel)) {
            setAnthropicModel(data.data[0].id)
          }
        } else {
          setModelsError(data.error || 'Failed to fetch models')
          setAvailableModels(FALLBACK_MODELS)
        }
      } catch {
        setModelsError('Failed to fetch models')
        setAvailableModels(FALLBACK_MODELS)
      } finally {
        setModelsLoading(false)
      }
    },
    [anthropicModel]
  )

  // Debounced fetch when API key changes
  useEffect(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current)
    }

    if (provider === 'anthropic' && anthropicApiKey) {
      fetchTimeoutRef.current = setTimeout(() => {
        fetchModels(anthropicApiKey)
      }, 500)
    }

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
    }
  }, [anthropicApiKey, provider, fetchModels])

  // Sync with props
  useEffect(() => {
    setProvider(llmConfig.provider)
    setAnthropicApiKey(llmConfig.anthropicApiKey)
    setAnthropicModel(llmConfig.anthropicModel)
    setOpenrouterApiKey(llmConfig.openrouterApiKey)
    setOpenrouterModel(llmConfig.openrouterModel)
  }, [llmConfig])

  // Fetch models on open if we have an API key
  useEffect(() => {
    if (isOpen && llmConfig.anthropicApiKey && provider === 'anthropic') {
      fetchModels(llmConfig.anthropicApiKey)
    }
  }, [isOpen, llmConfig.anthropicApiKey, provider, fetchModels])

  // Focus appropriate input when modal opens
  useEffect(() => {
    if (isOpen && anthropicInputRef.current && provider === 'anthropic') {
      anthropicInputRef.current.focus()
    }
  }, [isOpen, provider])

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
    onSaveConfig({
      provider,
      anthropicApiKey: anthropicApiKey.trim(),
      anthropicModel,
      openrouterApiKey: openrouterApiKey.trim(),
      openrouterModel: openrouterModel.trim(),
    })
    onClose()
  }

  const handleClear = () => {
    if (provider === 'anthropic') {
      setAnthropicApiKey('')
      setAvailableModels(FALLBACK_MODELS)
      setModelsError(null)
    } else {
      setOpenrouterApiKey('')
      setOpenrouterModel('')
    }
  }

  const hasValidConfig =
    provider === 'anthropic'
      ? anthropicApiKey.trim().length > 0
      : openrouterApiKey.trim().length > 0 && openrouterModel.trim().length > 0

  const currentKeySet =
    provider === 'anthropic'
      ? llmConfig.anthropicApiKey.length > 0
      : llmConfig.openrouterApiKey.length > 0 && llmConfig.openrouterModel.length > 0

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
          w-full max-w-lg
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
          max-h-[90vh]
          overflow-y-auto
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
          <div className="px-6 py-6 space-y-6">
            {/* Provider Toggle */}
            <div>
              <span className="block mb-3 font-serif text-sm text-charcoal">LLM Provider</span>
              <div className="flex rounded-lg border border-charcoal/10 overflow-hidden">
                <button
                  onClick={() => setProvider('anthropic')}
                  className={`
                    flex-1 px-4 py-2.5
                    font-serif text-sm
                    transition-colors
                    ${
                      provider === 'anthropic'
                        ? 'bg-charcoal text-cream'
                        : 'bg-white text-charcoal-light hover:bg-cream-dark/50'
                    }
                  `}
                >
                  Anthropic
                </button>
                <button
                  onClick={() => setProvider('openrouter')}
                  className={`
                    flex-1 px-4 py-2.5
                    font-serif text-sm
                    transition-colors
                    ${
                      provider === 'openrouter'
                        ? 'bg-charcoal text-cream'
                        : 'bg-white text-charcoal-light hover:bg-cream-dark/50'
                    }
                  `}
                >
                  OpenRouter
                </button>
              </div>
            </div>

            {/* Anthropic Settings */}
            {provider === 'anthropic' && (
              <div className="space-y-4">
                {/* API Key - moved above model selector */}
                <label className="block">
                  <span className="block mb-2 font-serif text-sm text-charcoal">API Key</span>
                  <p className="text-xs text-charcoal-light/70 mb-3 font-serif">
                    Your API key is stored locally in your browser. Get one at{' '}
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
                      ref={anthropicInputRef}
                      type={showAnthropicKey ? 'text' : 'password'}
                      value={anthropicApiKey}
                      onChange={(e) => setAnthropicApiKey(e.target.value)}
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
                    <button
                      type="button"
                      onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                      className="
                        absolute right-3 top-1/2 -translate-y-1/2
                        p-1
                        text-charcoal-light/50
                        hover:text-charcoal
                        transition-colors
                      "
                      aria-label={showAnthropicKey ? 'Hide API key' : 'Show API key'}
                    >
                      <EyeIcon show={showAnthropicKey} />
                    </button>
                  </div>
                </label>

                {llmConfig.anthropicApiKey && (
                  <div className="flex items-center gap-2 text-xs font-serif text-green-600">
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

                {/* Model selector */}
                <label className="block">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-serif text-sm text-charcoal">Model</span>
                    {modelsLoading && (
                      <div className="w-3 h-3 border border-charcoal/30 border-t-charcoal rounded-full animate-spin" />
                    )}
                  </div>
                  {modelsError && !modelsLoading && (
                    <p className="text-xs text-amber-600 mb-2 font-serif">
                      Using fallback models. {modelsError}
                    </p>
                  )}
                  <select
                    value={anthropicModel}
                    onChange={(e) => setAnthropicModel(e.target.value)}
                    disabled={modelsLoading}
                    className="
                      w-full
                      px-4 py-3
                      font-serif text-sm
                      bg-cream-dark/50
                      border border-charcoal/10
                      rounded-lg
                      text-charcoal
                      focus:outline-none focus:border-charcoal/30
                      transition-colors
                      cursor-pointer
                      disabled:opacity-50 disabled:cursor-wait
                    "
                  >
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName} ({model.id})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-charcoal-light/50 mt-2 font-serif">
                    Models are fetched from the Anthropic API
                  </p>
                </label>
              </div>
            )}

            {/* OpenRouter Settings */}
            {provider === 'openrouter' && (
              <div className="space-y-4">
                {/* Model name input */}
                <label className="block">
                  <span className="block mb-2 font-serif text-sm text-charcoal">Model</span>
                  <p className="text-xs text-charcoal-light/70 mb-3 font-serif">
                    Enter the model ID from{' '}
                    <a
                      href="https://openrouter.ai/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-charcoal"
                    >
                      openrouter.ai/models
                    </a>
                  </p>
                  <input
                    type="text"
                    value={openrouterModel}
                    onChange={(e) => setOpenrouterModel(e.target.value)}
                    placeholder="e.g., anthropic/claude-3.5-sonnet"
                    className="
                      w-full
                      px-4 py-3
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
                </label>

                {/* API Key */}
                <label className="block">
                  <span className="block mb-2 font-serif text-sm text-charcoal">API Key</span>
                  <p className="text-xs text-charcoal-light/70 mb-3 font-serif">
                    Your API key is stored locally in your browser. Get one at{' '}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-charcoal"
                    >
                      openrouter.ai/keys
                    </a>
                  </p>
                  <div className="relative">
                    <input
                      type={showOpenrouterKey ? 'text' : 'password'}
                      value={openrouterApiKey}
                      onChange={(e) => setOpenrouterApiKey(e.target.value)}
                      placeholder="sk-or-v1-..."
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
                    <button
                      type="button"
                      onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                      className="
                        absolute right-3 top-1/2 -translate-y-1/2
                        p-1
                        text-charcoal-light/50
                        hover:text-charcoal
                        transition-colors
                      "
                      aria-label={showOpenrouterKey ? 'Hide API key' : 'Show API key'}
                    >
                      <EyeIcon show={showOpenrouterKey} />
                    </button>
                  </div>
                </label>

                {llmConfig.openrouterApiKey && llmConfig.openrouterModel && (
                  <div className="flex items-center gap-2 text-xs font-serif text-green-600">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    OpenRouter configured ({llmConfig.openrouterModel})
                  </div>
                )}
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
            {currentKeySet ? (
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
                Clear {provider === 'anthropic' ? 'key' : 'config'}
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
                disabled={!hasValidConfig}
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

function EyeIcon({ show }: { show: boolean }) {
  if (show) {
    return (
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
    )
  }
  return (
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
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
