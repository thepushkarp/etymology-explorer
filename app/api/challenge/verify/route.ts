import { NextRequest, NextResponse } from 'next/server'
import { verifyChallengeToken } from '@/lib/security/challenge'
import { getRequestIdentity } from '@/lib/security/request-meta'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string }
    const token = body.token?.trim()

    if (!token) {
      return NextResponse.json({ success: false, error: 'Challenge token is required' }, { status: 400 })
    }

    const identity = getRequestIdentity(request)
    const verified = await verifyChallengeToken(token, identity.ip)

    if (!verified) {
      return NextResponse.json({ success: false, error: 'Challenge verification failed' }, { status: 403 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to verify challenge' }, { status: 500 })
  }
}
