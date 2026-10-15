# AGENTS.md

This file provides guidance to AI Coding Agents when working with code in this repository.

## Project Overview

EtymEx is a Next.js Etymology Explorer web app that helps users discover word origins through an LLM-powered synthesis pipeline with grounded etymological evidence. The app runs in **public mode** by default (server-side API key) with rate limiting, cost budgets, caching, and distributed request deduplication.

Users search for a word or phrase in English, Italian, Spanish, French, or Portuguese. The app:

1. Fetches primary sources in parallel. English uses Etymonline and Wiktionary plus optional Wikipedia and Incel Wiki. Other supported languages use native and English Wiktionary editions, selected-language Wikipedia, Wikidata lexemes, and Dicionário Aberto for Portuguese. FreeDictionaryAPI supplies senses and pronunciation only when direct Wiktionary evidence is unavailable; it cannot establish ancestry.
2. Pre-parses source-local etymological chains and keeps independent lexical histories and evidence scopes.
3. Expands explicit source spelling variants/redirects, up to four useful independent phrase components, and up to four linked variant discoveries in staged parallel waves, then researches up to four attested ancestor lexemes in their own language. English also retains CPU-first root extraction (LLM fallback only when necessary) and related-page expansion.
4. Retains complete extracted source text and full Wikipedia article extracts in the synthesis bundle; there are no per-source character caps or prompt clipping.
5. Sends the enriched bundle to OpenRouter's Responses API using `openai/gpt-6-luna` with low reasoning effort and strict structured output.
6. Matches ancestry stages to scoped evidence, assigns confidence, and prunes unsupported lineage claims. Component evidence cannot establish the whole phrase's origin.

The primary Wiktionary edition defines source-local history boundaries, with Etymonline as the English fallback; complete secondary sources remain independent context without invented history alignment. Each history has its own selectable story and lineage, with compound branches kept within that history. A Wikipedia-only result has an explicitly unresolved history. Components alone cannot admit a phrase.

Every actual source HTTP attempt shares a 32-request ceiling, including primary fetches, fallback attempts, Wikidata detail requests, and enrichment. Source-cache hits consume no HTTP budget; LLM calls are separate from this source budget.

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
    ├── Research Pipeline (lib/research.ts; request.signal aborts in-flight work):
    │   ├── Parallel primary fetches, selected by language; raw source cache first
    │   ├── CPU parsing into independent histories and scoped evidence
    │   ├── Bounded variant/redirect and phrase-component enrichment for all supported languages
    │   ├── Attested ancestor lookup; English CPU-first roots + related-page expansion
    │   └── Full extracted source text retained; 32 actual source HTTP attempts total
    ├── Typo check (lib/spellcheck.ts, Levenshtein distance vs GRE wordlist)
    ├── LLM synthesis (lib/llm.ts — one entrypoint for streaming and unary)
    │   ├── OpenRouter Responses json_schema STRICT mode (schema in lib/schemas/llm-schema.ts)
    │   ├── stream=true: synthesis_section SSE events; validated primary history projects entry fields before sibling histories finish
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
  - Legacy `/?q=word` deep links 308 to `/word/{word}` here, keeping `/` statically prerendered

- **`lib/config.ts`** - Centralized configuration:
  - Per-IP rate caps: etymology 20/min + 200/day, pronunciation 20/min, general 60/min
  - USD monthly limit: $10/month (conservative fallback-chain pricing in `costTracking` when OpenRouter omits provider-reported cost)
  - Timeouts: source fetches 5s, synthesis LLM 90s, root-extraction LLM 15s, TTS 15s
  - Word/phrase validation: maximum 120 canonical characters; Unicode letters/marks, spaces, apostrophes, and hyphens
  - Source HTTP budget: 32 actual attempts across all primary, fallback, and enrichment requests; no source-text clipping
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
  - Etymology results: 30 day TTL (five minutes when research has unresolved source/root lookups), versioned keys (`etymology:v2.6:` for English, `etymology:beta:v8:` for other supported languages)
  - TTS audio: 1 year TTL
  - Negative cache: 30 minute TTL for admitted types (`no_sources`, `invalid_word`)
  - Zod validation on reads only (writes are pre-validated by `finalizeResult` in lib/llm.ts)

