import { NextRequest } from 'next/server'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { IDENTITY_POLICY } from '@/lib/config/guardrails'
import { getServerEnv } from '@/lib/server/env'

export interface RequestIdentity {
  ip: string
  userAgent: string
  sessionKey: string
  isAuthenticated: boolean
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

function verifySignedUserId(request: NextRequest): string | null {
  const env = getServerEnv()
  if (!env.requestIdentitySigningSecret) {
    return null
  }

  const userId = request.cookies.get(IDENTITY_POLICY.signedUserIdCookieName)?.value?.trim()
  const signature = request.cookies
    .get(IDENTITY_POLICY.signedUserIdSignatureCookieName)
    ?.value?.trim()
    .toLowerCase()

  if (!userId || !signature || !/^[a-f0-9]{64}$/.test(signature)) {
    return null
  }

  const expected = createHmac('sha256', env.requestIdentitySigningSecret)
    .update(userId)
    .digest('hex')

  try {
    const left = Buffer.from(signature, 'hex')
    const right = Buffer.from(expected, 'hex')
    if (left.length !== right.length) {
      return null
    }

    return timingSafeEqual(left, right) ? userId : null
  } catch {
    return null
  }
}

export function getRequestIdentity(request: NextRequest): RequestIdentity {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  const userAgent = request.headers.get('user-agent') || ''
  const userId = verifySignedUserId(request)

  const sessionKey = userId ? `user:${hash(userId)}` : `ip:${hash(`${ip}:${userAgent}`)}`

  return {
    ip,
    userAgent,
    sessionKey,
    isAuthenticated: Boolean(userId),
  }
}
