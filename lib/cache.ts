/** Durable corpus entries and independent pronunciation/negative caches. */
import { revalidateTag } from 'next/cache'
import { after } from 'next/server'
import type { EtymologyResult, WordEntry } from './types'
import { EtymologyResultSchema, WordEntrySchema } from './schemas/etymology'
import { CONFIG } from './config'
import { getRedis } from './redis'
import { safeError } from './errorUtils'
import { emitSecurityEvent } from './telemetry'
import type { LanguageCode } from './languages'
import { lexemeKey, SUPPORTED_LANGUAGE_CODES } from './languages'
import { canonicalizeWord } from './orthography'

/** Apply ±jitter to non-corpus TTLs to prevent synchronized cache stampedes. */
function jitterTTL(ttl: number): number {
  return Math.round(ttl * (1 + (Math.random() * 2 - 1) * CONFIG.cache.ttlJitterPercent))
}

export const ENTRY_PREFIX = 'entry:v1:'
export const ENTRY_SCAN_PATTERN = `${ENTRY_PREFIX}*`
// Legacy prefixes remain readable until their original TTLs have elapsed.
export const LEGACY_ETYMOLOGY_PREFIX = 'etymology:v2.7:'
export const LEGACY_BETA_ETYMOLOGY_PREFIX = 'etymology:beta:v9:'
export const LEGACY_SCAN_PATTERNS = [
  `${LEGACY_ETYMOLOGY_PREFIX}*`,
  `${LEGACY_BETA_ETYMOLOGY_PREFIX}*`,
] as const
const AUDIO_PREFIX = 'audio:v2:'
const AUDIO_TTL = CONFIG.audioCacheTTL

export function etymologyWordTag(word: string): string {
  return `etymology-word:${canonicalizeWord(word)}`
}

/** Walk legacy prose without changing identifiers, source scopes or lexical forms. */
function upgradeLegacyValue(value: unknown, examples = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (examples && typeof item === 'string') return { text: item }
      if (
        examples &&
        item &&
        typeof item === 'object' &&
        'en' in item &&
        typeof item.en === 'string' &&
        'local' in item &&
        typeof item.local === 'string'
      ) {
        return { text: item.local, translation: item.en }
      }
      return upgradeLegacyValue(item)
    })
  }
  if (!value || typeof value !== 'object') return value
  if ('en' in value && typeof value.en === 'string' && 'local' in value) return value.en
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, upgradeLegacyValue(item, key === 'examples')])
  )
}

/** Pure legacy migration: invalid siblings cannot discard a usable language entry. */
export function upgradeLegacyEntry(
  word: string,
  legacyValues: Partial<Record<LanguageCode, unknown>>
): WordEntry | null {
  const normalized = canonicalizeWord(word)
  const entries: WordEntry['entries'] = {}
  for (const language of SUPPORTED_LANGUAGE_CODES) {
    const raw = legacyValues[language]
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('word' in raw) ||
      typeof raw.word !== 'string' ||
      canonicalizeWord(raw.word) !== normalized ||
      ('language' in raw && raw.language !== language)
    )
      continue
    const upgraded = upgradeLegacyValue(raw) as Record<string, unknown>
    upgraded.language = language
    // Legacy English entries have one unsplit narrative. Its unresolved
    // display scope records that no source-local history identity was stored;
    // it contributes no evidence and never enters new synthesis research.
    if (upgraded.histories === undefined && upgraded.primaryHistoryId === undefined) {
      const id = `legacy:${language}:${encodeURIComponent(normalized)}`
      upgraded.primaryHistoryId = id
      upgraded.histories = [
        {
          id,
          label: 'Legacy entry',
          entryKind: 'unresolved',
          queryNodeId: `${id}:query`,
          lemmaNodeId: `${id}:query`,
          evidenceScopeIds: [`${id}:unresolved`],
          ...Object.fromEntries(
            [
              'pronunciation',
              'definition',
              'roots',
              'lore',
              'examples',
              'ancestryGraph',
              'partsOfSpeech',
            ]
              .filter((key) => upgraded[key] !== undefined)
              .map((key) => [key, upgraded[key]])
          ),
        },
      ]
    }
    const parsed = EtymologyResultSchema.safeParse(upgraded)
    if (!parsed.success) continue
    const result = parsed.data as EtymologyResult
    entries[result.language] = { ...result, word: normalized }
  }
  const languages = SUPPORTED_LANGUAGE_CODES.filter((language) => entries[language])
  if (!languages.length) return null
  return {
    word: normalized,
    languages,
    entries,
    otherLanguages: [],
    tracedAt: new Date(0).toISOString(),
    revision: 0,
  }
}

function entryIsStale(entry: WordEntry): boolean {
  const age = Date.now() - Date.parse(entry.freshnessAt ?? entry.tracedAt)
  return (
    entry.revision < CONFIG.pipelineRevision ||
    age >= CONFIG.entryFreshDays * 86400_000 ||
    (entry.incomplete === true && age >= CONFIG.incompleteEtymologyCacheTTL * 1000)
  )
}

