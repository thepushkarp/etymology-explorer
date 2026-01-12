# Etymology Explorer

A beautiful, interactive web app that helps you discover the origins and roots of words. Perfect for vocabulary enthusiasts who want to understand words deeply through their etymological roots.

Try it out at [etymology.thepushkarp.com](https://etymology.thepushkarp.com)

## Features

- **Etymology Lookup**: Search any word to discover its linguistic origins, root morphemes, and historical evolution
- **Memorable Lore**: Each word comes with a 4-6 sentence narrative that makes the etymology stick
- **Related Words**: Discover words that share the same roots
- **Multiple LLM Providers**: Choose between Anthropic (Claude) or OpenRouter for flexibility
- **Dynamic Model Selection**: Automatically fetches available models from Anthropic API
- **Search History**: Track your vocabulary exploration with a persistent sidebar
- **Surprise Me**: Discover random words to expand your vocabulary
- **Structured Outputs**: Guaranteed valid JSON responses using constrained decoding

## Getting Started

### Prerequisites

- Node.js 18+
- An API key from either:
  - [Anthropic](https://console.anthropic.com/settings/keys) (recommended)
  - [OpenRouter](https://openrouter.ai/keys)

### Installation

```bash
# Clone the repository
git clone https://github.com/thepushkarp/etymology-explorer.git
cd etymology-explorer

# Install dependencies
yarn install

# Start the development server
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Configuration

1. Click the **Settings** button (bottom-right corner)
2. Choose your LLM provider:

#### Anthropic (Default)

- Paste your Anthropic API key
- Select a model from the dropdown (auto-populated from API)
- Default: Claude Haiku 4.5 (fast and cost-effective)

#### OpenRouter

- Toggle to "OpenRouter"
- Enter a model ID (e.g., `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`)
- Paste your OpenRouter API key

Your settings are stored locally in your browser and never sent to any server.

## Tech Stack

- **Framework**: [Next.js 16.1](https://nextjs.org/) with App Router
- **UI**: [React 19.2](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/)
- **LLM**: [Anthropic SDK](https://docs.anthropic.com/) with structured outputs
- **Data Sources**: [Etymonline](https://www.etymonline.com/) + [Wiktionary](https://en.wiktionary.org/)
- **Typography**: Libre Baskerville (serif)

## Project Structure

```
etymology-explorer/
├── app/
│   ├── api/
│   │   ├── etymology/     # Main etymology synthesis endpoint
│   │   ├── models/        # Fetch available Anthropic models
│   │   ├── random-word/   # Random word selection
│   │   └── suggestions/   # Typo correction suggestions
│   ├── layout.tsx         # Root layout with fonts
│   └── page.tsx           # Main page with search UI
├── components/
│   ├── AncestryTree.tsx   # Visual etymology graph
│   ├── EtymologyCard.tsx  # Main result display
│   ├── HistorySidebar.tsx # Search history panel
│   ├── RootChip.tsx       # Expandable root morpheme
│   ├── SearchBar.tsx      # Word input
│   ├── SettingsModal.tsx  # LLM configuration
│   └── SurpriseButton.tsx # Random word button
├── lib/
│   ├── research.ts        # Agentic multi-source research pipeline
│   ├── claude.ts          # LLM synthesis with structured outputs
│   ├── etymonline.ts      # Etymonline scraper
│   ├── wiktionary.ts      # Wiktionary API client
│   ├── spellcheck.ts      # Typo detection and suggestions
│   ├── prompts.ts         # System prompts and schemas
│   ├── types.ts           # TypeScript interfaces
│   └── hooks/             # React hooks (localStorage, history)
└── data/
    └── gre-words.json     # Vocabulary word list
```

## API Endpoints

| Endpoint           | Method | Description                      |
| ------------------ | ------ | -------------------------------- |
| `/api/etymology`   | POST   | Synthesize etymology for a word  |
| `/api/models`      | POST   | Fetch available Anthropic models |
| `/api/suggestions` | GET    | Get typo correction suggestions  |
| `/api/random-word` | GET    | Get a random word                |

## How It Works

1. **Agentic Research**: When you search a word, an agentic pipeline conducts multi-phase research:
   - Phase 1: Fetch main word data from Etymonline and Wiktionary in parallel
   - Phase 2: Quick LLM call extracts root morphemes (e.g., "telephone" → ["tele", "phone"])
   - Phase 3: Fetch etymology data for each identified root
   - Phase 4: Gather related terms for additional context (depth-limited)
2. **LLM Synthesis**: The aggregated research context is sent to your chosen LLM with a structured output schema
3. **Guaranteed JSON**: Using constrained decoding, the LLM produces valid JSON matching the exact schema
4. **Rich Display**: The etymology is rendered with expandable roots, ancestry graph, and source attribution

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Client)                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │  SearchBar  │  │SettingsModal │  │HistorySidebar│  │  EtymologyCard  │   │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └────────┬────────┘   │
│         │                │                 │                   │            │
│         │         localStorage             │                   │            │
│         │      (API keys, history)         │                   │            │
│         └────────────────┬─────────────────┴───────────────────┘            │
└──────────────────────────┼──────────────────────────────────────────────────┘
                           │ POST /api/etymology
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS SERVER                                    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    AGENTIC RESEARCH PIPELINE                          │  │
│  │                                                                       │  │
│  │   Phase 1                    Phase 2                 Phase 3-4        │  │
│  │  ┌──────────┐               ┌───────┐              ┌──────────────┐   │  │
│  │  │Etymonline│──┐            │Quick  │              │ Root + Related│   │  │
│  │  │ Scraper  │  ├──────────▶ │LLM    │ ──────────▶  │ Term Fetches │   │  │
│  │  └──────────┘  │  parallel  │Call   │  roots[]     │ (max 10)     │   │  │
│  │  ┌──────────┐  │            └───────┘              └──────────────┘   │  │
│  │  │Wiktionary│──┘                                                      │  │
│  │  │  API     │                                                         │  │
│  │  └──────────┘                                                         │  │
│  └─────────────────────────────────────┬─────────────────────────────────┘  │
│                                        │                                    │
│                                        ▼ ResearchContext                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       LLM SYNTHESIS                                   │  │
│  │                                                                       │  │
│  │   ┌─────────────┐      ┌────────────────┐      ┌──────────────────┐   │  │
│  │   │  Anthropic  │  OR  │   OpenRouter   │  ──▶ │ Structured JSON  │   │  │
│  │   │    SDK      │      │     API        │      │ (EtymologyResult)│   │  │
│  │   └─────────────┘      └────────────────┘      └──────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                  │
│                                                                             │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐    │
│   │  etymonline.com│  │ en.wiktionary  │  │  Anthropic / OpenRouter    │    │
│   │  (HTML scrape) │  │ (MediaWiki API)│  │  (LLM with JSON schema)    │    │
│   └────────────────┘  └────────────────┘  └────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Run development server
yarn dev

# Lint code
yarn lint

# Format code
yarn format

# Build for production
yarn build
```

## Deployment

Deploy easily on [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/thepushkarp/etymology-explorer)

## License

MIT

## Acknowledgments

- Etymology data from [Etymonline](https://www.etymonline.com/) and [Wiktionary](https://en.wiktionary.org/)
- Powered by [Claude](https://www.anthropic.com/claude) from Anthropic
