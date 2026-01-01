# Etymology Explorer

A beautiful, interactive web app that helps you discover the origins and roots of words. Perfect for GRE/TOEFL vocabulary learners who want to understand words deeply through their etymological roots.

## Features

- **Etymology Lookup**: Search any word to discover its linguistic origins, root morphemes, and historical evolution
- **Memorable Lore**: Each word comes with a 2-3 sentence narrative that makes the etymology stick
- **Related Words**: Discover GRE/TOEFL-level words that share the same roots
- **Multiple LLM Providers**: Choose between Anthropic (Claude) or OpenRouter for flexibility
- **Dynamic Model Selection**: Automatically fetches available models from Anthropic API
- **Search History**: Track your vocabulary exploration with a persistent sidebar
- **Surprise Me**: Discover random GRE words to expand your vocabulary
- **Structured Outputs**: Guaranteed valid JSON responses using constrained decoding

## Screenshots

The app features a clean, typography-focused design with:

- Serif fonts for an academic feel
- Expandable root chips showing related words
- Source attribution (Etymonline, Wiktionary)
- IPA pronunciation guides

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

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **UI**: [React 19](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/)
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
│   │   ├── random-word/   # Random GRE word selection
│   │   └── suggestions/   # Typo correction suggestions
│   ├── layout.tsx         # Root layout with fonts
│   └── page.tsx           # Main page with search UI
├── components/
│   ├── EtymologyCard.tsx  # Main result display
│   ├── HistorySidebar.tsx # Search history panel
│   ├── RootChip.tsx       # Expandable root morpheme
│   ├── SearchBar.tsx      # Word input
│   ├── SettingsModal.tsx  # LLM configuration
│   └── SurpriseButton.tsx # Random word button
├── lib/
│   ├── claude.ts          # LLM synthesis with structured outputs
│   ├── etymonline.ts      # Etymonline scraper
│   ├── wiktionary.ts      # Wiktionary API client
│   ├── prompts.ts         # System prompts and schemas
│   ├── types.ts           # TypeScript interfaces
│   └── hooks/             # React hooks (localStorage, history)
└── data/
    └── gre-words.json     # GRE vocabulary list
```

## API Endpoints

| Endpoint           | Method | Description                      |
| ------------------ | ------ | -------------------------------- |
| `/api/etymology`   | POST   | Synthesize etymology for a word  |
| `/api/models`      | POST   | Fetch available Anthropic models |
| `/api/suggestions` | GET    | Get typo correction suggestions  |
| `/api/random-word` | GET    | Get a random GRE word            |

## How It Works

1. **Data Fetching**: When you search a word, the app fetches data from Etymonline (web scraping) and Wiktionary (MediaWiki API) in parallel
2. **LLM Synthesis**: The raw data is sent to your chosen LLM with a structured output schema
3. **Guaranteed JSON**: Using constrained decoding, the LLM produces valid JSON matching the exact schema
4. **Rich Display**: The etymology is rendered with expandable roots, related words, and source attribution

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
