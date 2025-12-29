import { NextResponse } from 'next/server'
import { getRandomWord } from '@/lib/wordlist'
import { ApiResponse } from '@/lib/types'

export async function GET() {
  const word = getRandomWord()

  return NextResponse.json<ApiResponse<{ word: string }>>({
    success: true,
    data: { word },
  })
}
