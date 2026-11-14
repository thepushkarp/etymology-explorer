import { NextRequest, NextResponse } from 'next/server'
import { getLookupGroup } from '@/lib/lookupGroupCache'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

/** Navigation metadata only; this endpoint cannot start research. */
export async function GET(request: NextRequest) {
  const word = canonicalizeWord(request.nextUrl.searchParams.get('word') ?? '')
  if (!isValidWord(word))
    return NextResponse.json({ error: 'Invalid lookup word' }, { status: 400 })
  const group = await getLookupGroup(word)
  return NextResponse.json({ group: group ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
