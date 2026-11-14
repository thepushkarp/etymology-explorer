# EtymEx

EtymEx is a beautiful, interactive Etymology Explorer that helps you discover the origins and roots of words. Perfect for vocabulary enthusiasts who want to understand words deeply through their etymological roots.

Try it out at [etymex.com](https://etymex.com)

## Features

- **Public Mode**: No client-side API keys needed — uses a server-side LLM with rate limiting, caching, and budget controls
- **Grounded Etymology**: Source-backed confidence scoring (high/medium/low) for each ancestral stage
- **Automatic Language Discovery**: One spelling opens English, Italian, Spanish, French, Portuguese, Hindi, Urdu, Sanskrit, and Japanese histories together in language tabs; a manual language hint also finds specialist-only entries. Explanations are English, with translated examples in the word's own language
- **Native Scripts**: Search Hindi and Sanskrit in Devanagari, Urdu in Arabic script, and Japanese in kanji or kana, with source-backed transliterations and right-to-left Urdu text
- **Cross-language Links**: Open attested lineage forms and each history's source-listed spelling counterparts. Explicit Wiktionary romanizations offer links to native spellings while preserving entries for the original spelling; only clicking a link starts a new trace
- **Shared Spelling Entries**: Unambiguous Japanese dictionary redirects share one entry, cache, and canonical URL. Linked spellings retain misspelling labels; homophones and independent borrowed-word entries remain separate
- **Etymology Lookup**: Search any word to discover its linguistic origins, root morphemes, and historical evolution
- **Part of Speech Tags**: See grammatical categories (noun/verb/adjective) with alternate pronunciations for words like "record"
- **Memorable Lore**: Each word comes with a 4-6 sentence narrative that makes the etymology stick
- **Related Words**: Discover words that share the same roots
- **Word Suggestions**: Explore synonyms, antonyms, homophones, easily-confused words, and see-also links
- **Modern Usage**: Supplemental community usage gated by source significance from Incel Wiki extracts
- **Pronunciation Audio**: Listen to word pronunciations powered by ElevenLabs
- **Random Word**: Open a random word to expand your vocabulary
- **Recently Explored**: Four random selections from the latest 20 successful searches, filtered by primary language when a language is selected, with previews and curated fallback words
- **Specialist Dictionaries**: General and language-specific evidence for query words, components, variants, and ancestors
- **Structured Outputs**: Guaranteed valid JSON via OpenRouter `json_schema` strict mode
- **Streaming UI**: Optional `?stream=true` server-sent events for source progress,
  per-section synthesis events, cached hits, and early error responses
- **Durable Corpus**: Entries remain cached for a year and become eligible for a user-requested retrace after 90 days or a pipeline revision; failed languages remain visible and can be retried individually after a five-minute cooldown without retracing successful languages
- **Shareable Word Pages**: `/word/{word}` is the primary search URL — cached words are
  server-rendered straight from the cache (crawlers never trigger LLM spend), uncached words
  host the live streaming trace with progressive section-by-section rendering
- **Rate Limiting**: Per-IP protection via Upstash Redis with automatic budget enforcement

## Getting Started

### Prerequisites

- Node.js 18+
- For self-hosted deployment:
  - [OpenRouter](https://openrouter.ai/) API key (required)
  - [Upstash Redis](https://upstash.com/) (optional, for rate limiting and caching)
  - [ElevenLabs](https://elevenlabs.io/) (optional, for pronunciation audio)

### Installation

```bash
# Clone the repository
git clone https://github.com/thepushkarp/etymology-explorer.git
cd etymology-explorer

# Install dependencies
bun install

# Set up environment variables (see Environment Configuration section)
cp .env.example .env.local

# Start the development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Configuration

The app runs in **public mode** using a server-side OpenRouter API key and the
`openai/gpt-6-luna` model on OpenRouter's Responses API. All searches are
rate-limited and cost-budgeted with a monthly spend cap. Set the
`OPENROUTER_API_KEY` environment variable to enable it.

### Environment Configuration

For self-hosted deployments, create a `.env.local` file:

```bash
# Required for public mode
OPENROUTER_API_KEY=your_openrouter_key_here
ADMIN_SECRET=your_admin_secret_here

# Optional: Upstash Redis (rate limiting + caching)
KV_REST_API_URL=your_upstash_url_here
KV_REST_API_TOKEN=your_upstash_token_here

# Optional: Exa recovery and source discovery (separate $10 monthly allowance)
EXA_API_KEY=your_exa_key_here
EXA_ENABLED=true

# Optional: ElevenLabs (pronunciation audio)
ELEVENLABS_API_KEY=your_elevenlabs_key_here

# Optional: Feature flags
PUBLIC_SEARCH_ENABLED=true
PRONUNCIATION_ENABLED=true
FORCE_CACHE_ONLY=false
RATE_LIMIT_ENABLED=true
```

`ELEVENLABS_API_KEY` enables pronunciation and needs voice catalog access. The app selects a female default voice from the [official catalog](https://elevenlabs.io/docs/api-reference/voices/search) for each speech language: language-labelled voices first, then verified-language matches, then multilingual female voices. Ties follow the catalog's alphabetical name order. Some languages may share a voice when separate language-specific defaults are unavailable. A precise voice-access failure permits one attempt with the next ranked voice; authentication, quota, rate-limit, and general server errors do not trigger a voice retry.
Pronunciation requests pass the speech language’s ISO 639-1 `language_code` to `eleven_v4`. Sanskrit entries keep their lexical identity and offer a labelled Hindi reading of their Devanagari spelling, rather than a claim of classical Sanskrit pronunciation. Supported speech languages send the selected IPA reading using Eleven v4’s native IPA format. Browser audio URLs, Redis clips, and request locks distinguish spelling, language, and IPA; older word-only clips are not reused. Without usable IPA, Japanese uses a unique verified kana reading when available, otherwise the headword. The Sanskrit-to-Hindi fallback reads the spelling without supplying Sanskrit IPA. Voice quality and regional accent are not guaranteed by catalog metadata.

See `.env.example` for full documentation.

Exa requests reserve their tariff before dispatch against a separate $10 UTC-month
allowance in Redis. Missing credentials, unavailable accounting, or an exhausted
allowance disable Exa while ordinary sources continue. Use a dedicated Exa key
with a $10 provider-side budget as an additional limit; the provider's billing
period may differ from a calendar month. Each trace permits at most two searches,
eight Contents pages, and five Exa HTTP calls within the shared entry source
budget (32 attempts for one language, plus 16 per extra language, capped at 96, including language resolution). Retrieved text is attributed to its publisher, and ambiguous entry
boundaries cannot establish ancestry.

For local load testing, set `RATE_LIMIT_ENABLED=false` in `.env.local` and restart `bun dev`.

## Tech Stack

- **Framework**: [Next.js 16.1](https://nextjs.org/) with App Router
- **UI**: [React 19.2](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/)
- **LLM**: [OpenRouter Responses API](https://openrouter.ai/docs/api/api-reference/responses/create-responses)
  using `openai/gpt-6-luna` with structured outputs
- **Validation**: [Zod 4.x](https://zod.dev/) for schema validation
- **Caching/Rate Limiting**: [@upstash/redis](https://upstash.com/) + [@upstash/ratelimit](https://github.com/upstash/ratelimit)
- **Analytics**: [@vercel/analytics](https://vercel.com/analytics)
- **Data Sources**:
  - [Etymonline](https://www.etymonline.com/) - Historical etymology
  - [Wiktionary](https://en.wiktionary.org/) - Definitions and linguistic data
  - Native Italian, Spanish, French, Portuguese, Hindi, and Japanese Wiktionary editions - selected-language sections; English Wiktionary defines Hindi, Urdu, Sanskrit, and Japanese history boundaries
  - [Official JMdict XML](https://www.edrdg.org/edrdg/licence.html) - indexed Japanese lexical senses, restricted readings and original loan-source metadata, with EDRDG attribution retained
  - [Wikidata Lexemes](https://www.wikidata.org/wiki/Wikidata:Lexicographical_data/Documentation) - language-tagged lemmas, forms, senses, and lexical claims
  - [FreeDictionaryAPI](https://freedictionaryapi.com/) - senses, forms, and IPA after direct Wiktionary misses (not etymology)
  - [Dicionário Aberto](https://api.dicionario-aberto.net/index.html) - older Portuguese dictionary evidence
  - [Wikipedia](https://en.wikipedia.org/) - Encyclopedic context
  - [Incel Wiki](https://incels.wiki/) - Supplemental community slang context
  - American Heritage, Il Nuovo De Mauro, RAE/ASALE DLE and Americanismos, CNRTL's TLFi/Littré/Académie collections, Priberam, and Michaelis - language-specific dictionaries
  - Bosworth–Toller, Lewis & Short, and LSJ through Logeion - historical-language lexemes
  - [Exa](https://exa.ai/) - optional blocked-page recovery and targeted publisher discovery
- **Audio**: [ElevenLabs](https://elevenlabs.io/) - Text-to-speech pronunciation
- **Typography**: Libre Baskerville (display serif), Alegreya Sans (UI), Noto Serif Devanagari, and Noto Nastaliq Urdu, self-hosted regular-weight woff2 subsets; Japanese forms use system Mincho fonts without a webfont download

Hindi, Urdu, and Sanskrit rely on Wiktionary lexical evidence; Wikipedia supplies context and cannot establish ancestry. Optional Platts, Wisdom Library, and Cologne Monier-Williams adapters are not enabled: the [Platts digitization links restrictive reuse terms](https://dsal.uchicago.edu/dictionaries/platts/), [Wisdom Library's published site information](https://www.wisdomlib.org/m/about.html) does not establish a blanket glossary reuse license, and the [Cologne digital edition specifies noncommercial, share-alike terms](https://raw.githubusercontent.com/sanskrit-lexicon/csl-orig/master/v02/mw/mwheader.xml). Their availability alone does not establish suitability for public synthesis.

Japanese uses English Wiktionary as its history primary and native Japanese Wiktionary as independent context or fallback. Native Japanese numbered 語源 headings and labelled homographs retain separate histories; a nested etymology belongs only to its enclosing homograph. Affirmative native origin and shortening statements are extracted only inside etymology sections; uncertain accounts remain prose. JMdict supplies supplementary lexical evidence from the official English XML snapshot in `data/jmdict/`. Exact spelling/reading pairs must satisfy reading and sense restrictions together. Complete matched XML, original full/partial loan-source fields, wasei markers, POS inheritance, stable entry IDs and EDRDG attribution are retained. Local index reads consume no HTTP budget and bypass Redis source caching. Refresh JMdict at least monthly using `scripts/build-jmdict-index.py` with a reviewed download and SHA-256; snapshots older than 31 days report unavailable. NINJAL historical dictionaries supply exact-spelling, dated context only, never modern identity, standalone lexical admission, or ancestry. Their pinned transcriptions and headword rows are rebuilt with `scripts/build-japanese-historical-index.py`. Source licences and scope are documented in `docs/source-admission.md`. Kotobank, gogen and JapanKnowledge are not enabled without an appropriate reuse agreement.

Japanese lookup accepts kana, kanji, and rōmaji. Exact entries and explicit dictionary links precede server-side WanaKana conversion; all conversions require dictionary reading evidence. Candidates are ranked by source evidence and verified within the shared resolution budget, without a fixed candidate-count cutoff. Unique, complete romanization proofs share the Japanese canonical entry and lock; ambiguous readings remain choices. A conjugation opens a verified dictionary form with an explanation and never becomes an alternative spelling. Latin-language entries keep their own spelling and appear as links when Japanese resolution changes the headword. Lookup metadata is separate from generated etymology and accompanies both JSON and SSE responses. Existing saved entries stay readable until an explicit retrace.

The optional lookup proposal layer requires both `APP_CHANNEL=beta` and `LOOKUP_FALLBACK_ENABLED=true`. It runs only inside an explicitly requested trace after source-defined and deterministic lookup fails, for Japanese, Hindi, Urdu, or Sanskrit. One low-reasoning OpenRouter call has a 15-second timeout and a 768-token ceiling. A normalized input/language lock and a 60-second proposal cache deduplicate paid work; the lock is released before acquiring a canonical word lock. Every candidate relationship still requires dictionary evidence, and unverified output never establishes absence or etymology. Source failure, truncated candidate sets, and conflicting evidence prevent automatic resolution. Production remains disabled pending live fixed-sample accuracy, latency, and cost evaluation.

The ONCOJ provider queries a local index of pinned Old Japanese lexical annotations, rebuilt with `python3 scripts/build-oncoj-index.py`. It retains complete matched XML records, IDs, the upstream revision and checksum, and CC BY 4.0 annotation attribution. Exact Frellesvig–Whitman transcriptions are distinct; modern Japanese spellings or glosses cannot establish historical links. See [source admission and evaluation](docs/source-admission.md) for scope, source shortlists, and rollout checks. Exa recovery remains confined to admitted publisher domains and exact entry/language validation; ONCOJ uses its pinned dataset rather than web recovery.

Japanese word-origin labels require affirmative source evidence. Compounding and borrowing remain distinct: 電話 is a Japanese wasei-kango compound of 電 and 話, rather than a whole Middle Chinese borrowing. サラリーマン has disputed coinage accounts and source-attested Japanese サラリー and マン components; it does not imply English salary and man branches. コンセント is clipped from a longer Japanese coinage with explicit English concentric and plug components.

Random discovery uses frequency-selected Romance pools and small curated Hindi, Urdu, Sanskrit, and Japanese headword pools. Refresh the curated pools without downloads using `python scripts/build-discovery-word-pools.py --languages hi ur sa ja`; the generator preserves unselected pools. Google Books usage charts are unavailable for these four languages.

Japanese alternatives beside a result require source-linked destinations with saved matching histories; an ancestry graph is not required. Romanization, spelling identity and etymological ancestry remain separate relationships. Verified written-form destinations appear in the language tab row. The language tab opens the first listed target by default, with other meanings retained in lookup context. This default selection does not establish spelling equivalence or a unique dictionary match. Existing language entries keep their own tab. Unsupported-language discovery notices are not displayed. These presentation rules also apply to saved entries without retracing them.

Language navigation remains visible for single-language entries. Ambiguous kana and source-linked rōmaji lookups share a meaning selector built from saved Japanese counterparts. Selecting a meaning carries its lookup context and history in URL query parameters, so the server renders the selected context on reload and Back/Forward. Every language uses the same link-based navigation and first-listed-history default, including streamed results. Failed-language tabs remain visible in grouped lookups; a missing matching reading never falls back to another reading. Direct kanji searches show only that spelling's histories and readings. Group membership is navigation metadata, never spelling equivalence: each word retains its own cache, pronunciation, sources, and etymology. Word pages render at request time from tagged cached entries; server-readable selection does not trigger research. `/api/lookup-group` refreshes navigation using cached entries only, follows all source-linked counterparts and romanizations with four concurrent cache reads, and never initiates research. An explicit search can trace source-linked Japanese alternatives sequentially through the normal budget and lock controls; only saved matching meanings appear in navigation. Passive loads never start this research. Failed lookups retain loaded meanings and offer an explicit retry.

The meaning selector retains the same reading group when switching entries; it does not append the selected character's other readings. Direct entries and grouped lookups share grammatical labels, the selector grid and title spacing. Server redirects and client navigation use the same default-choice model. The header reserves room for pronunciation even when no pronunciation is available.

Affixes such as `pan-` and `-ness` are searchable entries distinct from their bare spellings. Autocomplete prioritizes matching affix headwords returned by the dictionary; it does not invent affixes. Sources follow the selected history’s research ownership and displayed forms, with form-based filtering for older saved entries. A bounded tab-local cache retains twenty completed lookup results so browser history can restore a pre-trace page without new research.

## Project Structure

```
etymology-explorer/
├── app/
│   ├── api/
│   │   ├── admin/stats/    # Budget/usage statistics (admin-only)
│   │   ├── changelog/      # Released versions from CHANGELOG.md (prerendered)
│   │   ├── etymology/      # Main etymology synthesis endpoint (GET)
│   │   ├── pronunciation/  # TTS audio endpoint (ElevenLabs)
│   │   ├── random-word/    # Random word selection
│   │   └── suggestions/    # Autocomplete + typo suggestions
│   ├── faq/                # FAQ page with structured data
│   ├── learn/              # Educational content pages
│   │   └── what-is-etymology/
│   ├── og/                 # Dynamic OG image generation (brand + per-word cards)
│   ├── word/[word]/        # Primary word pages: cached → SSR, uncached → live trace UI
│   ├── sitemap.ts          # Dynamic sitemap (static pages + cached /word/ entries)
│   ├── robots.ts           # Robots.txt configuration
│   ├── layout.tsx          # Root layout with fonts
│   └── page.tsx            # Static landing/search page
├── proxy.ts               # Rate limiting, CSP headers, legacy /?q= redirect
├── components/
│   ├── AncestryTree.tsx    # Lineage timeline
│   ├── EntryView.tsx       # Finished entry shell (language tabs, histories, usage, share)
│   ├── ErrorState.tsx      # Error display with retry
│   ├── EtymologyCard.tsx   # Entry layout, final and streaming (pending) states
│   ├── etymology-card/     # Entry sections
│   ├── FaqAccordion.tsx    # Accessible FAQ accordion
│   ├── Landing.tsx         # Landing page
│   ├── SearchBox.tsx       # Word search with suggestions
│   ├── VersionInfo.tsx     # Header version button and changelog dialog
│   ├── WordLink.tsx        # Link to a word page (marks trace intent)
│   └── WordTraceExperience.tsx # Live trace for uncached words
├── lib/
│   ├── research.ts         # Agentic multi-source research pipeline
│   ├── llm.ts              # OpenRouter-backed LLM synthesis with structured outputs
│   ├── etymologyParser.ts  # CPU-only source text parser
│   ├── etymologyEnricher.ts # Post-LLM confidence enricher
│   ├── etymonline.ts       # Etymonline HTML scraper
│   ├── wiktionary.ts       # Wiktionary MediaWiki API client
│   ├── wikipedia.ts        # Wikipedia REST API client
│   ├── incelsWiki.ts       # Incel Wiki MediaWiki API client (supplemental)
│   ├── elevenlabs.ts       # ElevenLabs TTS for pronunciation audio
│   ├── spellcheck.ts       # Typo detection and suggestions
│   ├── prompts.ts          # System prompts and schemas
│   ├── types.ts            # TypeScript interfaces
│   ├── config.ts           # Centralized configuration
│   ├── env.ts              # Environment variable validation
│   ├── costGuard.ts        # Budget enforcement
│   ├── singleflight.ts     # Request deduplication
│   ├── redis.ts            # Redis client factory
│   ├── cache.ts            # Caching layer
│   ├── errorUtils.ts       # Secret redaction
│   ├── fetchUtils.ts       # Timeout wrapper
│   ├── validation.ts       # Input validation
│   ├── wordlist.ts         # GRE word utilities
│   ├── hooks/              # React hooks (search, navigation, ngram, audio)
│   │   └── useStreamingEtymology.ts # SSE transport over the pure stream reducer
│   └── schemas/
│       ├── etymology.ts    # Zod schema for cache validation
│       └── llm-schema.ts   # Strict-mode JSON Schema for LLM structured outputs
│                           #   (mechanically sync-checked against the Zod schema)
├── data/
│   ├── faq.ts              # FAQ content with FaqItem interface
│   └── gre-words.json      # Vocabulary word list
├── CHANGELOG.md            # Version history shown in the changelog dialog
├── vercel.json             # Turns off Git deployments for main
└── .env.example            # Environment variable template
```

## API Endpoints

| Endpoint               | Method     | Description                                                                           | Auth Required     |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------- | ----------------- |
| `/api/etymology`       | GET        | Synthesize etymology (`?word=X`, optional `language` hint, `refresh=1`, and `stream`) | No (rate-limited) |
| `/api/pronunciation`   | GET        | Get pronunciation audio (`?word=X&language=it`)                                       | No                |
| `/api/suggestions`     | GET        | Get language-aware autocomplete suggestions                                           | No                |
| `/api/random-word`     | GET        | Get a random word                                                                     | No                |
| `/api/ngram`           | GET        | Get language-aware Google Books usage data (`?word=X`)                                | No                |
| `/api/health`          | GET        | Liveness check                                                                        | No                |
| `/api/admin/stats`     | GET        | Get budget/usage statistics and counters                                              | Admin secret      |
| `/api/recent-searches` | GET / POST | Sample recent searches or record a validated cached lookup                            | No (rate-limited) |

## How It Works

1. **Request Deduplication**: Singleflight owner-token locks (90s TTL, heartbeat-extended) ensure one pipeline run per word; waiters poll the cache for the holder's result, and streaming waiters can take over if the holder crashes
2. **Rate Limiting**: Per-IP rate limiting (20 req/min + 200 req/day) via Upstash Redis
3. **Cache Check**: One durable `entry:v1:{word}` contains every successful language. Schema validation runs on reads. Fresh entries are served immediately; stale entries remain readable until an explicit retrace. Incomplete entries remain durable and become retraceable after five minutes. Legacy entries remain discoverable and migrate during bounded corpus scans (up to 1,000 words) or on read. Negative misses are scoped to Auto or the explicit language hint. Without Redis, uncached searches return 503 (fail closed)
4. **Grounded Etymology Pipeline**:
   - **Parser** (CPU-only): Extracts "from X, from Y" chains from raw source text
   - **Agentic Research**: Multi-phase research pipeline (aborts mid-flight if the client disconnects):
     - Phase 1: Fetch Etymonline and Wiktionary alongside optional Wikipedia and Incel Wiki. FreeDictionaryAPI runs only when direct Wiktionary misses, providing definitions and pronunciation with an explicitly unresolved origin. Native and English Wiktionary editions define multilingual history boundaries; Wikidata supplies lexical identity. Source-cache hits avoid HTTP attempts.
     - Phase 2: Root morphemes extracted on-CPU from derivation formulas ("From X + Y", "equivalent to X + Y") and parsed-chain affixes (e.g., "telephone" → ["tele", "phone"]); a quick LLM call (15s timeout) runs only when the CPU pass finds nothing
     - Phase 3: One parallel wave fetches root pages (up to 4 roots, etymonline + wiktionary) and main-word related-term pages (etymonline only) within the shared entry fetch budget
   - **LLM Synthesis**: Each admitted language receives an independent parallel LLM call with scoped evidence and one structured output schema; successful languages are retained when siblings fail
   - **Enricher** (CPU): Post-processes LLM output, assigns confidence scores (high/medium/low) based on source evidence match
5. **Guaranteed JSON**: Using constrained decoding, the LLM produces valid JSON matching the exact schema
6. **Budget Enforcement**: Cost guard tracks monthly spend (OpenRouter-reported cost, with a conservative fallback-chain pricing ceiling when cost is omitted) against a $10/month cap and switches from normal to cache_only mode at 90% of budget; both the root-extraction and synthesis LLM calls are counted
7. **Rich Display**: Etymology rendered with expandable roots, ancestry graph with confidence badges, POS tags, modern usage, related words, and source attribution (supplemental sources are only surfaced when significance checks pass)

### LLM routing and fallbacks

Production synthesis and LLM root extraction use `openai/gpt-6-luna` through
OpenRouter's Responses API. Both paths explicitly set low reasoning and exclude
the reasoning trace from the response. Reasoning remains enabled internally but
is never returned to the browser.

OpenRouter tries these model fallbacks in order when Luna is unavailable,
rate-limited, or rejected by provider routing:

1. `openai/gpt-5.4-mini` — closest proven fallback; passed the project's 15-word strict-schema bakeoff.
2. `google/gemini-3.5-flash` — cross-provider redundancy; also passed the strict-schema bakeoff.

Explicit `--model` benchmark overrides do not inherit the production fallback
chain. `openai/gpt-5.6-terra` is a compatible future candidate, but remains
disabled until it completes the same etymology-quality and latency bakeoff.

### Architecture Diagram

```
┌──────────────────────────────┐
│         BROWSER UI           │
│ SearchBox / Entry / Trace     │
└──────────────┬───────────────┘
               │ GET /api/etymology?word=X[&stream=true]
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Middleware (Node) + Route Entry                                              │
│ proxy.ts: rate limit + CSP   →   app/api/etymology/route.ts: validate input  │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Control Plane                                                                │
│ cache hit? → return cached result                                            │
│ cost guard → normal | cache_only (at 90% of monthly budget)                 │
│ singleflight lock → dedupe concurrent lookups (Redis down → 503 uncached)   │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ cache miss
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Grounded Etymology Pipeline (client disconnect aborts in-flight work)        │
│ 1) Fetch direct sources; use a senses-only dictionary fallback on misses    │
│ 2) Parse "from X, from Y" chains once etymonline+wiktionary land (CPU-only)  │
│ 3) CPU root extraction from derivation formulas; LLM fallback if none found  │
│ 4) Shared bounded language research: 32 + 16 per extra language, capped at 96      │
│ 5) OpenRouter synthesis, json_schema strict (sections stream when stream=true)│
│ 6) Enrich ancestry graph + confidence/evidence                               │
│ 7) Merge successful languages into one durable WordEntry in Redis                                                     │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Response Paths                                                               │
│ stream=true   → SSE events: source_* → parsing_complete → synthesis_started │
│                    → synthesis_section (per top-level field, render order)  │
│                    → enrichment_done → result / error                        │
│ default       → JSON response with final EtymologyResult                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Run development server
bun dev

