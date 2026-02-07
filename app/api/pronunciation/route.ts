import { NextRequest, NextResponse } from 'next/server'
import { generatePronunciation, isElevenLabsConfigured } from '@/lib/elevenlabs'
import { getCachedAudio, cacheAudio } from '@/lib/cache'
import { isValidWord } from '@/lib/validation'
import { checkPronunciationBudget, incrementPronunciationBudget } from '@/lib/costGuard'

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

  if (!isValidWord(word)) {
    return NextResponse.json({ success: false, error: 'Invalid word' }, { status: 400 })
  }

  if (!isElevenLabsConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Pronunciation service not configured' },
      { status: 503 }
    )
  }

  const normalized = word.toLowerCase().trim()

  // Check cache first (cache hits are free — no budget cost)
  try {
    const cached = await getCachedAudio(normalized)
    if (cached) {
      const buffer = Buffer.from(cached, 'base64')
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000',
          'X-Cache': 'HIT',
        },
      })
    }
  } catch (error) {
    console.error('[Pronunciation] Cache read error:', error)
  }

  // Check daily budget (only for uncached requests)
  const budgetOk = await checkPronunciationBudget()
  if (!budgetOk) {
    return NextResponse.json(
      { success: false, error: 'Service is at capacity for today. Please try again tomorrow.' },
      { status: 503 }
    )
  }

  // Generate pronunciation
  try {
    const audioBuffer = await generatePronunciation(normalized)
    const base64 = Buffer.from(audioBuffer).toString('base64')

    // Increment budget counter (non-blocking)
    incrementPronunciationBudget().catch((err) => {
      console.error('[Pronunciation] Budget increment failed:', err)
    })

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
