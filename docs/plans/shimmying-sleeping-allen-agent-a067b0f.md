# Implementation Critique: 6 Planned Features for Etymology Explorer

**Date:** 2026-01-26
**Scope:** Critical analysis of issues #6, #7, #8, #9, #23, #25

---

## Executive Summary

After reviewing the codebase, I've identified **significant risks** in the proposed implementations. The current architecture wasn't designed for this level of expansion, and naively adding all 6 features will likely:

1. **Break the LLM prompt** - The current schema is already 116 lines; adding 4 new sections risks degraded output quality
2. **Exceed fetch limits** - MAX_TOTAL_FETCHES=10 is already tight; Wikipedia + Urban Dictionary add 2+ fetches
3. **Create cache versioning nightmares** - Adding caching BEFORE schema stabilization means painful migrations
4. **Accumulate hidden API costs** - ElevenLabs at $0.30/1000 chars adds up quickly without guardrails

---

## 1. Schema Design Review (`lib/types.ts`)

### Current State

```typescript
interface EtymologyResult {
  word: string
  pronunciation: string
  definition: string
  roots: Root[]
  ancestryGraph: AncestryGraph
  lore: string
  sources: SourceReference[]
}
```

### Proposed Extensions (from Issues #6, #23, #25)

```typescript
interface EtymologyResult {
  // Existing...
  modernUsage?: ModernUsage // Issue #6
  suggestions?: WordSuggestions // Issue #23
  partsOfSpeech: POSDefinition[] // Issue #25
}
```

### Critical Risks

| Risk                          | Severity | Details                                                                                                                               |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Backwards incompatibility** | HIGH     | Issue #25 proposes `partsOfSpeech: POSDefinition[]` as **required** (not optional). This breaks existing cached data and client code. |
| **Type coercion ambiguity**   | MEDIUM   | `definition: string` coexists with `partsOfSpeech[].definition`. Which takes precedence? Old clients expect a single string.          |
| **Optional field explosion**  | LOW      | 3 new optional fields = 2^3 = 8 possible response shapes. UI must handle all combinations gracefully.                                 |

### Recommendations

1. **Make ALL new fields optional with `?`** - Never break existing consumers
2. **Add schema version field**:
   ```typescript
   interface EtymologyResult {
     _schemaVersion: 1 | 2 // Increment when breaking changes
     // ...
   }
   ```
3. **Keep `definition: string` as canonical** - `partsOfSpeech[0].definition` should be derived, not primary

---

## 2. LLM Prompt Complexity (`lib/prompts.ts`)

### Current Prompt Metrics

| Metric                 | Current Value                                     |
| ---------------------- | ------------------------------------------------- |
| System prompt length   | ~2,200 tokens                                     |
| JSON schema properties | 7 required fields                                 |
| Nested object depth    | 4 levels (ancestryGraph.branches[].stages[].note) |

### Impact of Adding 4 New Sections

Each new feature adds to the schema:

| Feature                     | New Properties                            | Estimated Token Overhead      |
| --------------------------- | ----------------------------------------- | ----------------------------- |
| Issue #6 (modernUsage)      | 5 properties                              | +200 tokens                   |
| Issue #7 (convergent roots) | 0 new props (graph already supports DAGs) | +150 tokens (prompt guidance) |
| Issue #23 (suggestions)     | 5 arrays                                  | +250 tokens                   |
| Issue #25 (partsOfSpeech)   | 3 properties per POS                      | +300 tokens                   |

**Total overhead: ~900 additional tokens (~40% increase)**

### Risk: Prompt Degradation

From my analysis of Claude's structured output behavior:

1. **Attention dilution**: More schema fields = less focus on any single field
2. **Trade-off pressure**: Model may sacrifice `lore` quality to populate `suggestions`
3. **JSON hallucination**: Complex nested schemas increase parse failure risk

### Evidence from Current Code

The system prompt in `lib/prompts.ts:5-81` already shows signs of complexity:

- 76 lines of instructions
- Detailed examples for `ancestryGraph` structure
- "DO NOT" rules scattered throughout

