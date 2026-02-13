import { NextResponse } from 'next/server'
import { getRandomWord } from '@/lib/wordlist'
import { ApiResponse } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const word = getRandomWord()

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
