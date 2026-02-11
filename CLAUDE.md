# CLAUDE.md

This file provides guidance to AI Coding Agents when working with code in this repository.

## Project Overview

Etymology Explorer is a Next.js web app that helps users discover word origins through an LLM-powered synthesis pipeline with grounded etymological evidence. The app runs in **public mode** by default (server-side API key) with rate limiting, cost budgets, caching, and distributed request deduplication.

Users search for a word, and the app:

1. Fetches raw data from 4 sources in parallel (Etymonline, Wiktionary, Wikipedia, Urban Dictionary)
2. Pre-parses etymological chains from source text (CPU-only)
3. Sends aggregated data to Claude for structured synthesis
4. Post-processes LLM output to match ancestry stages to parsed evidence and assign programmatic confidence scores

**Live**: https://etymology.thepushkarp.com

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
GET /api/etymology?word=X
    ├── Input validation (lib/validation.ts)
    ├── Redis cache check (lib/cache.ts, 30d TTL)
    ├── Singleflight lock (lib/singleflight.ts, prevents duplicate concurrent requests)
    ├── Cost guard check (lib/costGuard.ts, 4 modes: normal → degraded → cache_only → blocked)
    ├── Agentic Research Pipeline (lib/research.ts):
    │   ├── Phase 1: Parallel fetch from 4 sources (timeout: 4s each)
    │   ├── Phase 1.5: Pre-parse "from X, from Y" chains (lib/etymologyParser.ts, CPU-only)
    │   ├── Phase 2: LLM call to extract root morphemes
    │   ├── Phase 3: Fetch data for each root (max 3)
    │   └── Phase 4: Fetch related terms (max 10 total fetches)
    ├── Typo check (lib/spellcheck.ts, Levenshtein distance vs GRE wordlist)
    ├── LLM synthesis (lib/claude.ts, timeout: 15s)
    │   ├── Structured outputs via Anthropic SDK
    │   └── Post-processing: enrichAncestryGraph() matches stages to evidence, assigns confidence
    ├── Cache result in Redis
    └── Response: EtymologyResult with grounded ancestry stages
