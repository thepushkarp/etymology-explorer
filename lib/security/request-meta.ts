import { NextRequest } from 'next/server'
import { createHash } from 'crypto'

export interface RequestIdentity {
  ip: string
  userAgent: string
  sessionKey: string
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

export function getRequestIdentity(request: NextRequest): RequestIdentity {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  const userAgent = request.headers.get('user-agent') || ''
  const userId = request.headers.get('x-user-id') || request.cookies.get('user-id')?.value || ''

  const sessionKey = userId ? `user:${hash(userId)}` : `ip:${hash(`${ip}:${userAgent}`)}`

  return {
    ip,
    userAgent,
    sessionKey,
  }
}