Adding 4 more sections risks the "kitchen sink" anti-pattern.

### Recommendations

1. **Split into multiple LLM calls**:

   ```
   Call 1: Core etymology (roots, ancestry, lore)     [Existing]
   Call 2: Modern usage + suggestions                 [New, cheap model]
   Call 3: POS tagging                               [New, could use Haiku]
   ```

2. **If single call is required**: Prioritize with fallbacks:

   ```typescript
   // lib/prompts.ts
   const SCHEMA_PRIORITY = `
   CRITICAL fields (must always populate):
   - pronunciation, definition, roots, ancestryGraph, lore
   
   OPTIONAL fields (populate if data supports):
   - modernUsage, suggestions, partsOfSpeech
   `
   ```

3. **Use cheaper models for auxiliary data**: Issue #23 (synonyms/antonyms) could use GPT-3.5-turbo at 1/60th the cost

---

## 3. Research Pipeline Limits (`lib/research.ts`)

### Current Limits

```typescript
const MAX_ROOTS_TO_EXPLORE = 3
const MAX_RELATED_WORDS_PER_ROOT = 2
const MAX_TOTAL_FETCHES = 10
```

### Fetch Budget Analysis

**Current worst-case scenario (from `conductAgenticResearch`):**

| Phase            | Fetches | Description                  |
| ---------------- | ------- | ---------------------------- |
| 1. Main word     | 2       | Etymonline + Wiktionary      |
| 2. Roots         | 6       | 3 roots × 2 sources each     |
| 3. Related terms | 2       | Limited by MAX_TOTAL_FETCHES |
| **Total**        | **10**  | At limit                     |

### Adding Wikipedia + Urban Dictionary (Issue #6)

If added naively:

| Phase          | Fetches | Impact                     |
| -------------- | ------- | -------------------------- |
| 1. Main word   | 4       | +2 (Wikipedia, Urban Dict) |
| 2-3. Unchanged | 8       | —                          |
| **Total**      | **12**  | **EXCEEDS LIMIT**          |

### Detailed Risk Analysis

1. **Urban Dictionary API instability**: No SLA, rate limits vary, returns NSFW content
2. **Wikipedia disambiguation pages**: "Slay" returns a disambiguation page, not direct content
3. **Fetch cascading**: If root research triggers slang lookups, explosion possible

### Recommendations

1. **Increase MAX_TOTAL_FETCHES to 14** with monitoring:

   ```typescript
   const MAX_TOTAL_FETCHES = 14
   const WARN_THRESHOLD = 12 // Log warning if exceeded
   ```

2. **Make slang sources conditional**:

   ```typescript
   // Only fetch slang sources for words that might have modern usage
   const shouldFetchSlang = await quickSlangCheck(word, llmConfig)
   if (shouldFetchSlang) {
     const [wikipedia, urban] = await Promise.all([...])
   }
   ```

3. **Add per-source budgets**:

   ```typescript
   const FETCH_BUDGETS = {
     etymonline: 4,
     wiktionary: 4,
     wikipedia: 2, // Lower priority
     urbanDict: 1, // Optional
   }
   ```

4. **Implement fetch timeout per source**:
   ```typescript
   // Urban Dictionary is notoriously slow
   const urbanResult = await Promise.race([
     fetchUrbanDictionary(word),
     timeout(2000).then(() => null),
   ])
   ```

---

## 4. Caching Strategy (Issue #9)

### The Ordering Dilemma