/** Validate on read; freshness never removes a word from the durable corpus. */
export async function getCachedEntry(
  word: string
): Promise<{ entry: WordEntry; stale: boolean } | null> {
  const redis = getRedis()
  if (!redis) return null
  const normalized = canonicalizeWord(word)
  try {
    const raw = await redis.get(`${ENTRY_PREFIX}${normalized}`)
    if (raw) {
      const parsed = WordEntrySchema.safeParse(raw)
      if (!parsed.success) {
        emitSecurityEvent({
          type: 'schema_validation_fail',
          timestamp: Date.now(),
          detail: {
            word: normalized,
            source: 'cache_read',
            issue: parsed.error.issues[0]?.message,
          },
        })
        return null
      }
      if (parsed.data.word !== normalized) return null
      const entry = parsed.data as WordEntry
      return { entry, stale: entryIsStale(entry) }
    }

    const legacy = await Promise.allSettled(
      SUPPORTED_LANGUAGE_CODES.map((language) =>
        redis.get(
          language === 'en'
            ? `${LEGACY_ETYMOLOGY_PREFIX}${normalized}`
            : `${LEGACY_BETA_ETYMOLOGY_PREFIX}${language}:${normalized}`
        )
      )
    )
    const entry = upgradeLegacyEntry(
      normalized,
      Object.fromEntries(
        legacy.flatMap((result, index) => {
          if (result.status === 'fulfilled')
            return [[SUPPORTED_LANGUAGE_CODES[index], result.value]]
          console.error('[Cache] Legacy read error:', safeError(result.reason))
          return []
        })
      )
    )
    if (!entry) return null
    // Persist only a fully read legacy set. A transient sibling failure must
    // remain recoverable on the next read rather than hiding its old key.
    if (legacy.some((result) => result.status === 'rejected')) return { entry, stale: true }
    try {
      // A trace that completes during migration owns the durable entry.
      const stored = await redis.set(`${ENTRY_PREFIX}${normalized}`, entry, {
        ex: CONFIG.etymologyCacheTTL,
        nx: true,
      })
      if (stored === null) return getCachedEntry(normalized)
    } catch (error) {
      console.error('[Cache] Legacy migration write error:', safeError(error))
    }
    return { entry, stale: true }
  } catch (error) {
    console.error('[Cache] Entry get error:', safeError(error))
    return null
  }
}

/** Results arrive validated from synthesis; partial traces remain durable and retraceable. */
export async function cacheEntry(
  word: string,
  entry: WordEntry,
  options?: { incomplete?: boolean }
): Promise<void> {
  const redis = getRedis()
  const normalized = canonicalizeWord(word)
  if (!redis) throw new Error(`Could not store entry "${normalized}": Redis is not configured`)
  const stored =
    options?.incomplete === undefined ? entry : { ...entry, incomplete: options.incomplete }
  try {
    await redis.set(`${ENTRY_PREFIX}${normalized}`, stored, { ex: CONFIG.etymologyCacheTTL })
  } catch (error) {
    throw new Error(`Could not store entry "${normalized}": ${safeError(error)}`)
  }

  // Streaming handlers finish before their body writes the entry. after()
  // flushes these deferred invalidations once that body completes; expire: 0
  // makes the next page load see the entry rather than a stale ISR miss.
  try {
    after(() => revalidateTag(etymologyWordTag(normalized), { expire: 0 }))
  } catch (error) {
    console.warn('[Cache] Word page revalidation skipped:', safeError(error))
  }
}

/**
 * Get cached audio (as base64 string)
 */
export async function getCachedAudio(
  word: string,
  language: LanguageCode = 'en'
): Promise<string | null> {
  const redis = getRedis()
  if (!redis) return null

  const key = audioKey(word, language)
  try {
    return await redis.get<string>(key)
  } catch (error) {
    console.error('[Cache] Audio get error:', safeError(error))
    return null
  }
}

/**
 * Cache audio (as base64 string)
 */
export async function cacheAudio(
  word: string,
  audioBase64: string,
  language: LanguageCode = 'en'
): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  const key = audioKey(word, language)
  try {
    await redis.set(key, audioBase64, { ex: jitterTTL(AUDIO_TTL) })
    console.log(`[Cache] Stored audio for "${word}"`)
  } catch (error) {
    console.error('[Cache] Audio set error:', safeError(error))
  }
}

function audioKey(word: string, language: LanguageCode): string {
  const normalized = canonicalizeWord(word)
  // Preserve the established English namespace; only other languages need a
  // qualifier to prevent same-spelling pronunciations from colliding.
  return language === 'en'
    ? `${AUDIO_PREFIX}${normalized}`
    : `${AUDIO_PREFIX}${lexemeKey(language, normalized)}`
}

/** Auto misses and explicit language hints have independent admission scopes. */
function negativeKey(word: string, hint?: LanguageCode): string {
  const normalized = canonicalizeWord(word)
  return hint ? `neg:v6:hint:${lexemeKey(hint, normalized)}` : `neg:v6:${normalized}`
}

export async function getNegativeCache(word: string, hint?: LanguageCode): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  try {
    return (await redis.exists(negativeKey(word, hint))) === 1
  } catch (error) {
    console.error('[Cache] Negative cache get error:', safeError(error))
    return false
  }
}

/** Transient failures and failed retraces must never suppress a durable entry. */
export async function cacheNegative(
  word: string,
  errorType: string,
  hint?: LanguageCode
): Promise<void> {
  const redis = getRedis()
  if (!redis || !CONFIG.cache.negativeCacheAdmitOnly.includes(errorType)) return
  try {
    if (await redis.exists(`${ENTRY_PREFIX}${canonicalizeWord(word)}`)) return
    await redis.set(negativeKey(word, hint), '1', { ex: jitterTTL(CONFIG.negativeCacheTTL) })
  } catch (error) {
    console.error('[Cache] Negative cache set error:', safeError(error))
  }
}
