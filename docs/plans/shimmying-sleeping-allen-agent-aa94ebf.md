# Cache Versioning Strategies for Schema-Dependent Data

Research analysis for Etymology Explorer's Upstash Redis caching with schema-dependent `EtymologyResult` objects.

---

## Context

**Current System:**

- Upstash Redis caching etymology results (JSON objects)
- Manual version prefix: `etymology:v${CACHE_VERSION}:word`
- When schema changes, manually bump CACHE_VERSION (1→2)
- Old keys TTL-expire naturally (30 days)

**Problem:** If version bump is forgotten, old cached data with stale schema gets returned, potentially breaking the frontend expecting new fields.

---

## Strategy Evaluation

### 1. Manual Versioning (Current)

```typescript
const CACHE_VERSION = 1
const CACHE_PREFIX = `etymology:v${CACHE_VERSION}:`
```

| Dimension       | Assessment                            |
| --------------- | ------------------------------------- |
| **Complexity**  | Trivial - single constant to update   |
| **Reliability** | Low - human-dependent, easy to forget |
| **Performance** | Zero overhead                         |
| **DX**          | Simple but error-prone                |

**Failure modes:**

- Developer forgets to bump version after schema change
- PR reviews miss the version bump
- Schema changes span multiple PRs, unclear when to bump

**Verdict:** Not recommended for production - "works until it doesn't"

---

### 2. Schema Hash Versioning

Compute a deterministic hash of the TypeScript interface or JSON schema, embed in cache key.

```typescript
// Using zod-to-json-schema + crypto
import { createHash } from 'crypto'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

const EtymologyResultSchema = z.object({ ... })
const jsonSchema = zodToJsonSchema(EtymologyResultSchema)
const SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(jsonSchema))
  .digest('hex')
  .slice(0, 8)

const CACHE_PREFIX = `etymology:${SCHEMA_HASH}:`
```

| Dimension       | Assessment                                                |
| --------------- | --------------------------------------------------------- |
| **Complexity**  | Medium - requires Zod schema + build-time hash generation |
| **Reliability** | High - automatic, impossible to forget                    |
| **Performance** | Zero runtime overhead (hash computed at build/startup)    |
| **DX**          | Excellent - schema changes auto-invalidate                |

**Implementation options:**

1. **Build-time hash** - Generate during `yarn build`, inject via env var
2. **Startup-time hash** - Compute once when server starts (slight cold-start cost)
3. **Import-time hash** - Compute when module loads (most common)

**Considerations:**

- Requires migrating from TypeScript interface to Zod schema (or maintaining both)
- JSON schema serialization must be deterministic (object key order)
- Could use `object-hash` library for simpler deterministic hashing

**Verdict:** Recommended - automatic, reliable, zero runtime cost

---

### 3. Git-Based Versioning

Use git commit hash of `lib/types.ts` or schema file as version.

```typescript
// At build time (next.config.js)
// Use execFileSync for safety instead of execSync with shell
import { execFileSync } from 'child_process'

const TYPES_HASH = execFileSync('git', ['log', '-1', '--format=%h', '--', 'lib/types.ts'])
  .toString()
  .trim()

// Inject into app via Next.js env
module.exports = {
  env: {
    SCHEMA_VERSION: TYPES_HASH,
  },
}
```

| Dimension       | Assessment                                            |
| --------------- | ----------------------------------------------------- |
| **Complexity**  | Medium - requires build-time git command              |
| **Reliability** | Medium - only works if types.ts changes are committed |
| **Performance** | Zero runtime overhead (build-time only)               |
| **DX**          | Good - automatic but requires commit discipline       |

**Failure modes:**

- Schema change in different file than tracked
- Types file modified for non-schema reasons (comments, formatting)
- Local dev without git (rare but possible)
- CI environments might not have full git history

**Verdict:** Acceptable - simpler than schema hash, but less precise

---

### 4. Runtime Validation (Schema Guard)

Validate cached data against schema before returning; if invalid, treat as cache miss.