**Question:** Should caching (Issue #9) be implemented BEFORE or AFTER the schema changes?

| Order       | Pros                                     | Cons                                             |
| ----------- | ---------------------------------------- | ------------------------------------------------ |
| Cache FIRST | Immediate cost savings, simple v1 schema | Must invalidate/migrate when schema changes      |
| Cache LAST  | Cache stores final schema, no migration  | Delayed cost savings, more expensive development |

### Schema Versioning Concerns

If you cache with current schema:

```json
{
  "word": "slay",
  "definition": "to kill",
  "roots": [...],
  "lore": "..."
}
```

Then add Issue #6 (modernUsage):

```json
{
  "word": "slay",
  "definition": "to kill",
  "modernUsage": { "hasSlangMeaning": true, ... },  // NEW
  ...
}
```

**Problem:** Cached entries lack `modernUsage`. Options:

1. **Serve stale data**: Old cache hits miss new fields
2. **Bust entire cache**: Expensive re-generation
3. **Lazy migration**: Re-fetch on cache hit if version mismatch

### Recommended Approach: Cache with Version Key

```typescript
// lib/cache.ts
const SCHEMA_VERSION = 1 // Bump when EtymologyResult changes
const CACHE_KEY_PREFIX = `etymology:v${SCHEMA_VERSION}:`

export async function getCachedEtymology(word: string) {
  const normalized = word.toLowerCase().trim()
  const key = `${CACHE_KEY_PREFIX}${normalized}`
  return redis.get<EtymologyResult>(key)
}

// When schema changes, increment SCHEMA_VERSION
// Old cache keys (v1:word) won't match new lookups (v2:word)
// Old entries expire naturally via TTL
```

### Implementation Order Recommendation

```
Phase 1: Implement caching (Issue #9) with version keys → Immediate savings
Phase 2: Add modernUsage (Issue #6) → Bump to v2, old cache expires
Phase 3: Add suggestions (Issue #23) → v3
Phase 4: Add partsOfSpeech (Issue #25) → v4
```

### Cache Key Design

```typescript
// GOOD: Version + word
;`etymology:v2:telephone`
// BETTER: Version + word + LLM model (in case outputs differ)
`etymology:v2:claude-3-sonnet:telephone`
// RISKY: Including LLM config hash (cache hit rate drops)
`etymology:v2:${hashConfig(llmConfig)}:telephone`
```

---

## 5. API Cost Analysis (Issue #8 - ElevenLabs)

### ElevenLabs Pricing Reality Check

| Tier    | Characters/month | Cost   | Words (avg 7 chars) |
| ------- | ---------------- | ------ | ------------------- |
| Free    | 10,000           | $0     | ~1,400              |
| Starter | 30,000           | $5/mo  | ~4,300              |
| Creator | 100,000          | $22/mo | ~14,300             |

### Usage Patterns to Consider

| Scenario                      | Monthly Characters | Cost         |
| ----------------------------- | ------------------ | ------------ |
| 100 daily users, 3 words each | 63,000             | ~$19/mo      |
| 500 daily users, 5 words each | 525,000            | ~$158/mo     |
| GRE word list pre-generation  | 3,500              | One-time ~$1 |

### On-Demand vs Pre-Cached Trade-offs

| Strategy                | Pros                               | Cons                                         |
| ----------------------- | ---------------------------------- | -------------------------------------------- |
| **On-demand**           | Pay only for actual usage          | Cold start latency (~500ms), rate limit risk |
| **Pre-cache GRE words** | Instant playback, predictable cost | Upfront expense (~$1), storage needed        |
| **Hybrid**              | Best of both                       | Implementation complexity                    |

### Recommendations

1. **Start with on-demand + aggressive caching**:

   ```typescript
   // app/api/pronunciation/route.ts
   export async function GET(req: Request) {
     const word = getWord(req)

     // Check cache first (R2, S3, or Upstash)
     const cached = await getPronunciationFromCache(word)
     if (cached) {
       return new Response(cached, { headers: audioCacheHeaders })
     }

     // Generate and cache
     const audio = await generatePronunciation(word)
     await cachePronunciation(word, audio) // Fire-and-forget

     return new Response(audio, { headers: audioCacheHeaders })
   }
   ```

2. **Add cost circuit breaker**:

   ```typescript
   const DAILY_CHAR_LIMIT = 10000 // ~1,400 words/day
   const dailyUsage = await getDailyUsage()

   if (dailyUsage > DAILY_CHAR_LIMIT) {
     return Response.json({ error: 'Daily pronunciation limit reached' }, { status: 429 })
   }
   ```

3. **Pre-generate during build** (for GRE words):

   ```typescript
   // scripts/generate-pronunciations.ts
   import words from '../data/gre-words.json'

   for (const word of words) {
     if (!(await hasCache(word))) {
       await generateAndCache(word)
       await sleep(100) // Rate limit protection
     }
   }
   ```

4. **Consider free alternatives first**:
   - Browser Speech Synthesis API (free, varies by browser)
   - Forvo API (user-contributed pronunciations)
   - Wiktionary audio files (when available)

---

## 6. Error Handling & Graceful Degradation

### Current Error Handling

From `app/api/etymology/route.ts:114-169`:

- Catches LLM API errors (401, 429)
- Returns generic error messages
- No source-specific fallbacks

### New Failure Modes

| Source           | Failure Mode        | Current Handling | Recommended     |
| ---------------- | ------------------- | ---------------- | --------------- |
| Wikipedia        | Disambiguation page | None             | Detect and skip |
| Urban Dictionary | NSFW content        | None             | Content filter  |
| Urban Dictionary | Rate limit          | None             | Backoff + skip  |
| ElevenLabs       | API key invalid     | None             | Disable feature |
| ElevenLabs       | Rate limit          | None             | Queue + retry   |

### Recommended Error Strategy

```typescript
// lib/research.ts

interface SourceResult<T> {
  success: boolean
  data?: T
  error?: string
  source: string
}

async function fetchWithFallback<T>(
  fetchers: Array<() => Promise<T | null>>,
  sourceName: string
): Promise<SourceResult<T>> {
  for (const fetcher of fetchers) {
    try {
      const result = await fetcher()
      if (result) {
        return { success: true, data: result, source: sourceName }
      }
    } catch (e) {
      console.warn(`[${sourceName}] Fetch failed:`, e)
    }
  }
  return { success: false, error: 'All fetchers failed', source: sourceName }
}
```

### Graceful Degradation Hierarchy

```
Full result (all sources available):
├── Core etymology (Etymonline + Wiktionary)  [REQUIRED]
├── Modern usage (Wikipedia + Urban Dict)     [OPTIONAL]
├── Suggestions (LLM-generated)               [OPTIONAL]
├── POS tagging (LLM-generated)               [OPTIONAL]
└── Pronunciation audio (ElevenLabs)          [OPTIONAL]

If sources fail:
├── Wikipedia fails → Skip modernUsage, continue
├── Urban Dict fails → Skip slang, continue
├── ElevenLabs fails → Show IPA only, no audio
└── Etymonline + Wiktionary BOTH fail → 404 with suggestions
```

### UI Indicators

```tsx
// components/EtymologyCard.tsx
{
  !result.modernUsage && (
    <div className="text-xs text-gray-400">Modern usage data unavailable for this word</div>
  )
}

{
  !pronunciationAvailable && (
    <button disabled className="opacity-50" title="Audio unavailable">
      <SpeakerIcon />
    </button>
  )
}
```

---

## 7. Convergent Root Detection (Issue #7)

### Current AncestryGraph Structure

```typescript
interface AncestryGraph {
  branches: AncestryBranch[] // Independent paths per root
  mergePoint?: {
    form: string
    note: string
  }
  postMerge?: AncestryStage[]
}
```

### The Problem

This structure assumes roots **diverge from ancestors → merge at the modern word**.

But convergent etymology is the **reverse**: roots that **converge at a shared ancestor**.

```
Current model (divergent):     Needed model (convergent):
    PIE₁     PIE₂                    PIE
     ↓        ↓                     /   \
  Greek₁   Greek₂               Greek₁  Greek₂
     ↓        ↓                    ↓       ↓
   root₁   root₂                lexic-  -logy
      \     /                      \     /
       word                         word
```

### Schema Modification Required

```typescript
interface AncestryGraph {
  branches: AncestryBranch[]
  mergePoint?: { form: string; note: string } // Modern word merge
  convergencePoints?: ConvergencePoint[] // NEW: Shared ancestors
  postMerge?: AncestryStage[]
}

interface ConvergencePoint {
  ancestorForm: string // e.g., "*leg-"
  ancestorLanguage: string // e.g., "PIE"
  meaning: string // e.g., "to collect, speak"
  descendantRoots: string[] // e.g., ["lexic-", "-logy"]
  note?: string // e.g., "Both morphemes derive from this root"
}
```

### UI Implications

The current `AncestryTree.tsx` component renders a **top-down tree**. Convergent roots require a **bottom-up merge visualization**.

```tsx
// Current: branches flow down to merge point
// Needed: detect convergencePoints and draw upward arrows

{
  graph.convergencePoints?.map((cp) => (
    <div className="convergence-callout">
      <div className="ancestor-node">{cp.ancestorForm}</div>
      <div className="descendant-arrows">
        {cp.descendantRoots.map((root) => (
          <Arrow key={root} from={root} to={cp.ancestorForm} />
        ))}
      </div>
    </div>
  ))
}
```

### Risk: LLM May Not Detect Convergence

The current prompt doesn't ask for PIE root analysis. The LLM may:

1. Miss convergent roots entirely
2. Create duplicate PIE nodes without linking
3. Hallucinate false convergences

**Mitigation:** Explicit prompt guidance + PIE root dictionary validation

---

## 8. Implementation Priority Matrix

| Issue                 | Impact                | Complexity | Dependencies              | Recommended Order |
| --------------------- | --------------------- | ---------- | ------------------------- | ----------------- |
| #9 (Caching)          | HIGH (cost savings)   | LOW        | None                      | **1st**           |
| #25 (POS)             | MEDIUM (educational)  | LOW        | None                      | **2nd**           |
| #23 (Suggestions)     | MEDIUM (educational)  | LOW        | None                      | **3rd**           |
| #6 (Modern slang)     | HIGH (unique feature) | MEDIUM     | Research pipeline changes | **4th**           |
| #7 (Convergent roots) | HIGH (unique feature) | HIGH       | Schema + UI changes       | **5th**           |
| #8 (Pronunciation)    | LOW (nice-to-have)    | MEDIUM     | External API costs        | **6th**           |

### Rationale

1. **Caching first**: Every subsequent feature benefits from reduced API costs during development
2. **POS before suggestions**: Simpler schema addition, establishes pattern
3. **Suggestions next**: Pure LLM addition, no new data sources
4. **Modern slang**: Requires new data sources, higher risk
5. **Convergent roots**: Most complex, requires schema + UI + prompt changes
6. **Pronunciation last**: External cost center, can skip if budget-constrained

---

## 9. Summary of Critical Recommendations

### Must-Do

1. **Add `_schemaVersion` to `EtymologyResult`** before any other changes
2. **Make ALL new fields optional** with `?` suffix
3. **Implement caching (Issue #9) FIRST** with versioned keys
4. **Add fetch budgets per source** in research pipeline

### Should-Do

1. Split LLM calls: core etymology vs auxiliary data
2. Add graceful degradation for all new sources
3. Implement cost circuit breakers for ElevenLabs
4. Pre-generate pronunciation for GRE word list

### Consider

1. Use cheaper models (Haiku, GPT-3.5) for synonyms/antonyms
2. Add browser Speech Synthesis API as free fallback
3. Implement lazy cache migration instead of full busts

---

## Open Questions for Discussion

1. **Should `partsOfSpeech` replace or supplement `definition`?**
   - Proposal: Keep both, with `definition = partsOfSpeech[0].definition` for backwards compat

2. **What's the acceptable latency budget for adding 2+ sources?**
   - Current: ~3-4s for full agentic research
   - With Wikipedia + Urban Dict: ~4-5s (parallel) or ~6-7s (serial)

3. **Is ElevenLabs worth the cost, or should we prioritize free alternatives?**
   - Browser Speech Synthesis: Free, inconsistent quality
   - Forvo: Free tier exists, community-sourced
   - ElevenLabs: Best quality, but $20+/mo at scale

4. **Should modernUsage be separate from lore, or merged?**
   - Separate: Cleaner UI, optional display
   - Merged: Single narrative, simpler schema
