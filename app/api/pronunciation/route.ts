import { NextRequest, NextResponse } from 'next/server'
import {
  ElevenLabsApiError,
  generatePronunciation,
  getPronunciationCacheIdentity,
  isElevenLabsConfigured,
} from '@/lib/elevenlabs'
import { getCachedAudio, cacheAudio } from '@/lib/cache'
import { isValidWord, canonicalizeWord } from '@/lib/validation'
import { getCostMode } from '@/lib/costGuard'
import { tryAcquireLock, releaseLock, pollForResult } from '@/lib/singleflight'
import { safeError } from '@/lib/errorUtils'
import { CONFIG } from '@/lib/config'
import { lexemeKey, parseLanguageCode } from '@/lib/languages'
import { incrLanguageCounter } from '@/lib/counters'
import { resolveJapaneseEntry } from '@/lib/japanese/resolver'

// TTS generation has an 8s timeout, plus cache round-trips and waiter polling.
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
  const entryId = request.nextUrl.searchParams.get('entry')
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

  if (language === 'ja' && !entryId) {
    return NextResponse.json(
      {
        success: false,
        error: 'Japanese pronunciation requires a selected dictionary entry',
      },
      { status: 400 }
    )
  }

  const japaneseCandidate =
    language === 'ja' && entryId ? await resolveJapaneseEntry(normalized, entryId) : null
  if (language === 'ja' && !japaneseCandidate) {
    return NextResponse.json(
      { success: false, error: 'Japanese entry does not match this word' },
      { status: 404 }
    )
  }

  // Never pronounce ambiguous kanji or user-entered romaji. JMdict's
  // entry-qualified canonical kana reading is the sole Japanese TTS input.
  const pronunciationText = japaneseCandidate?.reading ?? normalized
  const cacheIdentity = getPronunciationCacheIdentity(pronunciationText, language)

  if (!isElevenLabsConfigured(language)) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Pronunciation service not configured. Set ELEVENLABS_API_KEY and ' +
          `${language === 'ja' ? 'ELEVENLABS_JAPANESE_VOICE_ID' : 'ELEVENLABS_VOICE_ID'} ` +
          'to a voice available in your My Voices list. ' +
          'Free-tier accounts cannot use Voice Library voices via the API.',
      },
      { status: 503 }
    )
  }

  // Check cache first (cache hits are free — no budget cost)
  try {
    const cached = await getCachedAudio(pronunciationText, language, cacheIdentity)
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
  const lockKey = `lock:audio:${cacheIdentity ?? lexemeKey(language, pronunciationText)}`
  const acquisition = await tryAcquireLock(lockKey)

  if (acquisition.status === 'busy') {
    // Another request is generating this audio — poll for it
    console.log(`[Pronunciation] Waiting for in-flight audio for "${normalized}"`)
    const result = await pollForResult(() =>
      getCachedAudio(pronunciationText, language, cacheIdentity)
    )
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
  // open because TTS cost is bounded (8s timeout, per-IP rate limits) and the
  // endpoint must keep working when Redis is down.
  const lockToken = acquisition.status === 'acquired' ? acquisition.token : null

  try {
    // Check cost mode — reject uncached expensive requests when budget is pressured
    const costMode = await getCostMode()
    if (costMode === 'cache_only') {
      return NextResponse.json(
        { success: false, error: 'Service temporarily unavailable' },
        { status: 503, headers: { 'X-Protection-Mode': costMode } }
      )
    }

    const audioBuffer = await generatePronunciation(pronunciationText, language)
    const base64 = Buffer.from(audioBuffer).toString('base64')

    // Cache BEFORE the lock is released in `finally` so waiters polling
    // the audio cache find the result instead of hitting 429.
    await cacheAudio(pronunciationText, base64, language, cacheIdentity)

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
    if (lockToken) {
      // Awaited: on serverless the context can freeze once the response
      // returns, which would leave the lock held until its TTL expires.
      await releaseLock(lockKey, lockToken)
    }
  }
}