```

### Public Mode Infrastructure

The app operates in **public mode** with server-side cost controls (added in PR #41):

- **`proxy.ts`** - Rate limiting via @upstash/ratelimit:
  - Etymology: 10 req/min + 100 req/day per IP
  - Pronunciation: 20 req/min per IP
  - General: 60 req/min per IP
  - CSP headers and security headers

- **`lib/config.ts`** - Centralized configuration:
  - Daily request caps: etymology 2000/day, pronunciation 500/day
  - USD daily limit: $15/day (Haiku 4.5 pricing: $1/$5 per M input/output tokens)
  - Timeouts: source fetches 4s, LLM 15s, TTS 8s
  - Rate limits, singleflight settings, feature flags

- **`lib/env.ts`** - Zod-based env validation with lazy init (build-time safe). Validates ANTHROPIC_API_KEY, ADMIN_SECRET, Redis credentials, ElevenLabs config.

- **`lib/costGuard.ts`** - Daily budget enforcement via atomic Redis INCR:
  - Normal mode (0-70% budget): all 4 sources
  - Degraded mode (70-90%): skip Wikipedia + Urban Dictionary
  - Cache-only mode (90-100%): serve cached results only
  - Blocked mode (100%+): reject new requests
  - Fail-open if Redis unavailable

- **`lib/singleflight.ts`** - Distributed request deduplication via Redis SET NX (30s TTL). If 10 users search "etymology" simultaneously, only 1 LLM call is made; others poll and receive the same result.

- **`lib/cache.ts`** - Redis caching:
  - Etymology results: 30 day TTL, versioned keys
  - TTS audio: 1 year TTL
  - Negative cache: 6 hour TTL for errors
  - Zod validation on reads for forward compatibility

- **`lib/redis.ts`** - Shared Redis client factory (returns null if not configured; all callers fail open)

- **`lib/errorUtils.ts`** - Secret redaction (sk-ant-\*, Bearer tokens, API keys)

- **`lib/fetchUtils.ts`** - AbortController-based timeout wrapper for all external API calls

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

### Research Pipeline Limits

Defined in `lib/research.ts` to control API costs:

- `MAX_ROOTS_TO_EXPLORE = 3` - Max root morphemes to research
- `MAX_RELATED_WORDS_PER_ROOT = 2` - Related terms per root
- `MAX_TOTAL_FETCHES = 10` - Hard cap on external API calls per search

### LLM Integration

The app uses **Anthropic's structured outputs API** for guaranteed valid JSON.

**Schema split** (critical for maintainers):

- `lib/schemas/llm-schema.ts` - JSON Schema sent to LLM (defines structure for generation)
- `lib/schemas/etymology.ts` - Zod schema for cache validation (client-side). Uses `.passthrough()` for forward compat.
- **Must stay in sync manually** - post-processing fields (confidence, evidence) only exist in Zod schema, not LLM schema

LLM receives:

1. Aggregated source data from research pipeline
2. Pre-parsed etymological chains from etymologyParser.ts
3. JSON schema from `lib/schemas/llm-schema.ts`
4. System prompt from `lib/prompts.ts`

**Note**: Anthropic calls use `betas: ['structured-outputs-2025-11-13']` flag.

### State Management

**Server-side** (Redis):

- Cached etymology results (30d TTL)
- TTS audio cache (1yr TTL)
- Rate limit counters (per-IP, sliding windows)
- Daily budget counters (atomic INCR)
- Singleflight locks (30s TTL)
- Negative cache for gibberish words (6hr TTL)

**Client-side** (localStorage):

- Search history (max 50 entries)
- Theme preferences
- (No API keys in public mode - server-side ANTHROPIC_API_KEY used)

**Key hooks**:

- `lib/hooks/useEtymologySearch.ts` - Main search state management (idle/loading/success/error)
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

| Endpoint             | Method | Purpose                                               |
| -------------------- | ------ | ----------------------------------------------------- |
| `/api/etymology`     | GET    | Main synthesis - `?word=X` (server-side API key)      |
| `/api/suggestions`   | GET    | Typo correction - `?q=word`                           |
| `/api/random-word`   | GET    | Random GRE word (crypto randomness)                   |
| `/api/pronunciation` | GET    | TTS audio - `?word=word` (ElevenLabs, 8s timeout)     |
| `/api/admin/stats`   | GET    | Budget usage stats (requires `x-admin-secret` header) |

All return `{ success: boolean, data?: T, error?: string }` wrapper.

## Critical Files

**Public Mode Infrastructure:**

- `proxy.ts` - Rate limiting, CSP headers
- `lib/config.ts` - Centralized config (budgets, timeouts, limits)
- `lib/env.ts` - Zod env validation
- `lib/costGuard.ts` - Daily budget enforcement with degradation modes
- `lib/singleflight.ts` - Distributed request deduplication
- `lib/cache.ts` - Redis caching with versioned keys
- `lib/redis.ts` - Shared Redis client factory

**Grounded Etymology:**

- `lib/etymologyParser.ts` - Pre-parse etymological chains from source text
- `lib/etymologyEnricher.ts` - Post-process LLM output, assign confidence + evidence

**Core Pipeline:**

- `lib/research.ts` - Agentic research orchestrator (4-source parallel fetch)
- `lib/claude.ts` - LLM client (Anthropic SDK)
- `lib/prompts.ts` - System prompt for LLM synthesis

**Schema & Types:**

- `lib/schemas/llm-schema.ts` - JSON Schema for LLM structured outputs
- `lib/schemas/etymology.ts` - Zod schema for cache validation (must stay in sync with LLM schema manually)
- `lib/types.ts` - All TypeScript interfaces

**Data Sources:**

- `lib/etymonline.ts` - HTML scraper with fallback patterns
- `lib/wiktionary.ts` - MediaWiki API client
- `lib/wikipedia.ts` - Wikipedia REST API
- `lib/urbanDictionary.ts` - Urban Dictionary API with NSFW filtering
- `lib/elevenlabs.ts` - ElevenLabs TTS client

**Admin:**

- `app/api/admin/stats/route.ts` - Budget monitoring endpoint
- `.env.example` - Documents all env vars (ANTHROPIC_API_KEY, ADMIN_SECRET, Redis, ElevenLabs)
