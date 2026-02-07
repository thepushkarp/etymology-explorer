import { getServerEnv } from '@/lib/server/env'

interface TurnstileResponse {
  success: boolean
}

export function isChallengeConfigured(): boolean {
  return Boolean(getServerEnv().turnstileSecretKey)
}

export async function verifyChallengeToken(token: string, ip: string): Promise<boolean> {
  const env = getServerEnv()
  if (!env.turnstileSecretKey) {
    return false
  }

  try {
    const body = new URLSearchParams()
    body.set('secret', env.turnstileSecretKey)
    body.set('response', token)
    body.set('remoteip', ip)

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    if (!response.ok) {
      return false
    }

    const result = (await response.json()) as TurnstileResponse
    return result.success === true
  } catch {
    return false
  }
}
