import { revalidateTag } from 'next/cache'
import { after } from 'next/server'
import type { EntrySpelling, EtymologyResult, ScriptTarget, WordEntry } from './types'
import { EtymologyResultSchema, WordEntrySchema } from './schemas/etymology'
import { CONFIG } from './config'
import { getRedis } from './redis'
import { safeError } from './errorUtils'
import { emitSecurityEvent } from './telemetry'
import type { LanguageCode } from './languages'
import {
  candidateLanguages,
  isLanguageCode,
  lexemeKey,
  SUPPORTED_LANGUAGE_CODES,
} from './languages'
import { canonicalizeWord } from './orthography'
import { normalizeScriptTargets } from './scriptTargets'
import { isValidWord } from './validation'
import { pronunciationKey } from './pronunciation'

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
const AUDIO_TTL = CONFIG.audioCacheTTL
const SPELLING_ALIAS_PREFIX = 'entry-alias:v1:'
export const MAX_SPELLING_REDIRECTS = 3

export interface SpellingProof extends EntrySpelling {
  targetWord: string
  terminal: { word: string; sourceUrl: string; revisionId?: number | string; verifiedAt: string }
}

function freshSpelling(spelling: EntrySpelling): boolean {
  const age = Date.now() - Date.parse(spelling.verifiedAt)
  return age >= 0 && age <= CONFIG.sourceCacheTTL * 1000
}

