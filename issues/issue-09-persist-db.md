# Issue #9: Persist results in a DB

**Status:** Open
**Labels:** `enhancement`, `help wanted`
**Created:** 2026-01-05
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/9

---

## Problem

Persist etymologies in DB for quick lookups the second time the word is searched and to reduce API costs. This DB be maintained server-side.

## Implementation Context

### Current State

The app currently makes fresh LLM calls for every search via `POST /api/etymology`. This is expensive (Anthropic API costs) and slow (agentic research + LLM synthesis takes several seconds).

**Current Flow (in `app/api/etymology/route.ts`):**

1. Receive word from client
2. Run agentic research (Etymonline scrape + Wiktionary API)
3. Call Claude for synthesis
4. Return result to client

### Proposed Architecture

**Option A: Upstash Redis (Recommended - serverless-friendly)**

Since you're on Vercel, Upstash Redis integrates seamlessly:

```typescript
// lib/cache.ts
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()
const CACHE_PREFIX = 'etymology:'
const CACHE_TTL = 30 * 24 * 60 * 60 // 30 days

export async function getCachedEtymology(word: string): Promise<EtymologyResult | null> {
  const normalized = word.toLowerCase().trim()
  return redis.get<EtymologyResult>(`${CACHE_PREFIX}${normalized}`)
}

export async function cacheEtymology(word: string, result: EtymologyResult): Promise<void> {
  const normalized = word.toLowerCase().trim()
  await redis.set(`${CACHE_PREFIX}${normalized}`, result, { ex: CACHE_TTL })
}
```

**Updated API route (`app/api/etymology/route.ts`):**

```typescript
export async function POST(req: Request) {
  const { word, ...config } = await req.json()

  // Check cache first
  const cached = await getCachedEtymology(word)
  if (cached) {
    return Response.json({ success: true, data: cached, cached: true })
  }

  // Run expensive research + LLM call
  const result = await conductResearch(word, config)

  // Cache for future lookups
  await cacheEtymology(word, result)

  return Response.json({ success: true, data: result, cached: false })
}
```

**Option B: Vercel KV (Alternative)**

Similar API to Upstash but managed by Vercel:

```typescript
import { kv } from '@vercel/kv'
await kv.set(`etymology:${word}`, result, { ex: CACHE_TTL })
```

**Option C: PostgreSQL with Prisma (For complex queries)**

If you want to enable features like "browse all cached words" or "search by root":

```prisma
model Etymology {
  id        String   @id @default(cuid())
  word      String   @unique
  result    Json     // EtymologyResult
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Additional Considerations

1. **Cache invalidation**: Consider adding a "refresh" button to force re-fetch
2. **Version migration**: If EtymologyResult schema changes, add version field
3. **Analytics**: Track cache hit rate to measure effectiveness
4. **Pre-warming**: Optionally cache GRE words from `data/gre-words.json` on deploy

### Environment Variables Needed

```env
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
```

### Files to Create/Modify

- `lib/cache.ts` - New file for caching utilities
- `app/api/etymology/route.ts` - Add cache check/store
- `package.json` - Add `@upstash/redis` dependency
- `.env.example` - Document required env vars

---

## Contributing

To work on this issue:

1. Create branch: `git checkout -b feat/issue-9-persist-db`
2. Implement changes per the context above
3. Create PR with title: `feat: <description>`
4. In PR description, add: `Closes #9`

**Auto-close:** Include `Closes #9`, `Fixes #9`, or `Resolves #9` in the PR **description** (not title) to auto-close when merged.