```typescript
import { z } from 'zod'

const EtymologyResultSchema = z.object({
  word: z.string(),
  pronunciation: z.string(),
  definition: z.string(),
  roots: z.array(RootSchema),
  ancestryGraph: AncestryGraphSchema,
  lore: z.string(),
  sources: z.array(SourceReferenceSchema),
  // New optional fields - old data missing these passes validation
  partsOfSpeech: z.array(POSDefinitionSchema).optional(),
  suggestions: WordSuggestionsSchema.optional(),
  modernUsage: ModernUsageSchema.optional(),
})

export async function getCachedEtymology(word: string): Promise<EtymologyResult | null> {
  const key = `${CACHE_PREFIX}${word.toLowerCase().trim()}`
  try {
    const raw = await redis.get(key)
    if (!raw) return null

    // Validate against current schema
    const parsed = EtymologyResultSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn(`[Cache] Stale schema for "${word}", treating as miss`)
      // Optionally: await redis.del(key) to clean up
      return null
    }
    return parsed.data
  } catch (error) {
    console.error('[Cache] Get error:', error)
    return null
  }
}
```

| Dimension       | Assessment                                           |
| --------------- | ---------------------------------------------------- |
| **Complexity**  | Medium - requires Zod schema for cached types        |
| **Reliability** | High - runtime guarantee of valid data               |
| **Performance** | ~1-5ms per validation (depends on schema size)       |
| **DX**          | Good - graceful degradation, no version bumps needed |

**Advantages:**

- Graceful handling of schema evolution
- Optional fields in new schema mean old cached data still valid
- Can add migration logic (transform old format to new)
- Enables partial cache retention (only invalidates truly incompatible data)

**Disadvantages:**

- Runtime overhead on every cache hit
- Requires maintaining Zod schemas parallel to TypeScript types
- Doesn't proactively clear invalid data (wastes Redis storage)

**Verdict:** Recommended as defense-in-depth layer

---

### 5. Hybrid Approaches

Combine multiple strategies for defense-in-depth:

#### Option A: Schema Hash + Runtime Validation (Belt + Suspenders)

```typescript
// Build-time: compute schema hash
const SCHEMA_HASH = computeSchemaHash(EtymologyResultSchema)
const CACHE_PREFIX = `etymology:${SCHEMA_HASH}:`

// Runtime: validate anyway (catches bugs in hash computation)
export async function getCachedEtymology(word: string) {
  const raw = await redis.get(`${CACHE_PREFIX}${word}`)
  if (!raw) return null

  const parsed = EtymologyResultSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[Cache] Validation failed despite matching hash - bug?')
    return null
  }
  return parsed.data
}
```

**Verdict:** Overkill for most apps, but maximum safety

---

#### Option B: Git Hash + Schema Hash (CI/CD Integration)

```typescript
// In next.config.js - use execFileSync for safety
import { execFileSync } from 'child_process'
const TYPES_FILE_HASH = execFileSync('git', ['log', '-1', '--format=%h', '--', 'lib/types.ts'])
  .toString()
  .trim()

// At runtime, also compute schema hash and compare
// If mismatch, log warning (dev forgot to commit types.ts changes)
```

**Verdict:** Good for catching uncommitted schema changes

---

#### Option C: Version Prefix + Runtime Validation (Pragmatic)

Keep manual version but add validation as safety net:

```typescript
const CACHE_VERSION = 2 // Still bump manually
const CACHE_PREFIX = `etymology:v${CACHE_VERSION}:`

// But also validate on read
export async function getCachedEtymology(word: string) {
  const raw = await redis.get(`${CACHE_PREFIX}${word}`)
  if (!raw) return null

  const parsed = EtymologyResultSchema.safeParse(raw)
  if (!parsed.success) {
    // Manual version was bumped but data still invalid? Weird but handle it
    return null
  }
  return parsed.data
}
```

**Verdict:** Recommended for small teams - low effort, good safety

---

## Recommendation for Etymology Explorer

Given the constraints:

- Small team (easy to forget version bumps)
- Next.js app with Upstash Redis
- Schema will evolve (new features adding fields)
- Low traffic (validation overhead acceptable)

### Recommended: Option C (Version Prefix + Runtime Validation)

