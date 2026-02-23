import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getSpendStats } from '@/lib/costGuard'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  const adminSecret = process.env.ADMIN_SECRET

  // Timing-safe comparison prevents timing attacks on the secret
  const authorized =
    !!adminSecret &&
    !!secret &&
    Buffer.byteLength(adminSecret) === Buffer.byteLength(secret) &&
    timingSafeEqual(Buffer.from(adminSecret), Buffer.from(secret))

  if (!authorized) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const spend = await getSpendStats()

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
    },
  })
}
