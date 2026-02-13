import { NextRequest, NextResponse } from 'next/server'
import { fetchNgram } from '@/lib/ngrams'
import { ApiResponse } from '@/lib/types'

export async function GET(request: NextRequest) {
  const word = request.nextUrl.searchParams.get('word')

  if (!word?.trim()) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Query parameter "word" is required' },
      { status: 400 }
    )
  }

  const result = await fetchNgram(word)

  if (!result || result.data.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Ngram data unavailable' },
      {
        status: 404,
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    )
  }

  return NextResponse.json<ApiResponse<typeof result>>(
    { success: true, data: result },
    {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      },
    }
  )
}
