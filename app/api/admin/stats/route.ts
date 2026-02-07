import { NextRequest, NextResponse } from 'next/server'
import { getBudgetStats } from '@/lib/costGuard'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const stats = await getBudgetStats()

  if (!stats) {
    return NextResponse.json(
      { success: false, error: 'Budget tracking not configured (Redis unavailable)' },
      { status: 503 }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      date: new Date().toISOString().slice(0, 10),
      ...stats,
    },
  })
}
