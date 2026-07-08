# CLAUDE.md

This file provides guidance to AI Coding Agents when working with code in this repository.

## Project Overview

EtymEx is a Next.js Etymology Explorer web app that helps users discover word origins through an LLM-powered synthesis pipeline with grounded etymological evidence. The app runs in **public mode** by default (server-side API key) with rate limiting, cost budgets, caching, and distributed request deduplication.

Users search for a word, and the app:

1. Fetches raw data from 6 sources in parallel (Etymonline, Wiktionary, Free Dictionary always; Wikipedia, Urban Dictionary, Incel Wiki as optional supplemental sources)
2. Pre-parses etymological chains from source text (CPU-only)
3. Uses OpenRouter to extract root morphemes from the first-pass source bundle
4. Expands breadth with a bounded second pass over root pages and high-signal related pages from Etymonline and Wiktionary
5. Sends the enriched research bundle to OpenRouter's Responses API using `openai/gpt-5.4-mini` for structured synthesis
6. Post-processes LLM output to match ancestry stages to parsed evidence and assign programmatic confidence scores

**Live**: https://etymex.com

## Commands

```bash
# Development
bun dev              # Start dev server on localhost:3000

# Code quality
bun run lint             # ESLint check
bun run lint:fix         # Auto-fix lint issues
bun run format           # Prettier format all files
bun run format:check     # Verify formatting

# Production
bun run build            # Build for production
bun run start            # Start production server
```

Pre-commit hooks (Husky + lint-staged) automatically run ESLint and Prettier on staged files.

## Architecture

### Data Flow

```
User Search → proxy.ts (rate limit, CSP headers)
    ↓
GET /api/etymology?word=X[&stream=true]   (maxDuration 300s)
    ├── Input validation (lib/validation.ts)
    ├── Redis cache check (lib/cache.ts, 30d TTL)
    ├── Cost guard check (lib/costGuard.ts, 2 modes: normal → cache_only at 90% of budget)
    ├── Singleflight lock (lib/singleflight.ts, owner-token lock; Redis down → 503 for uncached)
    ├── Agentic Research Pipeline (lib/research.ts; request.signal aborts in-flight work):
    │   ├── Phase 1: Fire all 6 source fetches at once (3 core + 3 optional);
    │   │           only etymonline + wiktionary gate the next phase, the rest
    │   │           join before synthesis. Raw etymonline/wiktionary pages come
    │   │           from a 7d Redis source cache when available (lib/sourceCache.ts)
    │   ├── Phase 1.5: Pre-parse "from X, from Y" chains (lib/etymologyParser.ts, CPU-only)
    │   ├── Phase 2: CPU root extraction (derivation formulas + chain affixes);
    │   │           LLM fallback (15s timeout, truncated input) only when CPU finds none
    │   └── Phase 3: ONE parallel wave — root pages (max 4 roots, etymonline +
    │               wiktionary) + main-word related-term pages (etymonline only),
    │               max 16 total fetches
    ├── Typo check (lib/spellcheck.ts, Levenshtein distance vs GRE wordlist)
    ├── LLM synthesis (lib/llm.ts — one entrypoint for streaming and unary)
    │   ├── OpenRouter Responses json_schema STRICT mode (schema in lib/schemas/llm-schema.ts)
    │   ├── stream=true: synthesis_section SSE event per closed top-level field (render order)
    │   └── Post-processing: null-stripping, enrichAncestryGraph() matches stages to evidence,
    │       assigns confidence, attachSources() writes real source attributions
    ├── Cache result in Redis
    └── Response: EtymologyResult with grounded ancestry stages
```

### Public Mode Infrastructure

