import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { getSpendStats } from '@/lib/costGuard'
import { getCounters, getLanguageCounters } from '@/lib/counters'
import { getEnv } from '@/lib/env'

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

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

  // Compare fixed-length digests: timingSafeEqual stays timing-safe and no
  // length precheck is needed, so the secret's length can't leak via timing.
  const authorized =
    !!adminSecret && !!secret && timingSafeEqual(sha256(adminSecret), sha256(secret))

  if (!authorized) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const [spend, counters, languageCounters] = await Promise.all([
    getSpendStats(),
    getCounters(),
    getLanguageCounters(),
  ])

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
      languageCounters,
    },
  })
}
