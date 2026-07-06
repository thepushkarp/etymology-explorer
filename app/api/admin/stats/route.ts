import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getSpendStats } from '@/lib/costGuard'
import { getCounters } from '@/lib/counters'
import { getEnv } from '@/lib/env'

export async function GET(request: NextRequest) {
  let adminSecret: string | undefined
  try {
    adminSecret = getEnv().ADMIN_SECRET
  } catch {
    return NextResponse.json(
      { success: false, error: 'Service configuration error' },
      { status: 503 }
    )
  }

  const secret = request.headers.get('x-admin-secret')

  // Timing-safe comparison prevents timing attacks on the secret
  const authorized =
    !!adminSecret &&
    !!secret &&
    Buffer.byteLength(adminSecret) === Buffer.byteLength(secret) &&
    timingSafeEqual(Buffer.from(adminSecret), Buffer.from(secret))

  if (!authorized) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const [spend, counters] = await Promise.all([getSpendStats(), getCounters()])

  if (!spend) {
    return NextResponse.json(
      { success: false, error: 'Budget tracking not configured (Redis unavailable)' },
      { status: 503 }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      month: spend.period,
      spend,
      counters,
    },
  })
}