function validProof(value: unknown): value is SpellingProof {
  if (!value || typeof value !== 'object') return false
  const proof = value as SpellingProof
  if (
    !isLanguageCode(proof.language) ||
    !['spelling', 'misspelling', 'romanization'].includes(proof.kind) ||
    (proof.kind === 'romanization' && !proof.readingEvidence?.trim()) ||
    typeof proof.word !== 'string' ||
    typeof proof.targetWord !== 'string' ||
    ![proof.word, proof.targetWord].every(
      (word) =>
        isValidWord(word) &&
        canonicalizeWord(word) === word &&
        (candidateLanguages(word).includes(proof.language) ||
          (word === proof.word &&
            proof.kind === 'romanization' &&
            proof.language === 'ja' &&
            /^[\p{Script=Latin}\p{M}'’ -]+$/u.test(word)))
    ) ||
    typeof proof.verifiedAt !== 'string' ||
    !freshSpelling(proof) ||
    !proof.terminal ||
    typeof proof.terminal.verifiedAt !== 'string' ||
    !freshSpelling({ ...proof, verifiedAt: proof.terminal.verifiedAt }) ||
    typeof proof.terminal.word !== 'string' ||
    !isValidWord(proof.terminal.word) ||
    canonicalizeWord(proof.terminal.word) !== proof.terminal.word ||
    (proof.revisionId !== undefined && !['string', 'number'].includes(typeof proof.revisionId))
  )
    return false
  try {
    const url = new URL(proof.sourceUrl)
    const terminal = new URL(proof.terminal.sourceUrl)
    return [url, terminal].every(
      (url) => url.protocol === 'https:' && !url.username && !url.password
    )
  } catch {
    return false
  }
}

function proofChain(
  word: string,
  target: string,
  proofs: SpellingProof[],
  language: LanguageCode
): SpellingProof[] | null {
  const chain: SpellingProof[] = []
  const seen = new Set<string>()
  while (word !== target) {
    if (seen.has(word) || chain.length >= MAX_SPELLING_REDIRECTS) return null
    seen.add(word)
    const matches = proofs.filter(
      (proof) =>
        proof.language === language &&
        proof.word === word &&
        validProof(proof) &&
        proof.terminal.word === target
    )
    if (matches.length !== 1) return null
    chain.push(matches[0])
    word = matches[0].targetWord
  }
  return chain.length ? chain : null
}

export function spellingMetadata(chain: SpellingProof[]): EntrySpelling {
  const first = chain[0]
  return {
    word: first.word,
    language: first.language,
    kind:
      first.kind === 'romanization'
        ? 'romanization'
        : chain.some((proof) => proof.kind === 'misspelling')
          ? 'misspelling'
          : 'spelling',
    ...(first.readingEvidence ? { readingEvidence: first.readingEvidence } : {}),
    sourceUrl: first.sourceUrl,
    ...(first.revisionId !== undefined ? { revisionId: first.revisionId } : {}),
    verifiedAt: new Date(
      Math.min(
        ...chain.flatMap((proof) => [
          Date.parse(proof.verifiedAt),
          Date.parse(proof.terminal.verifiedAt),
        ])
      )
    ).toISOString(),
  }
}

function sameSpellingProof(left: EntrySpelling, right: EntrySpelling): boolean {
  return (
    left.word === right.word &&
    left.language === right.language &&
    left.kind === right.kind &&
    left.readingEvidence === right.readingEvidence &&
    left.sourceUrl === right.sourceUrl &&
    left.revisionId === right.revisionId &&
    left.verifiedAt === right.verifiedAt
  )
}

export function mergeEntrySpellings(entry: WordEntry, incoming: EntrySpelling[]): WordEntry {
  const spellings = new Map<string, EntrySpelling>()
  for (const spelling of [...(entry.spellings ?? []), ...incoming]) {
    if (
      spelling.word !== entry.word &&
      isSpellingEntry(entry, spelling.language) &&
      freshSpelling(spelling)
    ) {
      spellings.set(`${spelling.language}:${spelling.word}`, spelling)
    }
  }
  const otherScripts = normalizeScriptTargets(entry.otherScripts).filter(
    (target) => !spellings.has(`${target.language}:${target.word}`)
  )
  return {
    ...entry,
    spellings: [...spellings.values()],
    ...(entry.otherScripts ? { otherScripts } : {}),
  }
}

export function hasEntrySpellings(entry: WordEntry, spellings: EntrySpelling[]): boolean {
  return spellings.every((spelling) =>
    entry.spellings?.some((stored) => sameSpellingProof(stored, spelling))
  )
}

export function isSpellingEntry(entry: WordEntry, language: LanguageCode): boolean {
  const histories = entry.entries[language]?.histories
  return (
    histories?.length === 1 && histories[0].entryKind !== 'form' && !!histories[0].definition.trim()
  )
}

export async function getCachedSpellingEntry(
  word: string,
  hint?: LanguageCode
): Promise<{ word: string; language: LanguageCode; entry: WordEntry; stale: boolean } | null> {
  const candidates = candidateLanguages(word)
  const language = hint ?? (candidates.length === 1 ? candidates[0] : undefined)
  if (!language || (!candidates.includes(language) && language !== 'ja')) return null
  const redis = getRedis()
  if (!redis) return null
  const normalized = canonicalizeWord(word)
  try {
    const raw = await redis.get<{ word?: unknown; revision?: unknown; proofs?: unknown }>(
      `${SPELLING_ALIAS_PREFIX}${lexemeKey(language, normalized)}`
    )
    if (
      !raw ||
      raw.revision !== 1 ||
      typeof raw.word !== 'string' ||
      !Array.isArray(raw.proofs) ||
      raw.proofs.length > MAX_SPELLING_REDIRECTS ||
      !raw.proofs.every(validProof)
    )
      return null
    const chain = proofChain(normalized, raw.word, raw.proofs, language)
    if (!chain) return null
    if (!hint) {
      const original = await getCachedEntry(normalized)
      if (original?.entry.languages.some((code) => code !== language)) return null
    }
    const target = await getCachedEntry(raw.word, { durableOnly: true })
    if (
      !target ||
      !isSpellingEntry(target.entry, language) ||
      !hasEntrySpellings(target.entry, [spellingMetadata(chain)])
    )
      return null
    const forward = await redis.get<{ word?: unknown }>(
      `${SPELLING_ALIAS_PREFIX}${lexemeKey(language, raw.word)}`
    )
    if (forward && typeof forward.word === 'string' && forward.word !== raw.word) return null
    return { word: raw.word, language, ...target }
  } catch (error) {
    console.error('[Cache] Spelling alias read failed:', safeError(error))
    return null
  }
}

export async function publishSpellingAliases(
  entry: WordEntry,
  proofs: SpellingProof[]
): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  const published: string[] = []
  for (const { word, language } of entry.spellings ?? []) {
    if (!isSpellingEntry(entry, language)) continue
    const chain = proofChain(word, entry.word, proofs, language)
    if (!chain || !hasEntrySpellings(entry, [spellingMetadata(chain)])) continue
    const ttl = Math.floor(
      (CONFIG.sourceCacheTTL * 1000 -
        (Date.now() - Date.parse(spellingMetadata(chain).verifiedAt))) /
        1000
    )
    if (ttl <= 0) continue
    try {
      await redis.set(
        `${SPELLING_ALIAS_PREFIX}${lexemeKey(language, word)}`,
        { word: entry.word, revision: 1, proofs: chain },
        { ex: ttl }
      )
      published.push(word)
    } catch (error) {
      console.error('[Cache] Spelling alias write failed:', safeError(error))
    }
  }
  if (published.length) {
    try {
      after(() => {
        for (const word of published) revalidateTag(etymologyWordTag(word), { expire: 0 })
      })
    } catch (error) {
      console.warn('[Cache] Spelling page revalidation skipped:', safeError(error))
    }
  }
}

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
  word: string,
  options?: { durableOnly?: boolean }
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
      if (entry.spellings) entry.spellings = entry.spellings.filter(freshSpelling)
      return { entry, stale: entryIsStale(entry) }
    }

    if (options?.durableOnly) return null
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
  const revalidationWords = new Set([normalized])
  try {
    const previous = await redis.get<WordEntry>(`${ENTRY_PREFIX}${normalized}`)
    for (const spelling of [
      ...(Array.isArray(previous?.spellings) ? previous.spellings : []),
      ...(stored.spellings ?? []),
    ]) {
      if (typeof spelling?.word === 'string' && isValidWord(spelling.word))
        revalidationWords.add(canonicalizeWord(spelling.word))
    }
    await redis.set(`${ENTRY_PREFIX}${normalized}`, stored, { ex: CONFIG.etymologyCacheTTL })
  } catch (error) {
    throw new Error(`Could not store entry "${normalized}": ${safeError(error)}`)
  }

  // Streaming handlers finish before their body writes the entry. after()
  // flushes these deferred invalidations once that body completes; expire: 0
  // makes the next page load see the entry rather than a stale ISR miss.
  try {
    after(() => {
      for (const word of revalidationWords) revalidateTag(etymologyWordTag(word), { expire: 0 })
    })
  } catch (error) {
    console.warn('[Cache] Word page revalidation skipped:', safeError(error))
  }
}

