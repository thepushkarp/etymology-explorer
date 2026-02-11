import { NextRequest, NextResponse } from 'next/server'
import { generatePronunciation, isElevenLabsConfigured } from '@/lib/elevenlabs'
import { getCachedAudio, cacheAudio } from '@/lib/cache'
import { isValidWord } from '@/lib/validation'
import { reservePronunciationBudget } from '@/lib/costGuard'
import { tryAcquireLock, releaseLock, pollForResult } from '@/lib/singleflight'
import { safeError } from '@/lib/errorUtils'
import { CONFIG } from '@/lib/config'

/**
 * GET /api/pronunciation?word=example
 *
 * Returns MP3 audio for word pronunciation.
 * Uses Redis cache for repeated requests, ElevenLabs TTS for generation.
 */
export async function GET(request: NextRequest) {
  // Feature flag
  if (!CONFIG.features.pronunciationEnabled) {
    return NextResponse.json(
      { success: false, error: 'Pronunciation service is disabled' },
      { status: 503 }
    )
  }

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
    console.error('[Pronunciation] Cache read error:', safeError(error))
  }

  // Atomically reserve a budget slot (INCR then compare — no TOCTOU race)
  const budgetOk = await reservePronunciationBudget()
  if (!budgetOk) {
    return NextResponse.json(
      { success: false, error: 'Service is at capacity for today. Please try again tomorrow.' },
      { status: 503 }
    )
  }

  // Singleflight: prevent duplicate TTS calls for the same word
  const lockKey = `lock:audio:${normalized}`
  const acquiredLock = await tryAcquireLock(lockKey)

  if (!acquiredLock) {
    // Another request is generating this audio — poll for it
    console.log(`[Pronunciation] Waiting for in-flight audio for "${normalized}"`)
    const result = await pollForResult(() => getCachedAudio(normalized))
    if (result) {
      const buffer = Buffer.from(result, 'base64')
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000',
          'X-Cache': 'HIT',
        },
      })
    }
    return NextResponse.json(
      { success: false, error: 'Request in progress, please retry in a few seconds.' },
      { status: 429, headers: { 'Retry-After': '2' } }
    )
  }

  // We hold the lock — generate pronunciation
  try {
    const audioBuffer = await generatePronunciation(normalized)
    const base64 = Buffer.from(audioBuffer).toString('base64')

    // Cache for future use (non-blocking)
    cacheAudio(normalized, base64).catch((err) => {
      console.error('[Pronunciation] Cache store failed:', safeError(err))
    })

    return new NextResponse(Buffer.from(audioBuffer), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000',
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    console.error('[Pronunciation] Generation failed:', safeError(error))
    return NextResponse.json(
      { success: false, error: 'Failed to generate pronunciation' },
      { status: 500 }
    )
  } finally {
    releaseLock(lockKey).catch(() => {})
  }
}
