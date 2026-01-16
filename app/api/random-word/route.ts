import { NextResponse } from 'next/server'
import { getRandomWord } from '@/lib/wordlist'
import { ApiResponse } from '@/lib/types'

export async function GET() {
  const word = getRandomWord()

  return NextResponse.json<ApiResponse<{ word: string }>>(
    {
      success: true,
      data: { word },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    }
  )
}