/**
 * Get cached audio (as base64 string)
 */
export async function getCachedAudio(
  word: string,
  language: LanguageCode = 'en',
  ipa?: string
): Promise<string | null> {
  const redis = getRedis()
  if (!redis) return null

  const key = pronunciationKey(word, language, ipa)
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
  language: LanguageCode = 'en',
  ipa?: string
): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  const key = pronunciationKey(word, language, ipa)
  try {
    await redis.set(key, audioBase64, { ex: jitterTTL(AUDIO_TTL) })
    console.log(`[Cache] Stored audio for "${word}"`)
  } catch (error) {
    console.error('[Cache] Audio set error:', safeError(error))
  }
}

/** Auto misses and explicit language hints have independent admission scopes. */
function negativeKey(word: string, hint?: LanguageCode): string {
  const normalized = canonicalizeWord(word)
  return hint ? `neg:v10:hint:${lexemeKey(hint, normalized)}` : `neg:v10:${normalized}`
}

export interface NegativeCacheMetadata {
  otherScripts?: ScriptTarget[]
}

export async function getNegativeCache(
  word: string,
  hint?: LanguageCode
): Promise<NegativeCacheMetadata | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const value = await redis.get(negativeKey(word, hint))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const otherScripts = normalizeScriptTargets((value as Record<string, unknown>).otherScripts)
    return otherScripts.length ? { otherScripts } : {}
  } catch (error) {
    console.error('[Cache] Negative cache get error:', safeError(error))
    return null
  }
}

/** Transient failures and failed retraces must never suppress a durable entry. */
export async function cacheNegative(
  word: string,
  errorType: string,
  hint?: LanguageCode,
  offers?: ScriptTarget[]
): Promise<void> {
  const redis = getRedis()
  if (!redis || !CONFIG.cache.negativeCacheAdmitOnly.includes(errorType)) return
  try {
    if (await redis.exists(`${ENTRY_PREFIX}${canonicalizeWord(word)}`)) return
    const otherScripts = normalizeScriptTargets(offers)
    await redis.set(negativeKey(word, hint), otherScripts.length ? { otherScripts } : {}, {
      ex: jitterTTL(CONFIG.negativeCacheTTL),
    })
  } catch (error) {
    console.error('[Cache] Negative cache set error:', safeError(error))
  }
}
