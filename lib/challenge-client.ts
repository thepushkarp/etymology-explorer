type TurnstileCallback = (token: string) => void

interface TurnstileRenderOptions {
  sitekey: string
  size?: 'normal' | 'compact' | 'invisible'
  callback?: TurnstileCallback
  'error-callback'?: () => void
  'expired-callback'?: () => void
  'timeout-callback'?: () => void
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  execute: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? ''
const TURNSTILE_LOAD_TIMEOUT_MS = 3_000
const TURNSTILE_WIDGET_TIMEOUT_MS = 10_000
const TURNSTILE_POLL_INTERVAL_MS = 50

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForTurnstileApi(): Promise<TurnstileApi | null> {
  if (typeof window === 'undefined') {
    return null
  }

  const deadline = Date.now() + TURNSTILE_LOAD_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (window.turnstile) {
      return window.turnstile
    }
    await sleep(TURNSTILE_POLL_INTERVAL_MS)
  }

  return window.turnstile ?? null
}

export function isTurnstileClientConfigured(): boolean {
  return TURNSTILE_SITE_KEY.length > 0
}

export async function getChallengeToken(): Promise<string | null> {
  if (!isTurnstileClientConfigured() || typeof document === 'undefined') {
    return null
  }

  const turnstile = await waitForTurnstileApi()
  if (!turnstile) {
    return null
  }

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '-9999px'
  document.body.appendChild(container)

  return new Promise((resolve) => {
    let settled = false
    let widgetId = ''
    const timeoutId = setTimeout(() => finish(null), TURNSTILE_WIDGET_TIMEOUT_MS)

    const finish = (token: string | null) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutId)
      try {
        if (widgetId) {
          turnstile.remove(widgetId)
        }
      } catch {
        // Best-effort cleanup.
      }
      container.remove()
      resolve(token)
    }

    try {
      widgetId = turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        size: 'invisible',
        callback: (token) => finish(token),
        'error-callback': () => finish(null),
        'expired-callback': () => finish(null),
        'timeout-callback': () => finish(null),
      })
      turnstile.execute(widgetId)
    } catch {
      finish(null)
      return
    }
  })
}