- **`lib/sourceCache.ts`** - 7-day Redis cache for raw dictionary and Wikipedia source data (`src:v6:<source>:<word>` for English, `src:v6:<source>:<language>:<word>` otherwise). Historical-language selections use `src:v6:wiktionaryLanguage:<encoded heading>:<word>`, shared across query languages; English selections retain the `wiktionary` namespace. Fail-open: no Redis or a Redis error means a live fetch. Preserves complete source text and provenance, and saves repeated fetches across overlapping lookups.

- **`lib/redis.ts`** - Shared Redis client factory (returns null if not configured). Most callers fail open; uncached etymology fails closed with 503 (suggestions, random-word, and pronunciation keep working without Redis)

- **`app/api/pronunciation/route.ts`** - Complete MP3 playback responses precede audio-cache persistence.
  On a cache miss, the cost check and owner-token lock acquisition run in parallel. `after()`
  persists the complete clip before releasing the lock, keeping cleanup alive on serverless
  runtimes. Concurrent listeners poll at `audioWaiterPollIntervalMs` (250 ms); cached clips
  remain available under budget pressure and retain the one-year HTTP cache lifetime.

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

### Word and Phrase Identity

`lib/orthography.ts` supplies the shared identity for navigation, cache keys, evidence, and API inputs: NFC lowercase, with Unicode horizontal space separators trimmed and collapsed to one ASCII space. Accents and apostrophe/hyphen forms remain lexical information; spaced and hyphenated phrases are distinct. Controls and line separators are preserved through normalization and rejected by `lib/validation.ts`, including at input boundaries. Canonical words/phrases may contain up to 120 characters. `SearchBox` validates before navigation and presents inline feedback for invalid input.

### Word Pages (primary search URL)

`/word/{word}` is the canonical, crawlable page for every word AND the primary in-app search
URL. Crawler traffic must never cost LLM money:

- **`app/word/[...segments]/page.tsx`** - SSR strictly from `getCachedEtymology` (`lib/cache.ts`).
  The module graph must never include `lib/research.ts`, `lib/llm.ts`, or
  `lib/openrouterResponses.ts` — enforced by `app/word/import-graph.test.ts`. ISR via
  `revalidate = 86400`. Cache hit renders `EntryView`; cache miss renders a noindex page
  hosting `WordTraceExperience` (client), which streams the live trace via `/api/etymology`.
- **Auto-trace gating** (`lib/traceIntent.ts`): an uncached word page auto-starts its trace
  ONLY when a short-lived sessionStorage flag written by the in-app navigation handler
  (`lib/hooks/useWordNavigation.ts`) is present. Direct loads and crawlers — even JS-executing
  ones — get the "Trace it live" button instead; a human click is required to spend budget.
  Auto-start uses a cancellable deferred task before consuming the flag, so React Strict Mode
  effect replay cannot close the only stream and leave the page loading.
- **Revalidation**: after storing a new result, `cacheEtymology` (`lib/cache.ts`) schedules
  `revalidateTag('etymology-word:{word}', { expire: 0 })` inside `after()` — the deferral is
  required because streaming responses flush pending revalidations when the handler returns,
  and `{ expire: 0 }` hard-expires the tag (the `'max'` profile would only mark it
  stale-while-revalidate). A freshly traced word's page serves content on the next load
  instead of the ISR miss page.
- **`lib/tracedWords.ts`** - SCANs cached etymology keys (cursor-paginated, capped at 1000,
  daily `unstable_cache`). Shared by `app/sitemap.ts` and the `/words` A–Z index
  (`app/words/page.tsx`), which is the crawlable internal-link path to every cached word page;
  its import graph is held to the same no-LLM invariant by `app/word/import-graph.test.ts`.
- **`app/robots.txt/route.ts`** - Opts into search and AI answer engines (`ai-input=yes`), out
  of training (`ai-train=no`); always advertises the canonical `SITE_ORIGIN` sitemap.
- **`app/og/route.tsx`** - `/og?word={word}` renders a per-word OG card; without a valid
  `word` it falls back to the brand card.
