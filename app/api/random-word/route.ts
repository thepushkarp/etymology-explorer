import { NextRequest, NextResponse } from 'next/server'
import { getRandomWord } from '@/lib/wordlist'
import { ApiResponse } from '@/lib/types'
import { parseLanguageCode } from '@/lib/languages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  const language = parseLanguageCode(request.nextUrl.searchParams.get('language'))

  if (!language) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Unsupported language' },
      { status: 400 }
    )
  }

  const word = getRandomWord(language)

  return NextResponse.json<ApiResponse<{ word: string }>>(
    {
      success: true,
      data: { word },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  )
}
