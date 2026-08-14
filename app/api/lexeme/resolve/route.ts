import { NextRequest, NextResponse } from 'next/server'
import { CONFIG } from '@/lib/config'
import { isValidWord, canonicalizeWord } from '@/lib/validation'
import {
  cacheJapaneseNegativeResolution,
  cacheJapaneseResolution,
  getCachedJapaneseResolution,
  getJapaneseNegativeResolution,
} from '@/lib/japanese/cache'
import { resolveJapaneseLexeme } from '@/lib/japanese/resolver'
import type { ApiResponse, LookupResolution } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!CONFIG.features.japaneseBetaEnabled) {
    return NextResponse.json(
      { success: false, error: 'Japanese beta is disabled' },
      { status: 404 }
    )
  }
  if (request.nextUrl.searchParams.get('language') !== 'ja') {
    return NextResponse.json({ success: false, error: 'Unsupported language' }, { status: 400 })
  }
  const query = canonicalizeWord(request.nextUrl.searchParams.get('q') ?? '')
  if (!query || !isValidWord(query)) {
    return NextResponse.json({ success: false, error: 'Invalid query' }, { status: 400 })
  }

  const cached = await getCachedJapaneseResolution(query)
  if (cached) {
    return NextResponse.json<ApiResponse<LookupResolution>>(
      { success: true, data: cached },
      { headers: { 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'HIT' } }
    )
  }
  if (await getJapaneseNegativeResolution(query)) {
    return NextResponse.json<ApiResponse<LookupResolution>>({
      success: true,
      data: { status: 'not_found', query, candidates: [] },
    })
  }

  const resolution = await resolveJapaneseLexeme(query)
  await cacheJapaneseResolution(query, resolution)
  if (resolution.status === 'not_found') await cacheJapaneseNegativeResolution(query)
  return NextResponse.json<ApiResponse<LookupResolution>>(
    { success: true, data: resolution },
    { headers: { 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'MISS' } }
  )
}