- **Canonicals & redirects**: legacy `/?q=word` deep links permanently redirect (308) to
  `/word/{word}` in `proxy.ts`, so `/` stays a static page with canonical `/`.
  `ShareButton` shares `window.location.href` (already canonical). All in-app navigation —
  search submits, suggestions, related words, random word — routes to `/word/{word}`;
  rendered word links use `components/WordLink.tsx` (real `<a href>`, prefetch on hover/focus).

### Research Pipeline Limits

Configured in `lib/config.ts` (consumed by `lib/research.ts`) to control API costs:

- `maxRootsToExplore = 4` - Max root morphemes to research (etymonline + wiktionary each, 2 fetches per root)
- `maxRelatedWordsPerRoot = 4` - Related terms retained per extraction pass; only main-word related terms are fetched (etymonline only, 1 fetch per term; root-page related terms are prompt context only)
- `maxTotalFetches = 32` - Hard cap on actual source HTTP attempts per search, enforced by `lib/sourceFetchBudget.ts` through `lib/fetchUtils.ts`. Primary requests, fallbacks, detail requests, and enrichment share the ceiling; source-cache hits and LLM calls do not consume it.
- Attested ancestor and English root lookups retry a transient Wiktionary HTTP/network failure once within the shared budget; 404, 429, and caller cancellation are not retried.
- Source text is sanitized for prompt embedding and retained in full. Context overflow returns an explicit error instead of silently truncating evidence.
- `sourceCacheTTL = 7d` - Raw dictionary and Wikipedia source cache

English's root-extraction fallback overlaps the remaining primary fetches and source-defined
lexeme expansion. All primary sources still finish before lexeme expansion; root and related-page
research waits for both, preserving complete source text and HTTP budget priority.

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
  English and beta-language entries can render the primary history's projection after the
  server validates its identity, bilingual shape, and scoped ancestry, while shared fields
  continue streaming.
- `lib/schemas/etymology.ts` - Zod schema for cache validation. Uses `.passthrough()` for forward compat.
- **Sync is enforced mechanically**: `lib/schemas/llm-schema.test.ts` walks both schemas and fails
  on drift (key sets, required lists, null unions, leaf types). Post-processing fields
  (confidence, evidence, isReconstructed, source url/word) are exempted explicitly in that test.

**Synthesis flow** (`lib/llm.ts`, single `synthesizeFromResearch` entrypoint):

1. Prompt: complete sanitized source data + pre-parsed chains and independent component/variant scopes (research pipeline) + system prompt
   from `lib/prompts.ts` (content/grounding rules only — shape is enforced by the schema)
2. Transport: passing an `onSection` callback streams the response. The scanner reports closed
   top-level fields and complete history objects. A primary history can project entry fields
   after the normal identity, bilingual, and scoped-evidence checks; complete history metadata
   waits for the full collection to validate. Entry fields publish once. Omitting the callback
   makes a unary call.
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
- Negative cache for admitted invalid/no-source words (30m TTL)

**Client-side** (localStorage):

- Theme preference (`theme-preference`; applied pre-paint by the inline script in `app/layout.tsx`)
- (No API keys in public mode - server-side OPENROUTER_API_KEY used)

**Key hooks**:

- `lib/hooks/useStreamingEtymology.ts` - SSE transport for streaming search; all progress
  state folds through the pure reducer in `lib/streamReducer.ts` (per-source states with
  timing, phase, accumulated `synthesis_section` events, final result)
- `lib/hooks/useWordNavigation.ts` - Programmatic word navigation (marks trace intent, pushes
  `/word/{word}`)
- `lib/hooks/useNgram.ts` - Usage-chart data; one shared request per word, started with the trace
- `lib/hooks/useHotkey.ts` - Single-key shortcuts (`/` focuses search, `p` plays pronunciation)

## Code Style

- **TypeScript strict mode** - All types defined in `lib/types.ts`
- **Prettier**: 100 char width, single quotes, no semicolons, ES5 trailing commas
- **ESLint**: Next.js core Web Vitals + Prettier integration
- **Tailwind CSS v4**: Seven color tokens (`paper`, `ink`, `muted`, `faint`, `rule`, `wash`, `accent`) plus lineage-only language-family tokens (`lang-pie`, `lang-greek`, `lang-latin`, `lang-romance`, `lang-germanic`, `lang-semitic`, `lang-other`) in `globals.css`, redefined under `.dark`