# Lint code
bun run lint

# Format code
bun run format

# Build for production
bun run build
```

## Deployment

Deploy easily on [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/thepushkarp/etymology-explorer)

**Important**: Set environment variables in your Vercel project settings (see Environment Configuration section above).

### Beta

Every push to `main` runs [Deploy Beta](.github/workflows/deploy-beta.yml), which fast-forwards the `beta` mirror branch to the latest `main` commit, builds a Vercel Preview deployment remotely, and assigns it to [beta.etymex.com](https://beta.etymex.com). Runs are serialized and superseded commits are skipped. The workflow can also be run manually from `main`.

The Preview deployment retains `main` source metadata and receives `APP_CHANNEL=beta` at build time. The workflow explicitly assigns the beta domain only after confirming the deployed commit is still current on `main`.

Keep `beta` as a deployment mirror: do not add commits directly to it. The workflow uses `GITHUB_TOKEN` with `contents: write` for the fast-forward and the same `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets as production for deployment. Configure the application's Preview environment variables in Vercel and connect `beta.etymex.com` to the `beta` Preview branch so production releases cannot claim it. Automatic Git deployments for `main` and `beta` are disabled in `vercel.json`; other branches retain their previews.

Builds with `APP_CHANNEL=beta` label the header version as beta and show nonempty `Unreleased` changelog groups first, without a release date or tag link. Default builds show released versions only.

