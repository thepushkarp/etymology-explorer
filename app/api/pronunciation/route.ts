import { after, NextRequest, NextResponse } from 'next/server'
import { ElevenLabsApiError, generatePronunciation, isElevenLabsConfigured } from '@/lib/elevenlabs'
import { getCachedAudio, cacheAudio } from '@/lib/cache'
import { isValidWord, canonicalizeWord } from '@/lib/validation'
import { getCostMode } from '@/lib/costGuard'
import { tryAcquireLock, releaseLock, pollForResult } from '@/lib/singleflight'
import { safeError } from '@/lib/errorUtils'
import { CONFIG } from '@/lib/config'
import { lexemeKey, parseLanguageCode } from '@/lib/languages'
import { incrLanguageCounter } from '@/lib/counters'

// TTS generation has a 15s timeout, plus cache round-trips and waiter polling.
export const maxDuration = 60

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
  const language = parseLanguageCode(request.nextUrl.searchParams.get('language'))

  if (!language) {
    return NextResponse.json({ success: false, error: 'Unsupported language' }, { status: 400 })
  }

  if (!word) {
    return NextResponse.json({ success: false, error: 'Word parameter required' }, { status: 400 })
  }

  const normalized = canonicalizeWord(word)

  if (!normalized || !isValidWord(normalized)) {
    return NextResponse.json({ success: false, error: 'Invalid word' }, { status: 400 })
  }

  if (!isElevenLabsConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Pronunciation service not configured. Set ELEVENLABS_API_KEY and ' +
          'ELEVENLABS_VOICE_ID to a voice available in your My Voices list. ' +
          'Free-tier accounts cannot use Voice Library voices via the API.',
      },
      { status: 503 }
    )
  }

  // Check cache first (cache hits are free — no budget cost)
  try {
    const cached = await getCachedAudio(normalized, language)
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

  // Singleflight: prevent duplicate TTS calls for the same word
  const lockKey = `lock:audio:${lexemeKey(language, normalized)}`
  const [acquisition, costMode] = await Promise.all([tryAcquireLock(lockKey), getCostMode()])

  if (acquisition.status === 'busy') {
    // Another request is generating this audio — poll for it
    console.log(`[Pronunciation] Waiting for in-flight audio for "${normalized}"`)
    const result = await pollForResult(() => getCachedAudio(normalized, language), {
      intervalMs: CONFIG.singleflight.audioWaiterPollIntervalMs,
    })
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
      { status: 429, headers: { 'Retry-After': '5' } }
    )
  }

  // 'unavailable' / 'error' fall through without a lock: pronunciation fails
  // open because TTS cost is bounded (15s timeout, per-IP rate limits) and the
  // endpoint must keep working when Redis is down.
  const lockToken = acquisition.status === 'acquired' ? acquisition.token : null
  let cleanupScheduled = false

  try {
    // Check cost mode — reject uncached expensive requests when budget is pressured
    if (costMode === 'cache_only') {
      return NextResponse.json(
        { success: false, error: 'Service temporarily unavailable' },
        { status: 503, headers: { 'X-Protection-Mode': costMode } }
      )
    }

    const audioBuffer = await generatePronunciation(normalized, language)
    const base64 = Buffer.from(audioBuffer).toString('base64')

    // Persistence must finish before releasing the lock, but neither operation
    // needs to delay playback. after() keeps both alive on serverless runtimes.
    after(async () => {
      try {
        await cacheAudio(normalized, base64, language)
      } finally {
        if (lockToken) await releaseLock(lockKey, lockToken)
      }
    })
    cleanupScheduled = true

    return new NextResponse(Buffer.from(audioBuffer), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000',
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    console.error('[Pronunciation] Generation failed:', safeError(error))
    await incrLanguageCounter(language, 'pronunciation_failure')

    if (error instanceof ElevenLabsApiError) {
      return NextResponse.json(
        { success: false, error: safeError(error.message) },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Failed to generate pronunciation' },
      { status: 500 }
    )
  } finally {
    if (lockToken && !cleanupScheduled) {
      await releaseLock(lockKey, lockToken)
    }
  }
}