## Design Philosophy

The UI is a quiet, typeset dictionary page: the words carry it, the chrome gets out of the way.

### Core Principles

- **Typography-first**: Libre Baskerville (regular + italic) for words and prose, Alegreya Sans (regular) for small UI text. Hierarchy comes from size, italics, and the small-caps `label` utility — no bold weights (they are not loaded).
- **One reading column**: `max-w-3xl`, generous vertical rhythm, hairline `rule` borders. No cards, gradients, shadows, or pills.
- **Restrained color**: paper, ink, and a single oxblood `accent` used for emphasis and the live marker. The one exception is the lineage tree, which marks each node's language family with a `lang-*` token (top edge + legend). Use tokens, never raw hex or Tailwind palette colors.
- **Purposeful motion**: one CSS `animate-rise` reveal (staggered via `animation-delay`), color transitions on hover, skeleton pulses while streaming. Honor reduced motion.
- **Real links**: words link to word pages with `<WordLink>`; native `<details>` for disclosure.

### Anti-patterns to Avoid

- Rounded cards with drop shadows, gradient backgrounds, colored chip rainbows
- Section nav chips, modals, and sidebars for secondary features
- Faux-bold text (`font-semibold`/`font-bold`) — only 400 weights are loaded

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

- `lib/research.ts` - Language-aware primary fetching and bounded scoped variant/component/ancestor enrichment
- `lib/llm.ts` - LLM client (OpenRouter Responses API for `openai/gpt-6-luna`; unified streaming/unary synthesis)
- `lib/sectionScanner.ts` - Incremental scanner reporting closed top-level JSON fields and complete direct object elements of their arrays; the synthesis layer validates histories before projecting SSE entry fields
- `lib/responseAdapter.ts` - SSE/JSON response adapter for the etymology route's early returns
- `lib/prompts.ts` - System prompt for LLM synthesis (content/grounding rules; shape enforced by schema)

**Schema & Types:**

- `lib/schemas/llm-schema.ts` - Strict-mode JSON Schema for LLM structured outputs (render-order keys, null-union optionality)
- `lib/schemas/etymology.ts` - Zod schema for cache validation (sync with the LLM schema is enforced by `lib/schemas/llm-schema.test.ts`)
- `lib/types.ts` - All TypeScript interfaces

**Data Sources:**

- `lib/etymonline.ts` - HTML scraper with fallback patterns
- `lib/wiktionary.ts` - MediaWiki API client
- `lib/multilingualSources.ts` - Selected-language dictionary sources and the senses-only FreeDictionaryAPI fallback for all supported languages
- `lib/wikipedia.ts` - Selected-language MediaWiki API full-article extracts with exact-title/redirect validation and revision provenance
- `lib/incelsWiki.ts` - Incel Wiki MediaWiki API client (supplemental context)
- `lib/elevenlabs.ts` - ElevenLabs TTS client

**Word Pages (primary search URL):**

- `app/word/[...segments]/page.tsx` - Cache-only SSR word pages (import graph must exclude research/LLM)
- `app/word/import-graph.test.ts` - Enforces the no-LLM-in-module-graph budget invariant
- `components/EntryView.tsx` - Client shell for a finished entry (cached page or completed trace)
- `components/WordTraceExperience.tsx` - Live streaming trace UI for uncached word pages
- `components/EtymologyCard.tsx` - Entry layout; `pending` renders skeletons until each synthesis_section lands
- `components/AncestryTree.tsx` - Lineage tree: CSS-laid-out nodes, edges measured from the DOM into an SVG overlay, draggable nodes (mouse drag; touch press-and-hold), one shared details panel
- `lib/streamReducer.ts` - Pure reducer folding SSE events into structured progress state
- `lib/traceIntent.ts` - sessionStorage in-app-navigation flag gating auto-trace (crawler cost invariant)

**Admin:**

- `app/api/admin/stats/route.ts` - Budget monitoring endpoint
- `.env.example` - Documents all env vars (OPENROUTER_API_KEY, ADMIN_SECRET, Redis, ElevenLabs)
