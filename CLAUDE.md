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
    ├── Parallel fetch: Etymonline (scrape) + Wiktionary (API)
    ├── Typo check: Levenshtein distance against GRE word list
    ├── LLM synthesis: Anthropic SDK or OpenRouter API
    │   └── Structured outputs: Guaranteed JSON via constrained decoding
    └── Response: EtymologyResult { word, pronunciation, definition, roots[], lore, sources[] }
```

### Key Directories

- **`app/api/`** - Serverless API routes (etymology synthesis, model listing, random word, suggestions)
- **`lib/`** - Core business logic: LLM clients (`claude.ts`), scrapers (`etymonline.ts`, `wiktionary.ts`), prompts, types
- **`components/`** - React UI components (all client-side with `'use client'`)
- **`data/gre-words.json`** - Curated ~500 word list for random selection and spell-check

### LLM Integration

The app uses **Anthropic's structured outputs API** (`beta: structured-outputs-2025-11-13`) for guaranteed valid JSON. For OpenRouter, it uses JSON schema strict mode. Both providers receive:

1. Raw source data from Etymonline/Wiktionary
2. A JSON schema defining `EtymologyResult`
3. System prompt in `lib/prompts.ts`

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

## API Endpoints

| Endpoint           | Method | Purpose                                           |
| ------------------ | ------ | ------------------------------------------------- |
| `/api/etymology`   | POST   | Main synthesis - requires `{ word, llmConfig }`   |
| `/api/models`      | POST   | Fetch Anthropic models - requires API key in body |
| `/api/suggestions` | GET    | Typo correction - `?q=word`                       |
| `/api/random-word` | GET    | Random GRE word (crypto randomness)               |

All return `{ success: boolean, data?: T, error?: string }` wrapper.

## Important Files

- **`lib/claude.ts`** - LLM client for both Anthropic and OpenRouter
- **`lib/prompts.ts`** - System prompt and JSON schema for structured outputs
- **`lib/etymonline.ts`** - HTML scraper with fallback patterns for different page structures
- **`app/page.tsx`** - Main UI with search flow, URL sync, and state management
- **`components/SettingsModal.tsx`** - LLM provider/model configuration
