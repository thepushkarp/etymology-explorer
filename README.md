# EtymEx

EtymEx is a beautiful, interactive Etymology Explorer that helps you discover the origins and roots of words. Perfect for vocabulary enthusiasts who want to understand words deeply through their etymological roots.

Try it out at [etymex.com](https://etymex.com)

## Features

- **Public Mode**: No client-side API keys needed — uses a server-side LLM with rate limiting, caching, and budget controls
- **Grounded Etymology**: Source-backed confidence scoring (high/medium/low) for each ancestral stage
- **Etymology Lookup**: Search any word to discover its linguistic origins, root morphemes, and historical evolution
- **Part of Speech Tags**: See grammatical categories (noun/verb/adjective) with alternate pronunciations for words like "record"
- **Memorable Lore**: Each word comes with a 4-6 sentence narrative that makes the etymology stick
- **Related Words**: Discover words that share the same roots
- **Word Suggestions**: Explore synonyms, antonyms, homophones, easily-confused words, and see-also links with color-coded clickable chips
- **Modern Usage**: Slang context gated by source significance from Urban Dictionary and supplemental Incel Wiki extracts
- **Pronunciation Audio**: Listen to word pronunciations powered by ElevenLabs
- **Search History**: Track your vocabulary exploration with a persistent sidebar
- **Surprise Me**: Discover random words to expand your vocabulary
- **Structured Outputs**: Guaranteed valid JSON via OpenRouter `json_schema` strict mode
- **Streaming UI**: Optional `?stream=true` server-sent events for source progress,
  per-section synthesis events, cached hits, and early error responses
- **Smart Caching**: Redis-backed caching reduces costs and improves speed (30d etymology, 1yr audio)
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
`openai/gpt-5.4-mini` model on OpenRouter's Responses API. All searches are
rate-limited and cost-budgeted with a monthly spend cap. Set the
`OPENROUTER_API_KEY` environment variable to enable it.

### Environment Configuration

For self-hosted deployments, create a `.env.local` file:

```bash
# Required for public mode
OPENROUTER_API_KEY=your_openrouter_key_here
ADMIN_SECRET=your_admin_secret_here

# Optional: Upstash Redis (rate limiting + caching)
ETYMOLOGY_KV_REST_API_URL=your_upstash_url_here
ETYMOLOGY_KV_REST_API_TOKEN=your_upstash_token_here

# Optional: ElevenLabs (pronunciation audio)
ELEVENLABS_API_KEY=your_elevenlabs_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here

# Optional: Feature flags
PUBLIC_SEARCH_ENABLED=true
PRONUNCIATION_ENABLED=true
FORCE_CACHE_ONLY=false
RATE_LIMIT_ENABLED=true
```

`ELEVENLABS_VOICE_ID` must be a voice available to your account in `My Voices`.
Free-tier accounts cannot use Voice Library/community voices through the API.

See `.env.example` for full documentation.

For local load testing, set `RATE_LIMIT_ENABLED=false` in `.env.local` and restart `bun dev`.

## Tech Stack

- **Framework**: [Next.js 16.1](https://nextjs.org/) with App Router
- **UI**: [React 19.2](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/)
- **LLM**: [OpenRouter Responses API](https://openrouter.ai/docs/api/api-reference/responses/create-responses)
  using `openai/gpt-5.4-mini` with structured outputs
- **Validation**: [Zod 4.x](https://zod.dev/) for schema validation
- **Caching/Rate Limiting**: [@upstash/redis](https://upstash.com/) + [@upstash/ratelimit](https://github.com/upstash/ratelimit)
- **Analytics**: [@vercel/analytics](https://vercel.com/analytics)
- **Data Sources**:
  - [Etymonline](https://www.etymonline.com/) - Historical etymology
  - [Wiktionary](https://en.wiktionary.org/) - Definitions and linguistic data
  - [Free Dictionary API](https://dictionaryapi.dev/) - Definitions, pronunciation hints, and origin data
  - [Wikipedia](https://en.wikipedia.org/) - Encyclopedic context
  - [Urban Dictionary](https://www.urbandictionary.com/) - Modern slang (quality-filtered)
  - [Incel Wiki](https://incels.wiki/) - Supplemental community slang context
- **Audio**: [ElevenLabs](https://elevenlabs.io/) - Text-to-speech pronunciation
- **Typography**: Libre Baskerville (display serif) + Alegreya Sans (body), self-hosted woff2 subsets

## Project Structure

```
etymology-explorer/
├── app/
│   ├── api/
│   │   ├── admin/stats/    # Budget/usage statistics (admin-only)
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
│   └── page.tsx            # Landing/search page (/?q= redirects to /word/{word})
├── proxy.ts               # Rate limiting + CSP headers
├── components/
│   ├── AncestryTree.tsx    # Visual etymology graph
│   ├── ErrorState.tsx      # Error display with retry
│   ├── EtymologyCard.tsx   # Main result display
│   ├── FaqAccordion.tsx    # Accessible FAQ accordion
│   ├── FaqSchema.tsx       # FAQPage JSON-LD schema
│   ├── HistorySidebar.tsx  # Search history panel
│   ├── JsonLd.tsx          # WebApplication schema
│   ├── PronunciationButton.tsx # Audio playback
│   ├── RelatedWordsList.tsx # Related words chips
│   ├── RootChip.tsx        # Expandable root morpheme
│   ├── SearchBar.tsx       # Word input
│   └── SurpriseButton.tsx  # Random word button
├── lib/
│   ├── research.ts         # Agentic multi-source research pipeline
│   ├── llm.ts              # OpenRouter-backed LLM synthesis with structured outputs
│   ├── etymologyParser.ts  # CPU-only source text parser
│   ├── etymologyEnricher.ts # Post-LLM confidence enricher
│   ├── etymonline.ts       # Etymonline HTML scraper
│   ├── wiktionary.ts       # Wiktionary MediaWiki API client
│   ├── freeDictionary.ts   # Free Dictionary API client
│   ├── wikipedia.ts        # Wikipedia REST API client
│   ├── urbanDictionary.ts  # Urban Dictionary API with quality scoring/filtering
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
│   ├── hooks/              # React hooks (localStorage, history, search)
│   │   └── useStreamingEtymology.ts # SSE transport over the pure stream reducer
│   └── schemas/
│       ├── etymology.ts    # Zod schema for cache validation
│       └── llm-schema.ts   # Strict-mode JSON Schema for LLM structured outputs
│                           #   (mechanically sync-checked against the Zod schema)
├── data/
│   ├── faq.ts              # FAQ content with FaqItem interface
│   └── gre-words.json      # Vocabulary word list
└── .env.example            # Environment variable template
```

## API Endpoints

| Endpoint             | Method | Description                                                   | Auth Required     |
| -------------------- | ------ | ------------------------------------------------------------- | ----------------- |
| `/api/etymology`     | GET    | Synthesize etymology (`?word=X`, optional `?stream=true` SSE) | No (rate-limited) |
| `/api/pronunciation` | GET    | Get pronunciation audio                                       | No                |
| `/api/suggestions`   | GET    | Get autocomplete and typo suggestions                         | No                |
| `/api/random-word`   | GET    | Get a random word                                             | No                |
| `/api/ngram`         | GET    | Get Google Books usage-over-time data (`?word=X`)             | No                |
| `/api/health`        | GET    | Liveness check                                                | No                |
| `/api/admin/stats`   | GET    | Get budget/usage statistics and counters                      | Admin secret      |

## How It Works

1. **Request Deduplication**: Singleflight owner-token locks (90s TTL, heartbeat-extended) ensure one pipeline run per word; waiters poll the cache for the holder's result, and streaming waiters can take over if the holder crashes
2. **Rate Limiting**: Per-IP rate limiting (20 req/min + 200 req/day) via Upstash Redis
3. **Cache Check**: Redis cache lookup with versioned keys (`etymology:v2.2:`), schema validation on read, and negative cache (6h) for known no-source/invalid words. Without Redis, uncached searches return 503 (fail closed)
4. **Grounded Etymology Pipeline**:
   - **Parser** (CPU-only): Extracts "from X, from Y" chains from raw source text
   - **Agentic Research**: Multi-phase research pipeline (aborts mid-flight if the client disconnects):
     - Phase 1: Fire all 6 source fetches at once (Etymonline, Wiktionary, Free Dictionary, Wikipedia, Urban Dictionary, Incel Wiki); only Etymonline + Wiktionary gate the next phase — the rest join before synthesis. Raw Etymonline/Wiktionary pages are served from a 7-day Redis source cache when available
     - Phase 2: Root morphemes extracted on-CPU from derivation formulas ("From X + Y", "equivalent to X + Y") and parsed-chain affixes (e.g., "telephone" → ["tele", "phone"]); a quick LLM call (15s timeout, truncated input) runs only when the CPU pass finds nothing
     - Phase 3: One parallel wave fetches root pages (up to 4 roots, etymonline + wiktionary) and main-word related-term pages (etymonline only) within the 16-fetch budget
   - **LLM Synthesis**: Aggregated research context sent to LLM with structured output schema
   - **Enricher** (CPU): Post-processes LLM output, assigns confidence scores (high/medium/low) based on source evidence match
5. **Guaranteed JSON**: Using constrained decoding, the LLM produces valid JSON matching the exact schema
6. **Budget Enforcement**: Cost guard tracks monthly spend (OpenRouter-reported cost, with `openai/gpt-5.4-mini` pricing as fallback) against a $10/month cap and switches from normal to cache_only mode at 90% of budget; both the root-extraction and synthesis LLM calls are counted
7. **Rich Display**: Etymology rendered with expandable roots, ancestry graph with confidence badges, POS tags, modern usage, related words, and source attribution (supplemental sources are only surfaced when significance checks pass)

### Architecture Diagram

```
┌──────────────────────────────┐
│         BROWSER UI           │
│ SearchBar / History / Result  │
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
│ 1) Fire 6 source fetches at once (etymonline/wiktionary via 7d source cache) │
│ 2) Parse "from X, from Y" chains once etymonline+wiktionary land (CPU-only)  │
│ 3) CPU root extraction from derivation formulas; LLM fallback if none found  │
│ 4) ONE parallel wave: root pages + related-term pages (16-fetch budget)      │
│ 5) OpenRouter synthesis, json_schema strict (sections stream when stream=true)│
│ 6) Enrich ancestry graph + confidence/evidence                               │
│ 7) Cache result in Redis                                                     │
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

## License

MIT

## Acknowledgments

- Etymology data from [Etymonline](https://www.etymonline.com/) and [Wiktionary](https://en.wiktionary.org/)
- Definitions and pronunciation hints from [Free Dictionary API](https://dictionaryapi.dev/)
- Encyclopedic context from [Wikipedia](https://en.wikipedia.org/)
- Modern slang definitions from [Urban Dictionary](https://www.urbandictionary.com/)
- Supplemental community slang context from [Incel Wiki](https://incels.wiki/)
- Pronunciation audio from [ElevenLabs](https://elevenlabs.io/)
- Powered by [OpenRouter](https://openrouter.ai/) `openai/gpt-5.4-mini`
- Rate limiting and caching by [Upstash](https://upstash.com/)
