# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Etymology Explorer is a Next.js web app that helps users discover word origins through an LLM-powered synthesis pipeline. Users search for a word, and the app fetches raw data from 4 sources in parallel (Etymonline, Wiktionary, Wikipedia, and Urban Dictionary), then sends it to Claude or OpenRouter for structured synthesis into roots, lore, POS definitions, related words, and modern usage context.

**Live**: https://etymology.thepushkarp.com

## Commands

```bash
# Development
yarn dev              # Start dev server on localhost:3000

# Code quality
yarn lint             # ESLint check
yarn lint:fix         # Auto-fix lint issues
yarn format           # Prettier format all files
yarn format:check     # Verify formatting

# Production
yarn build            # Build for production
yarn start            # Start production server
```

Pre-commit hooks (Husky + lint-staged) automatically run ESLint and Prettier on staged files.

## Architecture

### Data Flow

```
User Search → /api/etymology
    ├── Agentic Research Pipeline (lib/research.ts):
    │   ├── Phase 1: Parallel fetch from 4 sources (Etymonline + Wiktionary + Wikipedia + Urban Dictionary)
    │   ├── Phase 2: Quick LLM call to extract root morphemes
    │   ├── Phase 3: Fetch data for each root (max 3 roots)
    │   └── Phase 4: Fetch related terms (depth-limited, max 10 total fetches)
    ├── Typo check: Levenshtein distance against GRE word list (lib/spellcheck.ts)
    ├── LLM synthesis: Anthropic SDK or OpenRouter API
    │   └── Structured outputs: Guaranteed JSON via constrained decoding
    └── Response: EtymologyResult { word, pronunciation, definition, roots[], ancestryGraph, lore, partsOfSpeech[], suggestions, modernUsage, sources[] }
```

### Research Pipeline Limits

Defined in `lib/research.ts` to control API costs:

- `MAX_ROOTS_TO_EXPLORE = 3` - Max root morphemes to research
- `MAX_RELATED_WORDS_PER_ROOT = 2` - Related terms per root
- `MAX_TOTAL_FETCHES = 10` - Hard cap on external API calls per search

### Key Directories

- **`app/`** - Page routes and SEO:
  - `faq/page.tsx` - FAQ page with FAQPage JSON-LD schema
  - `learn/what-is-etymology/page.tsx` - Educational content for SEO
  - `sitemap.ts` - Dynamic sitemap generator
  - `robots.ts` - Robots.txt configuration
  - `og/route.tsx` - Dynamic Open Graph image generation
- **`app/api/`** - Serverless API routes (etymology synthesis, model listing, random word, suggestions, pronunciation)
- **`lib/`** - Core business logic:
  - `claude.ts` - LLM client for Anthropic and OpenRouter with JSON schema
  - `research.ts` - Agentic multi-source research pipeline (4 sources in Phase 1)
  - `etymonline.ts`, `wiktionary.ts` - Traditional etymology sources (HTML parsing + MediaWiki API)
  - `wikipedia.ts` - Wikipedia REST API for encyclopedic context
  - `urbanDictionary.ts` - Urban Dictionary API with NSFW filtering for modern slang
  - `elevenlabs.ts` - ElevenLabs TTS for pronunciation audio
  - `prompts.ts` - System prompts and JSON schema template
  - `spellcheck.ts` - Levenshtein-based typo detection and suggestions
  - `types.ts` - All TypeScript interfaces (including POSDefinition, WordSuggestions, ModernUsage)
- **`components/`** - React UI components (all client-side with `'use client'`):
  - `JsonLd.tsx` - WebApplication schema with SearchAction for sitelinks
  - `FaqSchema.tsx` - FAQPage JSON-LD schema generator
  - `FaqAccordion.tsx` - Accessible FAQ using native details/summary
  - `ErrorState.tsx` - Error display with retry functionality
  - `RelatedWordsList.tsx` - Related words chip display
- **`data/`** - Static content:
  - `gre-words.json` - ~500 word list for random selection and spell-check
  - `faq.ts` - FAQ content with FaqItem interface

### LLM Integration

The app uses **Anthropic's structured outputs API** for guaranteed valid JSON. For OpenRouter, it uses JSON schema strict mode. Both providers receive:

1. Raw source data from all 4 sources (Etymonline, Wiktionary, Wikipedia, Urban Dictionary) aggregated by research pipeline
2. A JSON schema defining `EtymologyResult` including `partsOfSpeech`, `suggestions`, and `modernUsage` (in `lib/claude.ts`)
3. System prompt in `lib/prompts.ts`

**Note**: Anthropic calls use `betas: ['structured-outputs-2025-11-13']` flag in `lib/claude.ts:180`.

### Client State

All user data stays in **localStorage** (never server-stored):

- LLM configuration (API keys, model selection)
- Search history (max 50 entries)
- Custom hooks: `useLocalStorage`, `useHistory` in `lib/hooks/`

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

| Endpoint             | Method | Purpose                                           |
| -------------------- | ------ | ------------------------------------------------- |
| `/api/etymology`     | POST   | Main synthesis - requires `{ word, llmConfig }`   |
| `/api/models`        | POST   | Fetch Anthropic models - requires API key in body |
| `/api/suggestions`   | GET    | Typo correction - `?q=word`                       |
| `/api/random-word`   | GET    | Random GRE word (crypto randomness)               |
| `/api/pronunciation` | GET    | TTS audio - `?word=word` (ElevenLabs)             |

All return `{ success: boolean, data?: T, error?: string }` wrapper.

## Important Files

- **`lib/research.ts`** - Agentic research orchestrator (4-source parallel fetch in Phase 1)
- **`lib/claude.ts`** - LLM client for both Anthropic and OpenRouter
- **`lib/prompts.ts`** - System prompt and JSON schema for structured outputs
- **`lib/etymonline.ts`** - HTML scraper with fallback patterns for different page structures
- **`lib/wikipedia.ts`** - Wikipedia REST API client for encyclopedic context
- **`lib/urbanDictionary.ts`** - Urban Dictionary API with NSFW word filtering (100+ upvotes threshold)
- **`lib/elevenlabs.ts`** - ElevenLabs TTS client for pronunciation audio
- **`lib/types.ts`** - Core types: `EtymologyResult`, `Root`, `AncestryGraph`, `POSDefinition`, `WordSuggestions`, `ModernUsage`, `SourceReference`
- **`app/page.tsx`** - Main UI with search flow, URL sync, and state management
- **`components/SettingsModal.tsx`** - LLM provider/model configuration
- **`components/AncestryTree.tsx`** - Visual ancestry graph with branch merging
- **`components/EtymologyCard.tsx`** - Main result display with POS badges, Modern Usage section, and Related Words chips
- **`components/PronunciationButton.tsx`** - Audio playback button with ElevenLabs integration
- **`data/faq.ts`** - FAQ content (shared by UI and JSON-LD schema)
- **`components/JsonLd.tsx`** - WebApplication schema with SearchAction
- **`components/FaqSchema.tsx`** - FAQPage JSON-LD for Google rich results
- **`components/FaqAccordion.tsx`** - Accessible FAQ with native details/summary
- **`app/faq/page.tsx`** - FAQ page with metadata and structured data
- **`app/learn/what-is-etymology/page.tsx`** - Long-form educational content (~1200 words)
- **`app/sitemap.ts`** - Dynamic sitemap for all routes
