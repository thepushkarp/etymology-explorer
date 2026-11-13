# AGENTS.md

This file provides guidance to AI Coding Agents when working with code in this repository.

## Project Overview

EtymEx is a Next.js Etymology Explorer web app that helps users discover word origins through an LLM-powered synthesis pipeline with grounded etymological evidence. The app runs in **public mode** by default (server-side API key) with rate limiting, cost budgets, caching, and distributed request deduplication.

Users search for a word or phrase in Auto mode, or supply an English, Italian, Spanish, French, Portuguese, Hindi, Urdu, Sanskrit, or Japanese hint. Hindi and Sanskrit use Devanagari; Urdu uses Arabic script and right-to-left text; Japanese uses kanji and kana. One durable spelling entry contains independent language histories, shown in tabs. The app:

1. Uses a shared lexeme lookup for query words, ancestors, components, variants, and related terms. General sources (Wiktionary, Wikipedia, and applicable lexical APIs) run alongside all applicable specialist dictionaries. Modern specialists include American Heritage, De Mauro, DLE/Americanismos, CNRTL's TLFi/Littré/Académie collections, Priberam, and Michaelis. Historical specialists include Bosworth–Toller, Lewis & Short, and LSJ. FreeDictionaryAPI supplies senses and pronunciation only when direct Wiktionary evidence is unavailable; it cannot establish ancestry.
2. Pre-parses source-local etymological chains and keeps independent lexical histories and evidence scopes.
3. Expands explicit source spelling variants/redirects, up to four useful independent phrase components, and up to four unique attested ancestors in their own language in a shared wave, followed by up to four linked variant discoveries. English also retains CPU-first root extraction (LLM fallback only when necessary) and related-page expansion.
4. Retains complete extracted source text and full Wikipedia article extracts in the synthesis bundle; there are no per-source character caps or prompt clipping.
5. Sends the enriched bundle to OpenRouter's Responses API using `openai/gpt-6-luna` with low reasoning effort and strict structured output. Every language shares one schema and one prompt builder, and every entry is written in English; only the usage examples are in the word's own language, each with an English translation (none for English words).
6. Matches ancestry stages to scoped evidence, assigns confidence, and prunes unsupported lineage claims. Component evidence cannot establish the whole phrase's origin.

The primary Wiktionary edition defines source-local history boundaries, with Etymonline as the English fallback and source-defined specialist entries as further fallbacks; complete secondary sources remain independent context without invented history alignment. Each history has its own selectable story and lineage, with compound branches kept within that history. Wikipedia and community context cannot establish ancestry. Components alone cannot admit a phrase.

