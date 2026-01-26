import { NextRequest, NextResponse } from 'next/server'
import { generatePronunciation, isElevenLabsConfigured } from '@/lib/elevenlabs'
import { getCachedAudio, cacheAudio } from '@/lib/cache'

/**
 * GET /api/pronunciation?word=example
 *
 * Returns MP3 audio for word pronunciation.
 * Uses Redis cache for repeated requests, ElevenLabs TTS for generation.
 */
export async function GET(request: NextRequest) {
  const word = request.nextUrl.searchParams.get('word')

  if (!word) {
    return NextResponse.json({ success: false, error: 'Word parameter required' }, { status: 400 })
  }

  if (!isElevenLabsConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Pronunciation service not configured' },
      { status: 503 }
    )
  }

  const normalized = word.toLowerCase().trim()

  // Check cache first
  try {
    const cached = await getCachedAudio(normalized)
    if (cached) {
      const buffer = Buffer.from(cached, 'base64')
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000', // 1 year (immutable content)
          'X-Cache': 'HIT',
        },
      })
    }
  } catch (error) {
    // Cache read failed - continue to generate
    console.error('[Pronunciation] Cache read error:', error)
  }

  // Generate pronunciation
  try {
    const audioBuffer = await generatePronunciation(normalized)
    const base64 = Buffer.from(audioBuffer).toString('base64')

    // Cache for future use (non-blocking)
    cacheAudio(normalized, base64).catch((err) => {
      console.error('[Pronunciation] Cache store failed:', err)
    })

    return new NextResponse(Buffer.from(audioBuffer), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000',
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    console.error('[Pronunciation] Generation failed:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate pronunciation' },
      { status: 500 }
    )
  }
}