### Releasing

Production at `etymex.com` deploys only when a GitHub release is published. Pull requests still get Vercel previews; merging to `main` updates beta.

Pre-1.0 versions use minor bumps for user-facing features and patch bumps for fixes.

1. In a pull request, move the entries under `## [Unreleased]` in `CHANGELOG.md` into a new `## [x.y.z] - YYYY-MM-DD` section, then run `bun pm version x.y.z --no-git-tag-version`.
2. Merge the pull request.
3. Publish a GitHub release from `main` with the tag `vx.y.z`, using the new changelog section as its notes:

   ```bash
   gh release create vx.y.z --target main --title vx.y.z --notes-file <notes-file>
   ```

The [Deploy Production](.github/workflows/deploy.yml) workflow then deploys that tag. It needs the `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repository secrets. Drafts and pre-releases do not deploy. To roll back, use Instant Rollback in the Vercel dashboard.

## License

Application code: MIT. Bundled source datasets retain their own licences: JMdict is CC BY-SA 4.0; the admitted NINJAL transcriptions/headword data and ONCOJ annotations are CC BY 4.0. See [source admission and attribution](docs/source-admission.md).

## Acknowledgments

- Etymology data from [Etymonline](https://www.etymonline.com/) and [Wiktionary](https://en.wiktionary.org/)
- Dictionary fallback from [FreeDictionaryAPI](https://freedictionaryapi.com/)
- Japanese lexical data from [JMdict by EDRDG](https://www.edrdg.org/), indexed from original XML, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Encyclopedic context from [Wikipedia](https://en.wikipedia.org/)
- Supplemental community slang context from [Incel Wiki](https://incels.wiki/)
- Pronunciation audio from [ElevenLabs](https://elevenlabs.io/)
- Powered by [OpenRouter](https://openrouter.ai/) `openai/gpt-6-luna`
- Rate limiting and caching by [Upstash](https://upstash.com/)