Hindi, Urdu, and Sanskrit use English Wiktionary as their history primary; Hindi also queries its native edition. Optional Platts, Wisdom Library, and Cologne Monier-Williams adapters and provider IDs are omitted pending source admission. The [Platts digitization](https://dsal.uchicago.edu/dictionaries/platts/) links CC BY-NC-ND terms; [Wisdom Library's site information](https://www.wisdomlib.org/m/about.html) does not establish a blanket glossary reuse license; the [Cologne digital MW header](https://raw.githubusercontent.com/sanskrit-lexicon/csl-orig/master/v02/mw/mwheader.xml) specifies noncommercial, share-alike terms. Do not register these sources based solely on accessible lookup pages.

Japanese uses English Wiktionary as its history primary, with native Japanese Wiktionary as independent context. JMdict via Jisho supplies licensed supplementary lexical senses and raw loan-source material, with EDRDG and CC BY-SA 4.0 attribution retained in sources and display. An unspecified full/partial loan-source status cannot establish whole-word borrowing. A live Jisho request after a source-cache miss needs a global 40-second Redis pacing reservation; unavailable Redis or an occupied interval skips Jisho. Complete raw data uses the seven-day source cache. Review publisher terms, license, and response schema when changing the adapter. Kotobank and gogen adapters are omitted pending source admission.

Japanese strata (`wago`, `kango`, `gairaigo`, `wasei-eigo`, `wasei-kango`, `hybrid`) require affirmative scoped evidence. 電話 is Japanese wasei-kango compounding of 電 and 話, not whole-word Middle Chinese borrowing. Preserve the disputed coinage accounts of サラリーマン and its source-attested Japanese サラリー + マン components; do not invent English salary/man branches. コンセント clips a longer Japanese coinage with explicitly attested English concentric + plug components. Entry prose remains English.

Every application source HTTP attempt shares one entry budget: 32 attempts for the first language plus 16 for each extra resolved language, capped at 96. Language resolution is limited to the first 32 attempts and its attempts count toward the final ceiling. Primary fetches, fallback attempts, Wikidata detail requests, enrichment, and Exa API calls all count. Exa's internal crawling is outside that application counter. Source-cache hits consume no HTTP budget; LLM calls are separate from this source budget.

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

## Releases

Production deploys only from a published GitHub release; `vercel.json` disables Git deployments for
`main`, while PR branches keep their previews. `.github/workflows/deploy.yml` deploys a `released`
event after checking that the tagged commit is on `main` and the tag equals `v` + the `package.json`
version, using the `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repository secrets.

`.github/workflows/deploy-beta.yml` fast-forwards the `beta` mirror branch to the latest `main`
commit on each `main` push, using `GITHUB_TOKEN` with `contents: write`, then remotely builds a
Vercel Preview deployment with the production workflow's Vercel secrets, `main` branch metadata,
and `APP_CHANNEL=beta` at build time. The domain remains mapped to the `beta` Preview branch;
the workflow assigns it explicitly only after confirming the deployed SHA is still current on `main`.
Runs are serialized, skip superseded commits, and may be dispatched manually only from `main`. Keep
`beta` free of independent commits; the workflow never force-pushes. Connect `beta.etymex.com` to the
`beta` Preview branch so production releases cannot reassign it. `vercel.json` disables automatic
Git deployments for both `main` and `beta`; other branches retain their previews.

Record user-facing changes under `## [Unreleased]` in `CHANGELOG.md` as single-line, plain-text
bullets under a `###` group. `lib/changelog.ts` rejects anything else, which fails the build. To
release, follow the steps in the README's Releasing section. `lib/changelog.test.ts` fails if the
newest release in `CHANGELOG.md` differs from `package.json`.

The header shows `NEXT_PUBLIC_APP_VERSION`, inlined from `package.json` by `next.config.ts`.
`components/VersionInfo.tsx` fetches the prerendered `/api/changelog` only when its dialog opens,
which keeps changelog text out of every page. `lib/changelog.ts` must stay free of `node:fs`: it is
in the client graph through `SiteHeader`, and only the route reads the file.
`APP_CHANNEL=beta` at build time inlines a public beta channel, labels the header version as beta,
and includes nonempty Unreleased groups first in the dialog without a release date or tag link.
Default builds show released versions only.

## Architecture

### Data Flow

```
User Search → proxy.ts (rate limit, CSP headers)
    ↓
GET /api/etymology?word=X[&stream=true]   (maxDuration 300s)
    ├── Input validation (lib/validation.ts)
    ├── Durable WordEntry cache check (lib/cache.ts, 365d TTL; stale entries remain readable)
    ├── Cost guard check (lib/costGuard.ts, 2 modes: normal → cache_only at 90% of budget)
    ├── Singleflight lock (lib/singleflight.ts, owner-token lock; Redis down → 503 for uncached)
    ├── Language resolution (lib/entryLanguages.ts) and shared research session; request.signal aborts in-flight work:
    │   ├── Parallel primary fetches across resolved languages; raw source cache and request memo first
    │   ├── CPU parsing into independent histories and scoped evidence
    │   ├── Bounded variant/redirect and phrase-component enrichment for all supported languages
    │   ├── Attested ancestor lookup; English CPU-first roots + related-page expansion
    │   └── Full extracted source text retained; one shared entry HTTP attempt ceiling
    ├── Typo check (lib/spellcheck.ts, Levenshtein distance vs GRE wordlist)
    ├── Parallel per-language LLM synthesis (lib/llm.ts — one entrypoint for streaming and unary)
    │   ├── OpenRouter Responses json_schema STRICT mode (schema in lib/schemas/llm-schema.ts)
    │   ├── stream=true: synthesis_section SSE events; validated primary history projects entry fields before sibling histories finish
    │   └── Post-processing: null-stripping, enrichAncestryGraph() matches stages to evidence,
    │       assigns confidence, attachSources() writes real source attributions
    ├── Merge successful languages and cache one WordEntry in Redis
    └── Response: WordEntry containing grounded per-language EtymologyResult values
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
  - Source HTTP budget: min(96, 32 + 16 × (resolved languages − 1)) actual attempts including resolution, primary, fallback, and enrichment requests; no source-text clipping
  - Rate limits, singleflight settings, feature flags

- **`lib/env.ts`** - Zod-based env validation with lazy init (build-time safe). Validates OPENROUTER_API_KEY, ADMIN_SECRET, KV_REST_API_URL, KV_REST_API_TOKEN, Exa, and ElevenLabs config.

- **`lib/exa.ts` / `lib/exaBudget.ts`** - Optional publisher retrieval and targeted discovery with a separate $10 UTC-month allowance. Atomic preflight tariff reservations fail closed for Exa when Redis is unavailable. Unknown charges remain reserved; provider estimates do not authorize refunds. Each trace permits two searches, eight Contents pages, and five API calls; full text is validated against exact publisher identity and entry boundaries. Exa is a retrieval method, never an independent evidence family. A dedicated key should also carry a $10 provider-side billing-period budget.

- **`lib/recentSearches.ts`** - One atomic list of the latest 20 distinct successful searches, each labelled with its primary language. GET `/api/recent-searches` samples four; POST records only server-validated cached results and their previews. Explicit navigation and completed traces record searches; prefetching and passive loads do not. The static homepage fills gaps from curated words.

- **`data/discovery-words.json`** - Frequency-selected Romance pools and curated Hindi, Urdu, Sanskrit, and Japanese headwords. `scripts/build-discovery-word-pools.py --languages hi ur sa ja` refreshes the curated pools without downloads and preserves other pools; the Romance frequency and Latin-letter filters are not applied to these scripts.

- **`lib/costGuard.ts`** - Monthly USD budget enforcement via pipelined Redis INCRBYFLOAT + EXPIRE NX:
  - Normal mode (0-90% of budget): allow uncached requests
  - Cache-only mode (≥90%): serve cached results only, reject uncached requests
  - Spend recording is awaited before responses finish; both the root-extraction and synthesis LLM calls are counted
  - Prefers OpenRouter provider-reported cost (`usage.cost`) with config-pricing math as fallback
  - The guard itself fails open without Redis, but uncached etymology requests fail closed (503) at the singleflight step

- **`lib/singleflight.ts`** - Distributed request deduplication via Redis owner-token locks (SET NX with random token, 90s TTL, EXPIRE heartbeat every 30s while the pipeline runs). Results are cached BEFORE lock release. Streaming waiters poll the cache every 2s for up to 150s with SSE keepalive events and negative-cache checks; non-streaming waiters poll ~10s then return 429 + Retry-After. A holder that errors writes a short-TTL failure marker (60s) before releasing, so waiters surface the error; promotion to holder only happens on a true crash — lock vanished with neither a result nor a marker. If 10 users search "etymology" simultaneously, only 1 LLM call is made.

- **`lib/cache.ts`** - Redis caching (via the shared `getRedis()` factory):
  - Merged spelling entries: `entry:v1:{word}`, 365-day physical TTL. `pipelineRevision` and `entryFreshDays` (90) determine staleness using the oldest retained `freshnessAt` (or original `tracedAt`); incomplete traces become stale after five minutes. Stale entries remain readable and require an explicit Retrace click. Successful retrace languages merge with durable previous results. `attemptedLanguages` records completed coverage so an unattempted manual hint can augment a fresh entry under the same word lock.
  - TTS audio: 1 year TTL
  - Negative cache: 30-minute TTL for admitted types (`no_sources`, `invalid_word`), under `neg:v8:{word}` with a distinct explicit-hint scope. Source-attested romanization offers survive no-result responses. Transient resolution failures and retraces with a durable entry never write absence markers.
  - Zod validation on reads only (writes are pre-validated by `finalizeResult` in lib/llm.ts)

- **`lib/sourceCache.ts`** - 7-day Redis cache for complete dictionary and Wikipedia source data (`src:v15:<source>:<word>` for English, `src:v15:<source>:<language>:<word>` otherwise). Historical Wiktionary selections use `src:v15:wiktionaryLanguage:<encoded heading>:<word>`, shared across query languages. Specialist bundles use `src:v15:bundle:<provider>:<lexical language>:<word>`. Incomplete results are not cached. Redis failures fall back to live retrieval; complete source text and provenance are preserved.

- **`lib/redis.ts`** - Shared Redis client factory using KV_REST_API_URL and KV_REST_API_TOKEN (returns null if not configured). Most callers fail open; uncached etymology fails closed with 503 and Exa requires functioning accounting (suggestions, random-word, and pronunciation keep working without Redis)

- **`app/api/pronunciation/route.ts`** - Complete MP3 playback responses precede audio-cache persistence.
  On a cache miss, the cost check and owner-token lock acquisition run in parallel. `after()`
  persists the complete clip before releasing the lock, keeping cleanup alive on serverless
  runtimes. Concurrent listeners poll at `audioWaiterPollIntervalMs` (250 ms); cached clips
  remain available under budget pressure and retain the one-year HTTP cache lifetime.
  The `eleven_v4` model receives the speech language code; Sanskrit retains `sa` lexical/cache/lock identity but uses `hi` speech, labelled as a Hindi reading. Female default voices come from the [official catalog](https://elevenlabs.io/docs/api-reference/voices/search), ranked by speech-language label, verified language support, then multilingual capability; ties follow alphabetical name order. A precise voice-specific provider error permits one attempt with the next ranked voice. The API key needs catalog access. Auth, quota, rate-limit, and general server failures never trigger that retry. Primary and fallback synthesis each have a 15-second timeout, plus a five-second catalog lookup, within the route’s 60-second duration. Hindi, Urdu, Sanskrit, and Japanese have no ngram corpus.

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

`lib/orthography.ts` supplies the shared identity for navigation, cache keys, evidence, and API inputs: NFC lowercase, with Unicode horizontal space separators trimmed and collapsed to one ASCII space. Accents and apostrophe/hyphen forms remain lexical information; spaced and hyphenated phrases are distinct. Controls and line separators are preserved through normalization and rejected by `lib/validation.ts`, including at input boundaries. Canonical words/phrases may contain up to 120 characters. A single boundary hyphen also permits affix entries such as pan- or -ness; these remain distinct from bare spellings. `SearchBox` validates before navigation and presents inline feedback for invalid input.

### Word Pages (primary search URL)

`/word/{word}` is the canonical, crawlable page for every word AND the primary in-app search
URL. Crawler traffic must never cost LLM money:

- **`app/word/[...segments]/page.tsx`** - SSR strictly from `getCachedEntry` (`lib/cache.ts`).
  The module graph must never include `lib/research.ts`, `lib/llm.ts`, or
  `lib/openrouterResponses.ts` — enforced by `app/word/import-graph.test.ts`. Request-time rendering resolves validated `lookup` and `history` query parameters;
  tagged `unstable_cache` reads retain the word data cache. Cache hit renders `EntryView`; cache miss renders a noindex page
  hosting `WordTraceExperience` (client), which streams the live trace via `/api/etymology`.
- **Auto-trace gating** (`lib/traceIntent.ts`): an uncached word page auto-starts its trace
  ONLY when a short-lived sessionStorage flag written by the in-app navigation handler
  (`lib/hooks/useWordNavigation.ts`) is present. Direct loads and crawlers — even JS-executing
  ones — get the "Trace it live" button instead; a human click is required to spend budget.
  Auto-start uses a cancellable deferred task before consuming the flag, so React Strict Mode
  effect replay cannot close the only stream and leave the page loading. A bounded tab-local
  completed-result store restores the latest twenty request-scoped results when browser history
  restores a pre-trace payload; restoration grants no trace intent and makes no research requests.
- **Revalidation**: after storing a merged entry, `cacheEntry` (`lib/cache.ts`) schedules
  `revalidateTag('etymology-word:{word}', { expire: 0 })` inside `after()` — the deferral is
  required because streaming responses flush pending revalidations when the handler returns,
  and `{ expire: 0 }` hard-expires the tag (the `'max'` profile would only mark it
  stale-while-revalidate). A freshly traced word's page serves content on the next load
  instead of a cached miss payload.
- **`lib/tracedWords.ts`** - SCANs durable entry keys and supported legacy prefixes during migration (cursor-paginated, capped at 1000; legacy discoveries migrate with four concurrent cache-only reads,
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

Attested lineage forms link from their details panel when their language is supported. Source-only
`counterparts` belong to each history and follow history selection. Explicit Wiktionary romanization
sections supply `WordEntry.otherScripts` offers, including one bounded explicit written-form redirect;
they remain links alongside independent entries for the original spelling and in no-result responses.
Only clicking a link marks trace intent. Foreign spellings are never guessed from a gloss or a Latin
spelling alone.

Japanese offers beside existing results require a Japanese entry or a Japanese ancestry stage
in any retained history. A romanization match alone is not promoted there. Explicit Japanese
lookup and unresolved-input choices keep verified alternatives; saved entries need no retrace
for this presentation filter. `EntryNavigation` includes verified written-form destinations: the first listed target opens by default, with other meanings retained in lookup context. A default display choice never establishes a unique match or authorizes an alias. Existing language tabs take precedence over cross-spelling offers. Unsupported-language discovery notices are not displayed. Homepage and header searches share the themed `LanguageSelect`.

Language rows remain visible for single-language entries. `lib/lookupGroupCache.ts` builds navigation
groups from saved kana counterparts and explicit romanization offers, reading at most four counterpart
targets and two romanizations. It performs no research or alias writes. Direct kanji searches stay
focused; links chosen within a broader lookup carry `lookup` and `history` query parameters.
`lib/entryNavigation.ts` supplies one language/meaning model to `EntryNavigation` for saved and live
entries. All choices are real links; arrow keys and Home/End move focus, and Enter follows a link.
Same-word selection uses the native History API to retain active streams while updating the URL.
Each language defaults to its first listed meaning. Missing or invalid grouped histories remain
unavailable rather than falling back to another reading. Successful and failed language tabs are
retained together. Unresolved kana index histories with multiple counterparts and no ancestry are
represented by their destinations. Grouped navigation retains only the requested reading; other
readings belong to a direct kanji search. `EntryChoices` supplies shared geometry and headers reserve
a pronunciation row. Server rendering supplies cache-only lookup context before hydration;
`/api/lookup-group` refreshes that metadata only after completed traces. Both module graphs must
exclude research and LLM modules. Passive loads, prefetching, and browser-history restoration never
authorize a trace.

Japanese spelling identity requires a complete source-language section with one explicit redirect
and a verified terminal entry. Shared readings, alternative-spelling lists, and romanizations alone
cannot establish equivalence. `lib/entryIdentity.ts` follows bounded source redirects before taking
the canonical word lock, sharing the trace's HTTP budget. The canonical `WordEntry` retains verified
`spellings`; its per-language results still match `WordEntry.word`. Language-qualified alias pointers
are published only after canonical persistence and expire with their source proof. The request proxy
checks known aliases for word-page GET/HEAD requests and sends uncached temporary redirects without
fetching sources. Word pages retain cache-only data access during request-time rendering.
Latin borrowing entries retain their own language histories. A unique verified standard
kana reading supplies fallback audio for a single-history Japanese entry without usable IPA; misspellings never select audio. Supported speech languages send the selected IPA to Eleven v4. Audio URLs, v4 cache keys, and locks include language, spelling, and IPA. Sanskrit retains its labelled Hindi spelling reading.
Existing entries without alias proof retain their saved contents until an explicit retrace establishes
the relationship; pipeline revision changes make that retrace available without automatic LLM spend.

`lib/lookupResolution.ts` verifies rōmaji readings and grammatical forms before the canonical lock.
WanaKana supplies candidate kana, never evidence. Up to four dictionary candidates share the
resolution HTTP budget; incomplete, conflicting, or ambiguous results remain choices. Unique
verified rōmaji uses a language-qualified `romanization` proof with reading evidence. Conjugations
open dictionary forms with separate JSON/SSE lookup metadata and never become spelling aliases.
An independently defined exact entry retains its own histories even when another sense is a
grammatical form; verified form targets remain optional destinations. Conjugation tables split
explicit line-separated alternatives and exclude numeric footnote annotations while preserving
spaces within phrases. Dictionary-linked destinations deferred by the four-candidate limit travel
separately as `lookupResolution.sourceListed` in JSON and SSE. They are labelled unchecked links,
never canonical identities, alias proofs, or durable entry offers; only explicit navigation may
start their lookup. Truncation always prevents automatic selection.
The optional `lib/lookupFallback.ts` proposal call requires `APP_CHANNEL=beta` and
`LOOKUP_FALLBACK_ENABLED=true`, with one 15-second, 768-token call, existing spend accounting,
and a normalized input/language lock released before the canonical word lock. Production stays
disabled pending live evaluation. No lookup proposals run from autocomplete or cache-only pages.

ONCOJ is an Old Japanese historical provider backed by pinned lexical annotation XML. Rebuild
`data/oncoj-index.json` with `python3 scripts/build-oncoj-index.py`. Retain complete matched
records, source IDs, annotation attribution, and exact Frellesvig–Whitman transcription. Explicit
derivation references must match indexed IDs and forms. Never infer modern Japanese ancestry
from similar spellings or glosses. Publisher admission findings are in `docs/source-admission.md`;
pending publishers are not registered for runtime lookup or Exa discovery.

### Research Pipeline Limits

Configured in `lib/config.ts` (consumed by `lib/research.ts`) to control API costs:

- `maxRootsToExplore = 4` - Max unique attested ancestors/root morphemes per expansion; repeated ancestors retain all parent-history attachments while sharing source lookups.
- `maxRelatedWordsPerRoot = 4` - Related terms retained per extraction pass; only main-word related terms are fetched through the shared lookup, after primary and scoped enrichment.
- `maxTotalFetches = 32`, `maxFetchesPerExtraLanguage = 16`, `maxEntryFetches = 96` - One hard cap of min(96, 32 + 16 × (resolved languages − 1)) on actual source HTTP attempts per merged trace, enforced by `lib/sourceFetchBudget.ts` through `lib/fetchUtils.ts`. The same budget object is tightened after resolution, retaining its consumed attempts. Primary requests, fallbacks, detail requests, and enrichment share the ceiling; source-cache hits and LLM calls do not consume it.
- Attested ancestor and English root lookups retry a transient Wiktionary HTTP/network failure once within the shared budget; 404, 429, and caller cancellation are not retried.
- Source text is sanitized for prompt embedding and retained in full. Context overflow returns an explicit error instead of silently truncating evidence.
- `sourceCacheTTL = 7d` - Raw dictionary and Wikipedia source cache

The merged route finishes every language's primary sources before enrichment begins. English's
root-extraction fallback overlaps source-defined scoped lexeme expansion; root and related-page
research waits for both, preserving complete source text and HTTP budget priority.

### LLM Integration

Both LLM calls (root extraction and synthesis) use **OpenRouter Responses `json_schema` strict
mode** (`text.format = { type: 'json_schema', strict: true, ... }`) with
`provider: { require_parameters: true }`, so requests only route to hosts that honor the schema
and the output is guaranteed-shape JSON.

**Schema split** (critical for maintainers):

- `lib/schemas/llm-schema.ts` - Strict-mode JSON Schema sent to the LLM. Every property is
  required, `additionalProperties: false` everywhere, optionality expressed as null unions, and
  top-level properties declared in **render order** (language → sources) — strict mode emits keys
  in schema order, which the section scanner and progressive rendering depend on. One schema
  serves every language: `language` and `word` identify the entry, then the source-defined
  `histories`, then the primary history's projection and the entry-wide fields. Entries can
  render the primary history's projection after the server validates its identity and scoped
  ancestry, while shared fields continue streaming.
- `lib/schemas/etymology.ts` - The single Zod result schema for cache validation and
  finalization. Uses `.passthrough()` for forward compat; requires `language`, `primaryHistoryId`
  and at least one history, so entries cached in an older shape (including paired
  `{ en, local }` prose) fail validation and read as a cache miss.
- **Usage examples**: every entry and every history carries exactly two contrasting `examples`
  (strict `minItems`/`maxItems` 2), rendered after the story. Each is `{ text, translation }`:
  `text` is a sentence in the word's own language and `translation` its English gloss, null for
  English words; Zod rejects a translation on an English example and a missing one elsewhere.
  Zod keeps the field optional so entries cached before it existed stay valid and simply omit
  the section.
- **Sync is enforced mechanically**: `lib/schemas/llm-schema.test.ts` walks both schemas and fails
  on drift (key sets, required lists, null unions, leaf types). Post-processing fields
  (confidence, evidence, isReconstructed, source url/word) are exempted explicitly in that test.

**Synthesis flow** (`lib/llm.ts`, single `synthesizeFromResearch` entrypoint):

1. Prompt: complete sanitized source data + pre-parsed chains and independent component/variant scopes (research pipeline) + system prompt
   from `lib/prompts.ts` (content/grounding rules only — shape is enforced by the schema)
2. Transport: passing an `onSection` callback streams the response. The scanner reports closed
   top-level fields and complete history objects. A primary history can project entry fields
   after the normal identity and scoped-evidence checks; complete history metadata
   waits for the full collection to validate. Entry fields publish once. Omitting the callback
   makes a unary call.
3. Parse: `parseGeneratedJson` fallback parse, then `stripNullsDeep` converts strict-mode nulls
   back to absent fields before sanitizers and Zod validation
4. Retry: synthesis shares a two-call limit across malformed output, validation failures, and
   retryable transport failures. Recovery uses a unary call; validation feedback identifies the
   correction needed. Caller cancellation and permanent provider errors do not retry, and reported
   usage from both attempts is recorded. Rate limits defer to the manual retry cooldown. An empty
   lineage is rejected only when the same history has
   direct, source-backed ancestry; unaligned secondary accounts cannot supply that requirement.

Failed languages are stored separately from successful entry languages, keeping their tabs and
safe error messages visible after reload. A five-minute cooldown gates explicit, language-scoped
retries under the existing word lock. Successful siblings remain available; neither cached page
loads nor cooldown timers initiate research. `researchIncomplete` tracks source uncertainty
separately, so recovering the last failed language clears failure-only incompleteness without
claiming that partial source research is complete.

### State Management

**Server-side** (Redis):

- Durable merged spelling entries (365d TTL, independent freshness metadata)
- TTS audio cache (1yr TTL)
- Rate limit counters (per-IP, sliding windows)
- Monthly spend counters (atomic accumulation) + operational counters (cache_hit/miss/error)
- Singleflight owner-token locks (90s TTL, heartbeat-extended while work runs)
- Negative cache for admitted invalid/no-source words (30m TTL)

**Client-side** (localStorage):

- Theme preference (`theme-preference`; applied pre-paint by the inline script in `app/layout.tsx`)
- (No API keys in public mode - server-side OPENROUTER_API_KEY used)

**Key hooks**:

- `lib/hooks/useStreamingEtymology.ts` - SSE transport for one merged spelling trace with an optional language hint; all progress
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
- **Tailwind CSS v4**: Seven color tokens (`paper`, `ink`, `muted`, `faint`, `rule`, `wash`, `accent`) plus lineage-only language-family tokens (`lang-pie`, `lang-greek`, `lang-latin`, `lang-romance`, `lang-germanic`, `lang-semitic`, `lang-indo-iranian`, `lang-japonic`, `lang-sinitic`, `lang-other`) in `globals.css`, redefined under `.dark`

## Design Philosophy

The UI is a quiet, typeset dictionary page: the words carry it, the chrome gets out of the way.

### Core Principles

- **Typography-first**: Libre Baskerville (regular + italic) for words and prose, Alegreya Sans (regular) for small UI text, and regular Noto Serif Devanagari and Noto Nastaliq Urdu for their scripts. Japanese forms use system Mincho fonts (`Hiragino Mincho ProN`, `Yu Mincho`, `Noto Serif CJK JP`) without a webfont. Urdu text has room for Nastaliq's taller line height. Foreign forms carry language and direction metadata; source-attested transliterations accompany headwords and ancestry forms. Hierarchy comes from size, italics, and the small-caps `label` utility — no bold weights (they are not loaded).
- **One reading column**: `max-w-3xl`, generous vertical rhythm, hairline `rule` borders. No cards, gradients, shadows, or pills.
- **Restrained color**: paper, ink, and a single oxblood `accent` used for emphasis and the live marker. The one exception is the lineage tree, which marks each node's language family with a `lang-*` token (top edge + legend). Use tokens, never raw hex or Tailwind palette colors.
- **Purposeful motion**: one CSS `animate-rise` reveal (staggered via `animation-delay`), color transitions on hover, skeleton pulses while streaming. Honor reduced motion.
- **Real links**: words link to word pages with `<WordLink>`; native `<details>` for disclosure.

### Anti-patterns to Avoid

- Rounded cards with drop shadows, gradient backgrounds, colored chip rainbows
- Section nav chips, modals, and sidebars for secondary features (the header's changelog dialog is the one exception)
- Faux-bold text (`font-semibold`/`font-bold`) — only 400 weights are loaded

### Guiding Question

When adding UI: _"Would this feel at home in a beautifully typeset etymology dictionary?"_

## API Endpoints

| Endpoint             | Method | Purpose                                                                           |
| -------------------- | ------ | --------------------------------------------------------------------------------- |
| `/api/etymology`     | GET    | Main synthesis - `?word=X`; optional `?stream=true` for SSE (server-side API key) |
| `/api/suggestions`   | GET    | Autocomplete + typo suggestions - `?q=word`                                       |
| `/api/random-word`   | GET    | Random GRE word (crypto randomness)                                               |
| `/api/pronunciation` | GET    | TTS audio - `?word=word` (ElevenLabs, bounded voice fallback)                     |
| `/api/ngram`         | GET    | Google Books ngram usage data - `?word=word`                                      |
| `/api/health`        | GET    | Liveness check                                                                    |
| `/api/changelog`     | GET    | Changelog from `CHANGELOG.md`; beta includes Unreleased (prerendered)             |
| `/api/admin/stats`   | GET    | Budget + counter stats (requires `x-admin-secret` header)                         |

All return `{ success: boolean, data?: T, error?: string }` wrapper.

## Critical Files

**Public Mode Infrastructure:**

- `proxy.ts` - Rate limiting, CSP headers
- `lib/config.ts` - Centralized config (budgets, timeouts, limits)
- `lib/env.ts` - Zod env validation
- `lib/costGuard.ts` - Monthly spend enforcement (normal → cache_only at 90%)
- `lib/singleflight.ts` - Distributed request deduplication (owner-token locks)
- `lib/cache.ts` - Durable merged entries, freshness checks, and legacy entry migration
- `lib/sourceCache.ts` - 7-day Redis cache for raw etymonline/wiktionary pages
- `lib/redis.ts` - Shared Redis client factory
- `lib/counters.ts` - Monthly cache_hit/cache_miss/error counters for admin stats

**Grounded Etymology:**

- `lib/etymologyParser.ts` - Pre-parse etymological chains from source text
- `lib/etymologyEnricher.ts` - Post-process LLM output, assign confidence + evidence

**Core Pipeline:**

- `lib/entryLanguages.ts` - Script-filtered language resolution with reusable Wiktionary pages
- `lib/research.ts` - Shared-budget language-aware primary fetching and bounded scoped variant/component/ancestor enrichment
- `lib/lexemeResearch.ts` - Request-scoped shared lookup, provider scheduling, cache reuse, source outcomes, and Exa recovery/discovery
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
- `lib/multilingualSources.ts` - Selected-language dictionary sources and the senses-only FreeDictionaryAPI fallback where enabled in the language registry
- `lib/wikipedia.ts` - Selected-language MediaWiki API full-article extracts with exact-title/redirect validation and revision provenance
- `lib/incelsWiki.ts` - Incel Wiki MediaWiki API client (supplemental context)
- `lib/specialistSources.ts` - Modern dictionary adapters retaining exact homographs and publisher families
- `lib/historicalSources.ts` - Old English, Latin, and Ancient Greek dictionary adapters
- `lib/elevenlabs.ts` - ElevenLabs TTS client

**Word Pages (primary search URL):**

- `app/word/[...segments]/page.tsx` - Cache-only SSR word pages (import graph must exclude research/LLM)
- `app/word/import-graph.test.ts` - Enforces the no-LLM-in-module-graph budget invariant
- `components/EntryNavigation.tsx` - Shared URL-based language and meaning links for saved and live entries
- `components/EntryView.tsx` - Client shell for a finished merged entry (cached page or completed trace)
- `lib/resultHistories.ts` - Projects a result onto one of its histories and lists the history choices
- `components/WordTraceExperience.tsx` - Live streaming trace UI for uncached word pages
- `components/EtymologyCard.tsx` - Entry layout; `pending` renders skeletons until each synthesis_section lands
- `components/AncestryTree.tsx` - Lineage tree: CSS-laid-out nodes, edges measured from the DOM into an SVG overlay, draggable nodes (mouse drag; touch press-and-hold), one shared details panel
- `lib/streamReducer.ts` - Pure reducer folding resolution events and per-language SSE events into independent progress slices
- `lib/traceIntent.ts` - sessionStorage in-app-navigation flag gating auto-trace (crawler cost invariant)

**Releases:**

- `CHANGELOG.md` - Version history; source for the site's changelog dialog
- `lib/changelog.ts` - Changelog parser and GitHub release links
- `components/VersionInfo.tsx` - Header version button and changelog dialog
- `vercel.json` - Disables Git deployments for `main`
- `.github/workflows/deploy.yml` - Production deploy on a published GitHub release

**Admin:**

- `app/api/admin/stats/route.ts` - Budget monitoring endpoint
- `.env.example` - Documents all env vars (OPENROUTER_API_KEY, ADMIN_SECRET, Redis, ElevenLabs)

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
