import { NextRequest, NextResponse } from 'next/server'
import { parseLanguageCode } from '@/lib/languages'
import { getRecentSearches, recordRecentSearch } from '@/lib/recentSearches'
import { isValidWord } from '@/lib/validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const headers = { 'Cache-Control': 'no-store' }

export async function GET(request: NextRequest) {
  const rawLanguage = request.nextUrl.searchParams.get('language')
  const language = rawLanguage === null ? undefined : parseLanguageCode(rawLanguage)
  if (language === null) {
    return NextResponse.json(
      { success: false, error: 'Unsupported language' },
      { status: 400, headers }
    )
  }
  return NextResponse.json(
    { success: true, data: await getRecentSearches(undefined, language) },
    { headers }
  )
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400, headers })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: 'Invalid search' }, { status: 400, headers })
  }
  const input = body as Record<string, unknown>
  if (
    typeof input.word !== 'string' ||
    !isValidWord(input.word) ||
    Object.keys(input).some((key) => key !== 'word')
  ) {
    return NextResponse.json({ success: false, error: 'Invalid search' }, { status: 400, headers })
  }
  const recorded = await recordRecentSearch(input.word)
  return NextResponse.json({ success: true, data: { recorded } }, { headers })
}
