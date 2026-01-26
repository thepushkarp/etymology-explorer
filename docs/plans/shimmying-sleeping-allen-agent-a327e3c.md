# Cache Invalidation Patterns for Evolving Data Schemas

**Research Summary for Next.js + Upstash Redis Stack**

---

## 1. Industry Patterns: How Production Systems Handle Schema Changes

### Stripe's Approach: Date-Based Versioning with Dry Runs

Stripe maintains [backward compatibility with every API version since 2011](https://stripe.com/blog/api-versioning). Their strategy:

1. **Version pinning**: Each account is pinned to an API version (e.g., `2025-12-15.clover`)
2. **Per-request overrides**: Send `Stripe-Version: <new-date>` header to test new schemas
3. **Gradual migration**: Canary traffic with per-request overrides before changing account-level pin

**Key insight**: "Version change modules keep older API versions abstracted out of core code paths."

**Migration workflow**:

- Read changelog for breaking changes/deprecations
- Add automated tests requesting target version via header
- Ship to staging, canary some production traffic
- Fix incompatibilities, adjust schemas
- Update pinned version

### Vercel's Approach: Tag-Based Revalidation

Next.js uses [tag-based cache invalidation](https://nextjs.org/docs/app/getting-started/caching-and-revalidating):

```typescript
// Tag cached data
import { cacheTag } from 'next/cache'
async function getEtymology(word: string) {
  'use cache'
  cacheTag('etymology', `word:${word}`)
  return fetchEtymology(word)
}

// Invalidate by tag (marks as stale, doesn't delete immediately)
revalidateTag('etymology')
```

**Behavior**: `revalidateTag` doesn't delete cached response immediately - it marks as stale, and the next request triggers a refetch.

### The Rolling Deployment Problem

From [Version Your Cache Keys to Survive Rolling Deployments](https://blog.devgenius.io/version-your-cache-keys-to-survive-rolling-deployments-a62545326220):

> "We version APIs. We version database schemas. We should version caches too. Because if your cache is shared, it's already an API."

The problem occurs when:

- Cache is shared/distributed (Redis, Memcached)
- Multiple service instances run different code versions simultaneously
- Different instances read/write the same cache entries during rolling deploys

---

## 2. Redis-Specific Patterns: Key Versioning Best Practices

### Pattern A: Key Prefix Versioning (Simple)

```typescript
// lib/cache.ts
const CACHE_VERSION = 'v3' // Bump on schema changes
const CACHE_PREFIX = `etymology:${CACHE_VERSION}:`

export function getCacheKey(word: string): string {
  return `${CACHE_PREFIX}${word.toLowerCase().trim()}`
}
```

**Pros**: Simple, explicit
**Cons**: Leaves orphan keys from old versions (need cleanup job)

### Pattern B: Server-Side Versioned Namespaces (Recommended)

From [Redis Cache Invalidation Done Better](https://www.ackee.agency/blog/redis-cache-invalidation):

```typescript
// lib/cache.ts
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()
const NAMESPACE = 'etymology'
const VERSION_KEY = `cache:${NAMESPACE}:version`

// O(1) invalidation - just increment version counter
export async function invalidateAllCache(): Promise<void> {
  await redis.incr(VERSION_KEY)
}

export async function getCacheKey(word: string): Promise<string> {
  const version = (await redis.get<number>(VERSION_KEY)) ?? 1
  return `${NAMESPACE}:v${version}:${word.toLowerCase().trim()}`
}

// Alternative: Include version in value, not key
interface CachedValue<T> {
  schemaVersion: number
  data: T
  cachedAt: number
}

export async function getWithVersionCheck<T>(
  key: string,
  expectedVersion: number
): Promise<T | null> {
  const cached = await redis.get<CachedValue<T>>(key)
  if (!cached || cached.schemaVersion !== expectedVersion) {
    return null // Stale schema, treat as cache miss
  }
  return cached.data
}
```

**Best practices from the research**:

- Keep version metadata server-side inside Redis (not client-side)
- Don't delete keys on invalidation (TTL handles cleanup)
- Don't SCAN Redis (expensive O(n) operation)
- Use atomic `INCR` for version bumps

### Pattern C: Schema Hash in Key (Automated)

```typescript
// lib/cache.ts
import { createHash } from 'crypto'
import { EtymologyResult } from './types'

// Generate hash from schema shape at build time
function getSchemaHash(): string {
  // This would be generated at build time (see section 4)
  return process.env.ETYMOLOGY_SCHEMA_HASH ?? 'dev'
}

export function getCacheKey(word: string): string {
  const schemaHash = getSchemaHash()
  return `etymology:${schemaHash}:${word.toLowerCase().trim()}`
}
```

---

## 3. TypeScript-Specific Solutions: Type-Safe Cache Versioning

### Branded Types for Cache Keys

[Branded types](https://www.learningtypescript.com/articles/branded-types) ensure you can't accidentally mix cache keys:

```typescript
// lib/cache-types.ts

// Branded type for cache keys
type Brand<K, T> = K & { readonly __brand: T }
type CacheKey = Brand<string, 'CacheKey'>
type SchemaVersion = Brand<number, 'SchemaVersion'>

// Only createCacheKey can produce a valid CacheKey
export function createCacheKey(word: string, version: SchemaVersion): CacheKey {
  const normalized = word.toLowerCase().trim()
  return `etymology:v${version}:${normalized}` as CacheKey
}

// Type-safe version constant
export const CURRENT_SCHEMA_VERSION = 3 as SchemaVersion

// Cache functions only accept branded keys
export async function getCached(key: CacheKey): Promise<EtymologyResult | null> {
  return redis.get<EtymologyResult>(key)
}

// COMPILE ERROR: can't pass raw string
// getCached('etymology:v3:word')  // Error!

// WORKS: must go through createCacheKey
getCached(createCacheKey('word', CURRENT_SCHEMA_VERSION)) // OK
```

### Version Field in Interface with Type Guard

```typescript
// lib/types.ts

// Add version to cached data structure
export interface CachedEtymology {
  readonly _cacheVersion: 3 // Literal type for current version
  result: EtymologyResult
  cachedAt: number
}

// Type guard for version checking
export function isCurrentSchemaVersion(cached: unknown): cached is CachedEtymology {
  return (
    typeof cached === 'object' &&
    cached !== null &&
    '_cacheVersion' in cached &&
    (cached as { _cacheVersion: number })._cacheVersion === 3
  )
}

// Usage in cache retrieval
export async function getCachedEtymology(word: string): Promise<EtymologyResult | null> {
  const key = getCacheKey(word)
  const cached = await redis.get(key)

  if (!isCurrentSchemaVersion(cached)) {
    // Schema mismatch - treat as cache miss
    // Old data will eventually expire via TTL
    return null
  }

  return cached.result
}
```

### Discriminated Union for Multiple Schema Versions

```typescript
// lib/versioned-cache.ts

// Support multiple schema versions during migration
interface CacheV2 {
  readonly _cacheVersion: 2
  result: EtymologyResultV2 // Old schema
  cachedAt: number
}

interface CacheV3 {
  readonly _cacheVersion: 3
  result: EtymologyResult // Current schema
  cachedAt: number
}

type CachedData = CacheV2 | CacheV3

function migrate(cached: CachedData): EtymologyResult {
  switch (cached._cacheVersion) {
    case 2:
      // Transform v2 to v3 format
      return migrateV2ToV3(cached.result)
    case 3:
      return cached.result
  }
}
```

---

## 4. Build-Time Automation: Auto-Generate Cache Version from Schema

### Approach A: Hash Schema File at Build Time

```typescript
// scripts/generate-cache-version.ts
import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'

// Read the types file and generate hash
const typesContent = readFileSync('lib/types.ts', 'utf-8')

// Extract just the EtymologyResult interface
const schemaMatch = typesContent.match(/export interface EtymologyResult \{[\s\S]*?\n\}/)
if (!schemaMatch) throw new Error('EtymologyResult not found')

const hash = createHash('sha256').update(schemaMatch[0]).digest('hex').slice(0, 8)

// Write to generated file
writeFileSync(
  'lib/generated/cache-version.ts',
  `// AUTO-GENERATED - DO NOT EDIT
// Generated from lib/types.ts EtymologyResult interface
export const CACHE_SCHEMA_HASH = '${hash}' as const
export const CACHE_SCHEMA_VERSION = '${hash}' as const
`
)

console.log(`Generated cache version: ${hash}`)
```

**Add to package.json**:

```json
{
  "scripts": {
    "prebuild": "ts-node scripts/generate-cache-version.ts",
    "predev": "ts-node scripts/generate-cache-version.ts"
  }
}
```

### Approach B: TypeScript Compiler API for Robust Schema Hashing

```typescript
// scripts/generate-schema-hash.ts
import * as ts from 'typescript'
import { createHash } from 'crypto'

function extractInterfaceSignature(sourceFile: ts.SourceFile, interfaceName: string): string {
  let signature = ''

  function visit(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      // Get full text including nested types
      signature = node.getText(sourceFile)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return signature
}

// Parse types.ts with TypeScript compiler
const program = ts.createProgram(['lib/types.ts'], {})
const sourceFile = program.getSourceFile('lib/types.ts')!

// Extract all relevant interfaces
const interfaces = [
  'EtymologyResult',
  'Root',
  'AncestryGraph',
  'AncestryBranch',
  'AncestryStage',
  'SourceReference',
]

const combined = interfaces.map((name) => extractInterfaceSignature(sourceFile, name)).join('\n')

const hash = createHash('sha256').update(combined).digest('hex').slice(0, 8)

console.log(`Schema hash: ${hash}`)
```

### Approach C: Environment Variable Injection (Vercel-friendly)

```typescript
// next.config.ts
import { createHash } from 'crypto'
import { readFileSync } from 'fs'

const typesContent = readFileSync('lib/types.ts', 'utf-8')
const schemaHash = createHash('sha256').update(typesContent).digest('hex').slice(0, 8)

const nextConfig = {
  env: {
    CACHE_SCHEMA_HASH: schemaHash,
  },
}

export default nextConfig
```

```typescript
// lib/cache.ts
export function getCacheKey(word: string): string {
  const version = process.env.CACHE_SCHEMA_HASH ?? 'dev'
  return `etymology:${version}:${word.toLowerCase().trim()}`
}
```

---

## 5. Complete Implementation for Etymology Explorer

### Recommended Architecture

Combining the best patterns for your stack:

```typescript
// lib/cache/version.ts
// AUTO-GENERATED at build time - see scripts/generate-cache-version.ts
export const CACHE_SCHEMA_VERSION = 'a8f3e2c1' as const
export type CacheSchemaVersion = typeof CACHE_SCHEMA_VERSION
```

```typescript
// lib/cache/types.ts
import type { EtymologyResult } from '../types'
import type { CacheSchemaVersion } from './version'

// Branded cache key type
declare const CacheKeyBrand: unique symbol
export type CacheKey = string & { readonly [CacheKeyBrand]: true }

// Versioned cache wrapper
export interface CachedEtymologyData {
  readonly schemaVersion: CacheSchemaVersion
  readonly result: EtymologyResult
  readonly cachedAt: number
  readonly ttl: number
}

// Type guard
export function isValidCachedData(
  data: unknown,
  expectedVersion: CacheSchemaVersion
): data is CachedEtymologyData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'schemaVersion' in data &&
    (data as CachedEtymologyData).schemaVersion === expectedVersion
  )
}
```

```typescript
// lib/cache/index.ts
import { Redis } from '@upstash/redis'
import type { EtymologyResult } from '../types'
import { CACHE_SCHEMA_VERSION } from './version'
import type { CacheKey, CachedEtymologyData } from './types'
import { isValidCachedData } from './types'

const redis = Redis.fromEnv()
const CACHE_PREFIX = 'etymology'
const DEFAULT_TTL = 30 * 24 * 60 * 60 // 30 days

export function createCacheKey(word: string): CacheKey {
  const normalized = word.toLowerCase().trim()
  return `${CACHE_PREFIX}:${CACHE_SCHEMA_VERSION}:${normalized}` as CacheKey
}

export async function getCachedEtymology(word: string): Promise<EtymologyResult | null> {
  const key = createCacheKey(word)
  const cached = await redis.get<CachedEtymologyData>(key)

  // Version check ensures stale schema data is treated as cache miss
  if (!isValidCachedData(cached, CACHE_SCHEMA_VERSION)) {
    return null
  }

  return cached.result
}

export async function cacheEtymology(
  word: string,
  result: EtymologyResult,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const key = createCacheKey(word)
  const data: CachedEtymologyData = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    result,
    cachedAt: Date.now(),
    ttl,
  }

  await redis.set(key, data, { ex: ttl })
}

// Manual invalidation for specific word (if needed)
export async function invalidateCachedEtymology(word: string): Promise<void> {
  const key = createCacheKey(word)
  await redis.del(key)
}

// Stats for monitoring
export async function getCacheStats(): Promise<{
  schemaVersion: string
  keyPattern: string
}> {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    keyPattern: `${CACHE_PREFIX}:${CACHE_SCHEMA_VERSION}:*`,
  }
}
```

```typescript
// app/api/etymology/route.ts (updated)
import { getCachedEtymology, cacheEtymology } from '@/lib/cache'
import { conductResearch } from '@/lib/research'

export async function POST(req: Request) {
  const { word, llmConfig } = await req.json()

  // Check cache first
  const cached = await getCachedEtymology(word)
  if (cached) {
    return Response.json({
      success: true,
      data: cached,
      cached: true,
    })
  }

  // Run expensive research + LLM synthesis
  const result = await conductResearch(word, llmConfig)

  // Cache for future lookups (fire-and-forget, don't block response)
  cacheEtymology(word, result).catch(console.error)

  return Response.json({
    success: true,
    data: result,
    cached: false,
  })
}
```

### Build Script

```typescript
// scripts/generate-cache-version.ts
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const OUTPUT_PATH = 'lib/cache/version.ts'

// Read types file
const typesContent = readFileSync('lib/types.ts', 'utf-8')

// Extract interfaces that define cached data shape
const interfacePattern =
  /export interface (EtymologyResult|Root|AncestryGraph|AncestryBranch|AncestryStage|SourceReference) \{[\s\S]*?\n\}/g
const matches = typesContent.match(interfacePattern)

if (!matches || matches.length === 0) {
  throw new Error('No relevant interfaces found in lib/types.ts')
}

// Sort for deterministic hash (interface order shouldn't matter)
const sortedSchemas = matches.sort().join('\n')

// Generate 8-char hash
const hash = createHash('sha256').update(sortedSchemas).digest('hex').slice(0, 8)

// Ensure output directory exists
mkdirSync(dirname(OUTPUT_PATH), { recursive: true })

// Write generated file
const output = `// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from lib/types.ts schema interfaces
// Run: yarn generate-cache-version
// Hash computed from: EtymologyResult, Root, AncestryGraph, AncestryBranch, AncestryStage, SourceReference

export const CACHE_SCHEMA_VERSION = '${hash}' as const
export type CacheSchemaVersion = typeof CACHE_SCHEMA_VERSION
`

writeFileSync(OUTPUT_PATH, output)
console.log(`Generated cache schema version: ${hash}`)
```

**package.json scripts**:

```json
{
  "scripts": {
    "generate-cache-version": "ts-node scripts/generate-cache-version.ts",
    "prebuild": "yarn generate-cache-version",
    "predev": "yarn generate-cache-version"
  }
}
```

---

## 6. Migration Strategy: Schema Version Bumps

### When Schema Changes Occur

1. **Add optional field**: No version bump needed (backward compatible)
2. **Add required field**: Version bump needed
3. **Remove field**: Version bump needed
4. **Rename field**: Version bump needed
5. **Change field type**: Version bump needed

### Automatic Handling

With the hash-based approach, schema changes automatically get new cache keys:

```
Before: etymology:a8f3e2c1:telephone
After:  etymology:b9g4f3d2:telephone  (different hash)
```

Old entries remain until TTL expires - no thundering herd, no manual cleanup.

### Manual Override (Emergency Invalidation)

```typescript
// lib/cache/admin.ts
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

// Nuclear option: increment global version counter
// Use sparingly - causes 100% cache miss
export async function forceGlobalInvalidation(): Promise<void> {
  await redis.incr('etymology:force-version')
}

// Check force version when building cache key
export async function getCacheKeyWithForceCheck(word: string): Promise<string> {
  const forceVersion = (await redis.get<number>('etymology:force-version')) ?? 0
  const normalized = word.toLowerCase().trim()
  return `etymology:${CACHE_SCHEMA_VERSION}:f${forceVersion}:${normalized}`
}
```

---

## 7. Summary: Decision Matrix

| Pattern                   | When to Use                       | Complexity | Automation   |
| ------------------------- | --------------------------------- | ---------- | ------------ |
| Key prefix (`v1:`, `v2:`) | Simple apps, rare schema changes  | Low        | Manual       |
| Schema hash in key        | Production apps, frequent changes | Medium     | Build-time   |
| Version in value          | Need migration support            | Medium     | Runtime      |
| Server-side namespace     | Large scale, O(1) invalidation    | High       | Runtime      |
| Branded types             | Type safety critical              | Medium     | Compile-time |

**Recommended for Etymology Explorer**: Schema hash in key + branded types + build-time automation

---

## Sources

- [Version Your Cache Keys to Survive Rolling Deployments](https://blog.devgenius.io/version-your-cache-keys-to-survive-rolling-deployments-a62545326220)
- [Redis Cache Invalidation Done Better](https://www.ackee.agency/blog/redis-cache-invalidation)
- [Stripe API Versioning](https://stripe.com/blog/api-versioning)
- [Next.js Caching and Revalidating](https://nextjs.org/docs/app/getting-started/caching-and-revalidating)
- [Vercel Data Cache](https://vercel.com/blog/vercel-cache-api-nextjs-cache)
- [Upstash Redis with Next.js](https://upstash.com/docs/redis/tutorials/nextjs_with_redis)
- [Speed up Next.js with Redis](https://upstash.com/blog/nextjs-caching-with-redis)
- [Branded Types in TypeScript](https://www.learningtypescript.com/articles/branded-types)
- [TypeScript Branded Types Overview](https://dev.to/kuncheriakuruvilla/branded-types-in-typescript-beyond-primitive-type-safety-5bba)
- [Redis Cache Invalidation Glossary](https://redis.io/glossary/cache-invalidation/)
- [Redis Caching Strategies: Next.js Production Guide 2025](https://www.digitalapplied.com/blog/redis-caching-strategies-nextjs-production)