The app operates in **public mode** with server-side cost controls (added in PR #41):

- **`proxy.ts`** - Node middleware for rate limiting via @upstash/ratelimit:
  - Etymology: 20 req/min + 200 req/day per IP
  - Pronunciation: 20 req/min per IP
  - General: 60 req/min per IP
  - CSP headers for pages and API responses (pages use `script-src 'self' 'unsafe-inline'` because statically prerendered HTML carries per-build Next.js inline flight scripts that can't be hashed or nonce'd)

- **`lib/config.ts`** - Centralized configuration:
  - Per-IP rate caps: etymology 20/min + 200/day, pronunciation 20/min, general 60/min
  - USD monthly limit: $10/month (`openai/gpt-5.4-mini` pricing in `costTracking` as fallback; OpenRouter-reported cost preferred)
  - Timeouts: source fetches 5s, synthesis LLM 90s, root-extraction LLM 15s, TTS 15s
  - Tiered prompt character budgets (`promptBudget`: main 1500 / supplemental 800 / root 700 / related 450)
  - Rate limits, singleflight settings, feature flags

- **`lib/env.ts`** - Zod-based env validation with lazy init (build-time safe). Validates OPENROUTER_API_KEY, ADMIN_SECRET, Redis credentials, ElevenLabs config.

- **`lib/costGuard.ts`** - Monthly USD budget enforcement via pipelined Redis INCRBYFLOAT + EXPIRE NX:
  - Normal mode (0-90% of budget): allow uncached requests
  - Cache-only mode (≥90%): serve cached results only, reject uncached requests
  - Spend recording is awaited before responses finish; both the root-extraction and synthesis LLM calls are counted
  - Prefers OpenRouter provider-reported cost (`usage.cost`) with config-pricing math as fallback
  - The guard itself fails open without Redis, but uncached etymology requests fail closed (503) at the singleflight step

- **`lib/singleflight.ts`** - Distributed request deduplication via Redis owner-token locks (SET NX with random token, 90s TTL, EXPIRE heartbeat every 30s while the pipeline runs). Results are cached BEFORE lock release. Streaming waiters poll the cache every 2s for up to 150s with SSE keepalive events and negative-cache checks; non-streaming waiters poll ~10s then return 429 + Retry-After. A holder that errors writes a short-TTL failure marker (60s) before releasing, so waiters surface the error; promotion to holder only happens on a true crash — lock vanished with neither a result nor a marker. If 10 users search "etymology" simultaneously, only 1 LLM call is made.

- **`lib/cache.ts`** - Redis caching (via the shared `getRedis()` factory):
  - Etymology results: 30 day TTL, versioned keys (`etymology:v2.2:`)
  - TTS audio: 1 year TTL
  - Negative cache: 6 hour TTL for admitted types (`no_sources`, `invalid_word`)
  - Zod validation on reads only (writes are pre-validated by `finalizeResult` in lib/llm.ts)

- **`lib/sourceCache.ts`** - 7-day Redis cache for raw etymonline/wiktionary page data (`src:v1:<source>:<word>`). Fail-open: no Redis or a Redis error means a live fetch. Saves repeated scrapes across result-cache misses and overlapping root/related lookups.

- **`lib/redis.ts`** - Shared Redis client factory (returns null if not configured). Most callers fail open; uncached etymology fails closed with 503 (suggestions, random-word, and pronunciation keep working without Redis)

- **`lib/counters.ts`** - Best-effort monthly INCR counters (cache_hit / cache_miss / error), exposed via `/api/admin/stats`

- **`lib/errorUtils.ts`** - Secret redaction (provider keys, Bearer tokens, API keys)

- **`lib/fetchUtils.ts`** - AbortController-based timeout wrapper for all external API calls; composes an optional caller AbortSignal (request.signal) via `AbortSignal.any` so client disconnects cancel in-flight fetches and LLM calls

### Grounded Etymology Pipeline

Added in PR #39 to provide evidence-based ancestry chains with programmatic confidence scoring:

- **`lib/etymologyParser.ts`** - Pre-parses etymological chains from raw source text (CPU-only, no LLM):
  - Extracts "from X, from Y" patterns
  - Identifies language transitions and reconstructed forms
  - Returns structured evidence references

- **`lib/etymologyEnricher.ts`** - Post-processes LLM output:
  - Matches each ancestry stage to parsed evidence from sources
  - Assigns programmatic confidence: **high** (2+ sources), **medium** (1 source), **low** (no match)
  - Flags reconstructed forms (Proto-Indo-European, Proto-Germanic, etc.)
  - Adds evidence references to each stage

Pipeline flow: Raw sources → Parser (CPU) → LLM (validates/extends) → Enricher (confidence + evidence) → Client

New optional fields on `AncestryStage`: `isReconstructed`, `confidence`, `evidence[]` (backward compatible)

### Word Pages (primary search URL)

`/word/{word}` is the canonical, crawlable page for every word AND the primary in-app search
URL. Crawler traffic must never cost LLM money:

- **`app/word/[word]/page.tsx`** - SSR strictly from `getCachedEtymology` (`lib/cache.ts`).
  The module graph must never include `lib/research.ts`, `lib/llm.ts`, or
  `lib/openrouterResponses.ts` — enforced by `app/word/import-graph.test.ts`. ISR via
  `revalidate = 86400`. Cache hit renders `WordPageEntry`; cache miss renders a noindex page
  hosting `WordTraceExperience` (client), which streams the live trace via `/api/etymology`.
- **Auto-trace gating** (`lib/traceIntent.ts`): an uncached word page auto-starts its trace
  ONLY when a short-lived sessionStorage flag written by the in-app navigation handler
  (`lib/hooks/useWordNavigation.ts`) is present. Direct loads and crawlers — even JS-executing
  ones — get the "Trace it live" button instead; a human click is required to spend budget.
- **Revalidation**: after storing a new result, `cacheEtymology` (`lib/cache.ts`) schedules
  `revalidateTag('etymology-word:{word}', { expire: 0 })` inside `after()` — the deferral is
  required because streaming responses flush pending revalidations when the handler returns,
  and `{ expire: 0 }` hard-expires the tag (the `'max'` profile would only mark it
  stale-while-revalidate). A freshly traced word's page serves content on the next load
  instead of the ISR miss page.
- **`app/sitemap.ts`** - SCANs cached etymology keys (cursor-paginated, capped at 1000) using
  the exported `CACHE_VERSION`/`ETYMOLOGY_PREFIX` constants from `lib/cache.ts`.
- **`app/og/route.tsx`** - `/og?word={word}` renders a per-word OG card; without a valid
  `word` it falls back to the brand card.
- **Canonicals & redirects**: legacy `/?q=word` deep links permanently redirect (308) to
  `/word/{word}` (`app/page.tsx`); bare `/` is the landing/search page with canonical `/`.
  `ShareMenu` copies `window.location.href` (already canonical). All in-app navigation —
  search submits, history, suggestions, related words, random word — routes to `/word/{word}`.

### Research Pipeline Limits

Configured in `lib/config.ts` (consumed by `lib/research.ts`) to control API costs:

- `maxRootsToExplore = 4` - Max root morphemes to research (etymonline + wiktionary each, 2 fetches per root)
- `maxRelatedWordsPerRoot = 4` - Related terms retained per extraction pass; only main-word related terms are fetched (etymonline only, 1 fetch per term; root-page related terms are prompt context only)
- `maxTotalFetches = 16` - Hard cap on external API calls per search (root + related pages share one budgeted wave)
- `promptBudget` - Tiered per-block character caps for the synthesis prompt (main 1500, supplemental 800, root 700, related 450, root-extraction input 1200)
- `sourceCacheTTL = 7d` - Raw etymonline/wiktionary page cache

### LLM Integration

Both LLM calls (root extraction and synthesis) use **OpenRouter Responses `json_schema` strict
mode** (`text.format = { type: 'json_schema', strict: true, ... }`) with
`provider: { require_parameters: true }`, so requests only route to hosts that honor the schema
and the output is guaranteed-shape JSON.

**Schema split** (critical for maintainers):

- `lib/schemas/llm-schema.ts` - Strict-mode JSON Schema sent to the LLM. Every property is
  required, `additionalProperties: false` everywhere, optionality expressed as null unions, and
  top-level properties declared in **render order** (word → sources) — strict mode emits keys in
  schema order, which the section scanner and progressive rendering depend on.
- `lib/schemas/etymology.ts` - Zod schema for cache validation. Uses `.passthrough()` for forward compat.
- **Sync is enforced mechanically**: `lib/schemas/llm-schema.test.ts` walks both schemas and fails
  on drift (key sets, required lists, null unions, leaf types). Post-processing fields
  (confidence, evidence, isReconstructed, source url/word) are exempted explicitly in that test.

**Synthesis flow** (`lib/llm.ts`, single `synthesizeFromResearch` entrypoint):

1. Prompt: aggregated source data + pre-parsed chains (research pipeline) + system prompt
   from `lib/prompts.ts` (content/grounding rules only — shape is enforced by the schema)
2. Transport: passing an `onSection` callback streams the response and fires once per closed
   top-level field (via `lib/sectionScanner.ts`); omitting it makes a unary call
3. Parse: `parseGeneratedJson` fallback parse, then `stripNullsDeep` converts strict-mode nulls
   back to absent fields before sanitizers and Zod validation
4. Retry: malformed output retries once on the unary path, never on the streaming path
   (sections already on the wire cannot be retracted)

### State Management

**Server-side** (Redis):

- Cached etymology results (30d TTL)
- TTS audio cache (1yr TTL)
- Rate limit counters (per-IP, sliding windows)
- Monthly spend counters (atomic accumulation) + operational counters (cache_hit/miss/error)
- Singleflight owner-token locks (90s TTL, heartbeat-extended while work runs)
- Negative cache for admitted invalid/no-source words (6hr TTL)

**Client-side** (localStorage):

- Search history (max 50 entries)
- Theme preferences
- (No API keys in public mode - server-side OPENROUTER_API_KEY used)

**Key hooks**:

- `lib/hooks/useStreamingEtymology.ts` - SSE transport for streaming search; all progress
  state folds through the pure reducer in `lib/streamReducer.ts` (per-source states with
  timing, phase, accumulated `synthesis_section` events, final result)
- `lib/hooks/useWordNavigation.ts` - All in-app word navigation (marks trace intent, pushes
  `/word/{word}`, keyboard history back/forward)
- `lib/hooks/useNgram.ts` - Usage-chart data, fetched as soon as the word is known
- `lib/hooks/useLocalStorage.ts` - Persistent client state
- `lib/hooks/useHistory.ts` - Search history management

## Code Style

- **TypeScript strict mode** - All types defined in `lib/types.ts`
- **Prettier**: 100 char width, single quotes, no semicolons, ES5 trailing commas
- **ESLint**: Next.js core Web Vitals + Prettier integration
- **Tailwind CSS v4**: Custom cream/charcoal theme in `globals.css`

## Design Philosophy

This project follows a **distinctive, production-grade frontend aesthetic** that avoids generic AI-generated patterns. Every design choice should be intentional and memorable.

### Core Principles

- **Typography-first**: Etymology is about words—typography should be the hero. Use distinctive, characterful fonts (not Inter, Roboto, Arial). Pair a refined display font with a legible body font. The current theme uses a scholarly, editorial aesthetic.
- **Cream/Charcoal palette**: Warm, paper-like backgrounds with high-contrast text. Avoid purple gradients, neon accents, or cookie-cutter color schemes.
- **Spatial intention**: Generous whitespace for readability. Asymmetry and overlap where it serves the content. Grid-breaking elements for visual interest.
- **Purposeful motion**: Staggered reveals on load, smooth transitions. CSS-first animations. High-impact moments over scattered micro-interactions.
- **Atmospheric depth**: Subtle textures, layered shadows, and visual details that evoke old dictionaries and etymology books.

### Anti-patterns to Avoid

- Generic font stacks (system-ui, sans-serif defaults)
- Overused component patterns (rounded cards with drop shadows everywhere)
- Predictable layouts without personality
- Timid, evenly-distributed color palettes
- Effects that don't serve the scholarly/linguistic context

### Guiding Question

When adding UI: _"Would this feel at home in a beautifully typeset etymology dictionary?"_

## API Endpoints

| Endpoint             | Method | Purpose                                                                           |
| -------------------- | ------ | --------------------------------------------------------------------------------- |
| `/api/etymology`     | GET    | Main synthesis - `?word=X`; optional `?stream=true` for SSE (server-side API key) |
| `/api/suggestions`   | GET    | Autocomplete + typo suggestions - `?q=word`                                       |
| `/api/random-word`   | GET    | Random GRE word (crypto randomness)                                               |
| `/api/pronunciation` | GET    | TTS audio - `?word=word` (ElevenLabs, 15s timeout)                                |
| `/api/ngram`         | GET    | Google Books ngram usage data - `?word=word`                                      |
| `/api/health`        | GET    | Liveness check                                                                    |
| `/api/admin/stats`   | GET    | Budget + counter stats (requires `x-admin-secret` header)                         |

All return `{ success: boolean, data?: T, error?: string }` wrapper.

## Critical Files

**Public Mode Infrastructure:**

- `proxy.ts` - Rate limiting, CSP headers
- `lib/config.ts` - Centralized config (budgets, timeouts, limits)
- `lib/env.ts` - Zod env validation
- `lib/costGuard.ts` - Monthly spend enforcement (normal → cache_only at 90%)
- `lib/singleflight.ts` - Distributed request deduplication (owner-token locks)
- `lib/cache.ts` - Redis caching with versioned keys
- `lib/sourceCache.ts` - 7-day Redis cache for raw etymonline/wiktionary pages
- `lib/redis.ts` - Shared Redis client factory
- `lib/counters.ts` - Monthly cache_hit/cache_miss/error counters for admin stats

**Grounded Etymology:**

- `lib/etymologyParser.ts` - Pre-parse etymological chains from source text
- `lib/etymologyEnricher.ts` - Post-process LLM output, assign confidence + evidence

**Core Pipeline:**

- `lib/research.ts` - Agentic research orchestrator (6-source parallel fetch)
- `lib/llm.ts` - LLM client (OpenRouter Responses API for `openai/gpt-5.4-mini`; unified streaming/unary synthesis)
- `lib/sectionScanner.ts` - Incremental scanner emitting each top-level JSON field as it closes (powers synthesis_section SSE events)
- `lib/responseAdapter.ts` - SSE/JSON response adapter for the etymology route's early returns
- `lib/prompts.ts` - System prompt for LLM synthesis (content/grounding rules; shape enforced by schema)

**Schema & Types:**

- `lib/schemas/llm-schema.ts` - Strict-mode JSON Schema for LLM structured outputs (render-order keys, null-union optionality)
- `lib/schemas/etymology.ts` - Zod schema for cache validation (sync with the LLM schema is enforced by `lib/schemas/llm-schema.test.ts`)
- `lib/types.ts` - All TypeScript interfaces

**Data Sources:**

- `lib/etymonline.ts` - HTML scraper with fallback patterns
- `lib/wiktionary.ts` - MediaWiki API client
- `lib/freeDictionary.ts` - Free Dictionary API client
- `lib/wikipedia.ts` - Wikipedia REST API
- `lib/urbanDictionary.ts` - Urban Dictionary API with quality scoring/filtering
- `lib/incelsWiki.ts` - Incel Wiki MediaWiki API client (supplemental context)
- `lib/elevenlabs.ts` - ElevenLabs TTS client

**Word Pages (primary search URL):**

- `app/word/[word]/page.tsx` - Cache-only SSR word pages (import graph must exclude research/LLM)
- `app/word/import-graph.test.ts` - Enforces the no-LLM-in-module-graph budget invariant
- `components/WordPageEntry.tsx` - Client shell for cached word pages (EtymologyCard + ngram + shortcuts)
- `components/WordTraceExperience.tsx` - Live streaming trace UI for uncached word pages
- `components/StreamingEtymologyCard.tsx` - Progressive card: skeletons hydrate per synthesis_section
- `lib/streamReducer.ts` - Pure reducer folding SSE events into structured progress state
- `lib/traceIntent.ts` - sessionStorage in-app-navigation flag gating auto-trace (crawler cost invariant)

**Admin:**

- `app/api/admin/stats/route.ts` - Budget monitoring endpoint
- `.env.example` - Documents all env vars (OPENROUTER_API_KEY, ADMIN_SECRET, Redis, ElevenLabs)
