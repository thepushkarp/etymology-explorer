import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { ADMIN_POLICY, COST_POLICY } from '@/lib/config/guardrails'
import * as costGuard from '@/lib/security/cost-guard'
import { getServerEnv } from '@/lib/server/env'

type DailyRequestBudgetUsage = {
  etymology: number
  pronunciation: number
}

type CostGuardWithDailyBudgetReader = typeof costGuard & {
  readDailyRequestBudgetUsage?: () => Promise<DailyRequestBudgetUsage>
}

function safeCompareSecret(candidate: string | null, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate ?? '', 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const compareLength = Math.max(candidateBuffer.length, expectedBuffer.length, 1)

  const paddedCandidate = Buffer.alloc(compareLength)
  const paddedExpected = Buffer.alloc(compareLength)
  candidateBuffer.copy(paddedCandidate)
  expectedBuffer.copy(paddedExpected)

  const isMatch = timingSafeEqual(paddedCandidate, paddedExpected)
  return isMatch && candidateBuffer.length === expectedBuffer.length
}

async function readDailyRequestBudgetUsage(): Promise<DailyRequestBudgetUsage | null> {
  const reader = (costGuard as CostGuardWithDailyBudgetReader).readDailyRequestBudgetUsage
  if (typeof reader !== 'function') {
    return null
  }

  try {
    return await reader()
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const env = getServerEnv()
  const adminSecret = env.adminSecret?.trim()

  if (!adminSecret) {
    return NextResponse.json(
      {
        success: false,
        error: 'Admin stats endpoint is not configured',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const providedSecret = request.headers.get(ADMIN_POLICY.headerName)
  if (!safeCompareSecret(providedSecret, adminSecret)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const [costState, budgetUsage] = await Promise.all([
    costGuard.getCostMode(),
    readDailyRequestBudgetUsage(),
  ])

  const dailyBudgetLimits = COST_POLICY.dailyRequestBudget
  const dailyBudgetRemaining = budgetUsage
    ? {
        etymology: Math.max(0, dailyBudgetLimits.etymology - budgetUsage.etymology),
        pronunciation: Math.max(0, dailyBudgetLimits.pronunciation - budgetUsage.pronunciation),
      }
    : null

  return NextResponse.json(
    {
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        spend: {
          mode: costState.mode,
          dayUsd: costState.dayUsd,
          monthUsd: costState.monthUsd,
          thresholdsUsd: {
            dayHardLimit: COST_POLICY.dayHardLimitUsd,
            monthHardLimit: COST_POLICY.monthHardLimitUsd,
            degradeAt: COST_POLICY.degradeAtUsd,
            cacheOnlyAt: COST_POLICY.cacheOnlyAtUsd,
          },
        },
        dailyRequestBudget: {
          limits: dailyBudgetLimits,
          usage: budgetUsage,
          remaining: dailyBudgetRemaining,
        },
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