**Why this approach:**

1. **Minimal migration effort** - Don't need to rewrite types as Zod schemas immediately
2. **Graceful degradation** - Old cached data with optional fields still works
3. **Catches mistakes** - Even if version bump forgotten, validation prevents crashes
4. **Incremental adoption** - Can add schema hash later if needed

### Implementation Plan

**Phase 1: Add Runtime Validation (Now)**

```typescript
// lib/cache.ts
import { z } from 'zod'

// Minimal schema for validation (just required fields)
const EtymologyResultSchema = z
  .object({
    word: z.string(),
    pronunciation: z.string(),
    definition: z.string(),
    roots: z.array(
      z.object({
        root: z.string(),
        origin: z.string(),
        meaning: z.string(),
        relatedWords: z.array(z.string()),
      })
    ),
    ancestryGraph: z.object({
      branches: z.array(z.any()), // Loose validation for nested structure
    }),
    lore: z.string(),
    sources: z.array(z.any()),
  })
  .passthrough() // Allow additional fields

export async function getCachedEtymology(word: string): Promise<EtymologyResult | null> {
  const key = `${CACHE_PREFIX}${word.toLowerCase().trim()}`
  try {
    const raw = await redis.get(key)
    if (!raw) return null

    const parsed = EtymologyResultSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn(`[Cache] Invalid data for "${word}":`, parsed.error.issues)
      return null // Treat as cache miss
    }
    return parsed.data as EtymologyResult
  } catch (error) {
    console.error('[Cache] Get error:', error)
    return null
  }
}
```

**Phase 2: Add Schema Hash (When Schema Stabilizes)**

Once the schema stops changing frequently, add automatic hash:

```typescript
// lib/schemas/etymology.ts - Full Zod schema
export const EtymologyResultSchema = z.object({
  word: z.string(),
  pronunciation: z.string(),
  // ... full schema
})

// lib/cache.ts
import { createHash } from 'crypto'
import { zodToJsonSchema } from 'zod-to-json-schema'

const jsonSchema = zodToJsonSchema(EtymologyResultSchema)
const SCHEMA_HASH = createHash('md5').update(JSON.stringify(jsonSchema)).digest('hex').slice(0, 8)

const CACHE_PREFIX = `etymology:${SCHEMA_HASH}:`
```

**Phase 3: Remove Manual Version (Future)**

Once schema hash is in place, remove `CACHE_VERSION` constant entirely.

---

## Summary Table

| Strategy                          | Complexity | Reliability | Performance    | Best For          |
| --------------------------------- | ---------- | ----------- | -------------- | ----------------- |
| Manual version                    | Low        | Poor        | Zero           | Prototypes only   |
| Schema hash                       | Medium     | Excellent   | Zero           | Stable schemas    |
| Git hash                          | Medium     | Medium      | Zero           | CI/CD heavy teams |
| Runtime validation                | Medium     | Good        | ~1-5ms/hit     | Evolving schemas  |
| **Hybrid (Version + Validation)** | **Low**    | **Good**    | **~1-5ms/hit** | **Small teams**   |

---

## Sources

- [Redis Cache Invalidation Glossary](https://redis.io/glossary/cache-invalidation/)
- [Redis Versioning in Node.js - Medium](https://medium.com/@navidbarsalari/why-and-how-to-manage-cache-with-redis-versioning-in-node-js-de229def9137)
- [Zod Documentation](https://zod.dev/)
- [Schema Versioning with Zod - JCore](https://www.jcore.io/articles/schema-versioning-with-zod)
- [Schema Caching Strategies - StudyRaid](https://app.studyraid.com/en/read/11289/352205/schema-caching-strategies)
- [TypeScript Data Validators Compared - Medium](https://medium.com/@2nick2patel2/typescript-data-validators-at-scale-zod-valibot-superstruct-compared-177581543ac5)
- [Using Git Checksums for Cache Invalidation](https://stevegrunwell.com/blog/using-git-checksums-to-invalidate-browser-caches/)
- [Hash Versioning (HashVer)](https://miniscruff.github.io/hashver/)

---

_Research completed 2026-01-26_
