# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Etymology Explorer is a Next.js web app that helps users discover word origins through an LLM-powered synthesis pipeline. Users search for a word, and the app fetches raw data from Etymonline (HTML scraping) and Wiktionary (MediaWiki API), then sends it to Claude or OpenRouter for structured synthesis into roots, lore, and related words.

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
    │   ├── Phase 1: Parallel fetch main word from Etymonline + Wiktionary
    │   ├── Phase 2: Quick LLM call to extract root morphemes
    │   ├── Phase 3: Fetch data for each root (max 3 roots)
    │   └── Phase 4: Fetch related terms (depth-limited, max 10 total fetches)
    ├── Typo check: Levenshtein distance against GRE word list (lib/spellcheck.ts)
    ├── LLM synthesis: Anthropic SDK or OpenRouter API
    │   └── Structured outputs: Guaranteed JSON via constrained decoding
    └── Response: EtymologyResult { word, pronunciation, definition, roots[], ancestryGraph, lore, sources[] }
```

### Research Pipeline Limits

Defined in `lib/research.ts` to control API costs:

- `MAX_ROOTS_TO_EXPLORE = 3` - Max root morphemes to research
- `MAX_RELATED_WORDS_PER_ROOT = 2` - Related terms per root
- `MAX_TOTAL_FETCHES = 10` - Hard cap on external API calls per search

### Key Directories

- **`app/api/`** - Serverless API routes (etymology synthesis, model listing, random word, suggestions)
- **`lib/`** - Core business logic:
  - `claude.ts` - LLM client for Anthropic and OpenRouter with JSON schema
  - `research.ts` - Agentic multi-source research pipeline
  - `etymonline.ts`, `wiktionary.ts` - Source scrapers (HTML parsing + MediaWiki API)
  - `prompts.ts` - System prompts and JSON schema template
  - `spellcheck.ts` - Levenshtein-based typo detection and suggestions
  - `types.ts` - All TypeScript interfaces
- **`components/`** - React UI components (all client-side with `'use client'`)
- **`data/gre-words.json`** - Curated ~500 word list for random selection and spell-check

### LLM Integration

The app uses **Anthropic's structured outputs API** for guaranteed valid JSON. For OpenRouter, it uses JSON schema strict mode. Both providers receive:

1. Raw source data from Etymonline/Wiktionary (aggregated by research pipeline)
2. A JSON schema defining `EtymologyResult` (in `lib/claude.ts`)
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

| Endpoint           | Method | Purpose                                           |
| ------------------ | ------ | ------------------------------------------------- |
| `/api/etymology`   | POST   | Main synthesis - requires `{ word, llmConfig }`   |
| `/api/models`      | POST   | Fetch Anthropic models - requires API key in body |
| `/api/suggestions` | GET    | Typo correction - `?q=word`                       |
| `/api/random-word` | GET    | Random GRE word (crypto randomness)               |

All return `{ success: boolean, data?: T, error?: string }` wrapper.

## Important Files

- **`lib/research.ts`** - Agentic research orchestrator (multi-phase source gathering)
- **`lib/claude.ts`** - LLM client for both Anthropic and OpenRouter
- **`lib/prompts.ts`** - System prompt and JSON schema for structured outputs
- **`lib/etymonline.ts`** - HTML scraper with fallback patterns for different page structures
- **`lib/types.ts`** - Core types: `EtymologyResult`, `Root`, `AncestryGraph`, `SourceReference`
- **`app/page.tsx`** - Main UI with search flow, URL sync, and state management
- **`components/SettingsModal.tsx`** - LLM provider/model configuration
- **`components/AncestryTree.tsx`** - Visual ancestry graph with branch merging
