# Etymology Explorer

A beautiful, interactive web app that helps you discover the origins and roots of words. Perfect for vocabulary enthusiasts who want to understand words deeply through their etymological roots.

Try it out at [etymology.thepushkarp.com](https://etymology.thepushkarp.com)

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
- **Structured Outputs**: Guaranteed valid JSON responses using constrained decoding
- **Streaming UI**: Optional `?stream=true` server-sent events for source progress and token streaming
- **Smart Caching**: Redis-backed caching reduces costs and improves speed (30d etymology, 1yr audio)
- **Rate Limiting**: Per-IP protection via Upstash Redis with automatic budget enforcement

## Getting Started

### Prerequisites

- Node.js 18+
- For self-hosted deployment:
  - [Anthropic](https://console.anthropic.com/settings/keys) API key (required)
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

The app runs in **public mode** using a server-side Anthropic API key (Claude Haiku 4.5). All searches are rate-limited and cost-budgeted. Set the `ANTHROPIC_API_KEY` environment variable to enable it.

### Environment Configuration

For self-hosted deployments, create a `.env.local` file:

```bash
# Required for public mode
ANTHROPIC_API_KEY=your_anthropic_key_here
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

See `.env.example` for full documentation.

For local load testing, set `RATE_LIMIT_ENABLED=false` in `.env.local` and restart `bun dev`.

## Tech Stack

- **Framework**: [Next.js 16.1](https://nextjs.org/) with App Router
- **UI**: [React 19.2](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/)
- **LLM**: [Anthropic SDK](https://docs.anthropic.com/) with structured outputs
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
- **Typography**: Libre Baskerville (serif)

## Project Structure

```
etymology-explorer/
├── app/
│   ├── api/
│   │   ├── admin/stats/    # Budget/usage statistics (admin-only)
│   │   ├── etymology/      # Main etymology synthesis endpoint (GET)
│   │   ├── pronunciation/  # TTS audio endpoint (ElevenLabs)
│   │   ├── random-word/    # Random word selection
│   │   └── suggestions/    # Typo correction suggestions
│   ├── faq/                # FAQ page with structured data
│   ├── learn/              # Educational content pages
│   │   └── what-is-etymology/
│   ├── og/                 # Dynamic OG image generation
│   ├── sitemap.ts          # Dynamic sitemap
│   ├── robots.ts           # Robots.txt configuration
│   ├── layout.tsx          # Root layout with fonts
│   └── page.tsx            # Main page with search UI
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
│   ├── claude.ts           # LLM synthesis with structured outputs
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
│   │   ├── useStreamingEtymology.ts # Primary streaming search hook (SSE)
│   │   └── useEtymologySearch.ts    # Non-streaming search hook
│   └── schemas/
│       ├── etymology.ts    # Zod schema for cache validation
│       └── llm-schema.ts   # JSON Schema for LLM structured outputs
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
| `/api/suggestions`   | GET    | Get typo correction suggestions                               | No                |
| `/api/random-word`   | GET    | Get a random word                                             | No                |
| `/api/admin/stats`   | GET    | Get budget/usage statistics                                   | Admin secret      |

## How It Works

1. **Request Deduplication**: Singleflight mechanism prevents duplicate concurrent searches
2. **Rate Limiting**: Per-IP rate limiting (20 req/min + 200 req/day) via Upstash Redis
3. **Cache Check**: Redis cache lookup with versioned keys (`etymology:v2.1:`), schema validation on read, and negative cache (6h) for known no-source/invalid words
4. **Grounded Etymology Pipeline**:
   - **Parser** (CPU-only): Extracts "from X, from Y" chains from raw source text
   - **Agentic Research**: Multi-phase research pipeline:
     - Phase 1: Fetch main word data from 6 sources in parallel (Etymonline, Wiktionary, Free Dictionary, Wikipedia, Urban Dictionary, Incel Wiki)
     - Phase 2: Quick LLM call extracts root morphemes (e.g., "telephone" → ["tele", "phone"])
     - Phase 3: Fetch etymology data for each identified root
     - Phase 4: Gather related terms for additional context (depth-limited)
   - **LLM Synthesis**: Aggregated research context sent to LLM with structured output schema
   - **Enricher** (CPU): Post-processes LLM output, assigns confidence scores (high/medium/low) based on source evidence match
5. **Guaranteed JSON**: Using constrained decoding, the LLM produces valid JSON matching the exact schema
6. **Budget Enforcement**: Cost guard tracks spending and enforces protection modes (normal → protected_503 → cache_only → blocked)
7. **Rich Display**: Etymology rendered with expandable roots, ancestry graph with confidence badges, POS tags, modern usage, related words, and source attribution (supplemental sources are only surfaced when significance checks pass)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Client)                               │
│  ┌─────────────┐  ┌───────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  SearchBar  │  │HistorySidebar │  │ RootChip    │  │  EtymologyCard  │  │
│  └──────┬──────┘  └───────┬───────┘  └──────┬──────┘  └────────┬────────┘  │
│         │                │                 │                   │            │
│         │         localStorage             │                   │            │
│         │      (search history)            │                   │            │
│         └────────────────┬─────────────────┴───────────────────┘            │
└──────────────────────────┼──────────────────────────────────────────────────┘
                           │ GET /api/etymology?word=... (&stream=true optional)
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MIDDLEWARE (Edge)                                   │
│  ┌───────────────────┐       ┌──────────────────┐                           │
│  │  Rate Limiting    │  ───▶ │   CSP Headers    │                           │
│  │  (Upstash Redis)  │       └──────────────────┘                           │
│  └───────────────────┘                                                      │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS SERVER                                    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                  CACHING + DEDUPLICATION LAYER                        │  │
│  │  ┌──────────────┐       ┌──────────────────┐                          │  │
│  │  │ Singleflight │  ───▶ │   Redis Cache    │                          │  │
│  │  │ Deduplication│       │ (30d etymology,   │                          │  │
│  │  │              │       │  1yr audio)       │                          │  │
│  │  └──────────────┘       └──────────────────┘                          │  │
│  └─────────────────────────────────┬─────────────────────────────────────┘  │
│                                    │ Cache miss                             │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                   GROUNDED ETYMOLOGY PIPELINE                         │  │
│  │                                                                       │  │
│  │  ┌────────────┐      ┌──────────────────────┐      ┌──────────────┐  │  │
│  │  │   Parser   │  ──▶ │  Agentic Research    │  ──▶ │   Enricher   │  │  │
│  │  │ (CPU-only) │      │  (6-source parallel) │      │ (CPU-only)   │  │  │
│  │  │            │      │                      │      │              │  │  │
│  │  │ Extract    │      │ Phase 1-4 research   │      │ Assign       │  │  │
│  │  │ "from X,Y" │      │ + LLM synthesis      │      │ confidence   │  │  │
│  │  │ chains     │      │                      │      │ (h/m/l)      │  │  │
│  │  └────────────┘      └──────────────────────┘      └──────────────┘  │  │
│  │                                │                                      │  │
│  │                                ▼ ResearchContext                       │  │
│  │                     ┌────────────────────────┐                         │  │
│  │                     │   LLM SYNTHESIS        │                         │  │
│  │                     │   (Anthropic SDK)      │                         │  │
│  │                     │                        │                         │  │
│  │                     │ Structured JSON output │                         │  │
│  │                     └────────────────────────┘                         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       COST GUARD + BUDGET                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐     │  │
│  │  │  Normal  │─▶│protected_503│─▶│Cache-only │─▶│     Blocked      │   │  │
│  │  │  Mode    │  │    Mode     │  │   Mode    │  │ (budget exceeded)│   │  │
│  │  └──────────┘  └──────────┘  └───────────┘  └──────────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                  │
│                                                                             │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐    │
│   │  etymonline.com│  │ en.wiktionary  │  │      Anthropic API         │    │
│   │  (HTML scrape) │  │ (MediaWiki API)│  │  (LLM with JSON schema)    │    │
│   └────────────────┘  └────────────────┘  └────────────────────────────┘    │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐    │
│   │  en.wikipedia  │  │ Urban Dict API │  │      ElevenLabs API        │    │
│   │  (REST API)    │  │ (quality gate) │  │  (pronunciation audio)     │    │
│   └────────────────┘  └────────────────┘  └────────────────────────────┘    │
│   ┌────────────────┐  ┌────────────────┐                                     │
│   │ Free Dict API  │  │ Incel Wiki API │                                     │
│   │ (dictionaryapi)|  │ (MediaWiki)    │                                     │
│   └────────────────┘  └────────────────┘                                     │
│   ┌────────────────┐                                                         │
│   │ Upstash Redis  │                                                         │
│   │ (cache + rate) │                                                         │
│   └────────────────┘                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
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
- Powered by [Claude](https://www.anthropic.com/claude) from Anthropic
- Rate limiting and caching by [Upstash](https://upstash.com/)
