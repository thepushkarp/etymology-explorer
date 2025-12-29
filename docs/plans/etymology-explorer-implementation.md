# Etymology Explorer - Implementation Plan

## 1. Overview

Build a minimal, elegant etymology explorer web app where users search words and receive root breakdowns, origin languages, memorable lore, and related GRE-level words. Users provide their own Anthropic API key (stored in localStorage), and the app synthesizes data from Etymonline, Wiktionary, and Claude Haiku.

**Design doc**: `docs/brainstorms/etymology-explorer.md`

---

## 2. Prerequisites

### Tools & Versions

- **Node.js**: v18.17+ (required for Next.js 14)
- **npm** or **pnpm**: Latest stable
- **Git**: For version control
- **VS Code** (recommended): With ESLint + Prettier extensions

### Accounts Needed

- **Vercel account**: For deployment (free tier works)
- **Anthropic account**: To test with your own API key (users bring their own)

### Verify Your Setup

```bash
node --version   # Should be 18.17+
npm --version    # Should be 9+
git --version    # Any recent version
```

---

## 3. Codebase Orientation

This is a **greenfield project** — we're creating the structure from scratch.

### Target Directory Structure

```
etymology-explorer/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout with fonts, metadata
│   ├── page.tsx                  # Home page (search bar, results)
│   ├── globals.css               # Global styles, Tailwind imports
│   └── api/                      # API routes
│       ├── etymology/
│       │   └── route.ts          # POST /api/etymology
│       ├── random-word/
│       │   └── route.ts          # GET /api/random-word
│       └── suggestions/
│           └── route.ts          # GET /api/suggestions
├── components/                   # React components
│   ├── SearchBar.tsx
│   ├── EtymologyCard.tsx
│   ├── RootChip.tsx
│   ├── RelatedWordsList.tsx
│   ├── HistorySidebar.tsx
│   ├── SettingsModal.tsx
│   ├── SurpriseButton.tsx
│   └── ErrorState.tsx
├── lib/                          # Core services & utilities
│   ├── types.ts                  # TypeScript interfaces
│   ├── prompts.ts                # Claude prompt templates
│   ├── claude.ts                 # Anthropic API client
│   ├── wiktionary.ts             # Wiktionary API fetcher
│   ├── etymonline.ts             # Etymonline scraper
│   ├── spellcheck.ts             # Levenshtein "did you mean"
│   ├── wordlist.ts               # GRE word list utilities
│   └── hooks/                    # Custom React hooks
│       ├── useLocalStorage.ts
│       └── useHistory.ts
├── data/
│   └── gre-words.json            # Curated 500 GRE/TOEFL words
├── public/                       # Static assets
├── docs/                         # Documentation
│   ├── brainstorms/
│   └── plans/
├── __tests__/                    # Test files
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

### Patterns to Follow

- **Next.js App Router**: All pages in `app/`, API routes in `app/api/`
- **Server Components by default**: Only add `'use client'` when needed (interactivity)
- **Colocation**: Keep related files together
- **Typed everything**: All functions have explicit TypeScript types

---

## 4. Implementation Tasks

### Phase 1: Project Setup

---

#### Task 1.1: Initialize Next.js Project

**Goal:** Bootstrap the Next.js 14 project with TypeScript and Tailwind CSS.

**Steps:**

```bash
# From the project root (etymology-explorer/)
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
```

When prompted:

- Would you like to use TypeScript? **Yes**
- Would you like to use ESLint? **Yes**
- Would you like to use Tailwind CSS? **Yes**
- Would you like to use `src/` directory? **No**
- Would you like to use App Router? **Yes**
- Would you like to customize the default import alias? **Yes** → `@/*`

**Verification:**

```bash
npm run dev
# Visit http://localhost:3000 — should see Next.js welcome page
```

**Commit:** `chore: initialize Next.js 14 project with TypeScript and Tailwind`

---

#### Task 1.2: Configure Tailwind for Custom Design System

**Goal:** Set up the serif typography and warm color palette from the design spec.

**Files to touch:**

- `tailwind.config.ts` — Add custom fonts and colors
- `app/globals.css` — Import Google Fonts
- `app/layout.tsx` — Apply font classes

**Implementation:**

1. Update `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FDFBF7',
        charcoal: '#2C2C2C',
        'charcoal-light': '#4A4A4A',
        'cream-dark': '#F5F0E8',
      },
      fontFamily: {
        serif: ['Libre Baskerville', 'Georgia', 'serif'],
      },
      maxWidth: {
        content: '42rem', // ~672px, good reading width
      },
    },
  },
  plugins: [],
}
export default config
```

2. Update `app/globals.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    @apply bg-cream text-charcoal;
  }

  body {
    @apply font-serif antialiased;
  }
}
```

3. Update `app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Etymology Explorer',
  description: 'Discover the roots and origins of words',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
```

**Verification:**

```bash
npm run dev
# Page should have off-white background, serif font loaded
```

**Commit:** `style: configure Tailwind with custom typography and color palette`

---

#### Task 1.3: Create TypeScript Types

**Goal:** Define all TypeScript interfaces upfront for type safety throughout.

**Files to touch:**

- `lib/types.ts` — Create new file

**Implementation:**

Create `lib/types.ts`:

```typescript
/**
 * A single etymological root component of a word
 */
export interface Root {
  root: string // e.g., "fides"
  origin: string // e.g., "Latin"
  meaning: string // e.g., "faith, trust"
  relatedWords: string[] // e.g., ["fidelity", "confide", "diffident"]
}

/**
 * Complete etymology result for a word
 */
export interface EtymologyResult {
  word: string
  pronunciation: string // IPA, e.g., "/pərˈfɪdiəs/"
  definition: string // Brief definition
  roots: Root[]
  lore: string // 2-3 sentence memorable narrative
  sources: ('etymonline' | 'wiktionary' | 'synthesized')[]
}

/**
 * API request body for /api/etymology
 */
export interface EtymologyRequest {
  word: string
  apiKey: string
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Word suggestion for typo correction
 */
export interface WordSuggestion {
  word: string
  distance: number // Levenshtein distance
}

/**
 * History entry stored in localStorage
 */
export interface HistoryEntry {
  word: string
  timestamp: number
}

/**
 * Raw data fetched from external sources before Claude synthesis
 */
export interface RawSourceData {
  etymonline?: string | null
  wiktionary?: string | null
}
```

**Testing:** TypeScript compiler will validate usage — no runtime tests needed for types.

**Commit:** `feat: add TypeScript interfaces for etymology data structures`

---

#### Task 1.4: Create GRE Word List

**Goal:** Curate a JSON file of ~500 GRE/TOEFL words for randomness and spell-check.

**Files to touch:**

- `data/gre-words.json` — Create new file

**Implementation:**

Create `data/gre-words.json` with a curated list. Here's a starter set (you should expand to ~500):

```json
{
  "words": [
    "aberrant",
    "abeyance",
    "abscond",
    "abstain",
    "abstruse",
    "acerbic",
    "acrimony",
    "admonish",
    "aesthetic",
    "affable",
    "aggregate",
    "alacrity",
    "amalgamate",
    "ambiguous",
    "ambivalent",
    "ameliorate",
    "anachronism",
    "analogous",
    "anomaly",
    "antagonize",
    "antithesis",
    "apathetic",
    "appease",
    "arbitrary",
    "arcane",
    "arduous",
    "articulate",
    "ascetic",
    "assiduous",
    "assuage",
    "audacious",
    "austere",
    "avarice",
    "banal",
    "belligerent",
    "beneficent",
    "benevolent",
    "bolster",
    "bombastic",
    "boorish",
    "burgeon",
    "buttress",
    "cacophony",
    "capricious",
    "castigate",
    "catalyst",
    "caustic",
    "chicanery",
    "circumscribe",
    "clandestine",
    "coalesce",
    "cogent",
    "commensurate",
    "compendium",
    "complacent",
    "conciliatory",
    "condone",
    "conflagration",
    "connoisseur",
    "contentious",
    "contrite",
    "conundrum",
    "convoluted",
    "copious",
    "corroborate",
    "credulous",
    "culpable",
    "cursory",
    "dearth",
    "debacle",
    "decorum",
    "deference",
    "delineate",
    "denigrate",
    "derivative",
    "desiccate",
    "desultory",
    "diatribe",
    "dichotomy",
    "didactic",
    "diffident",
    "digress",
    "dilatory",
    "dilettante",
    "disabuse",
    "discerning",
    "disparage",
    "disparate",
    "dissemble",
    "disseminate",
    "dissonance",
    "divulge",
    "doctrinaire",
    "dogmatic",
    "ebullient",
    "eccentric",
    "eclectic",
    "efficacious",
    "effrontery",
    "egregious",
    "elegy",
    "elicit",
    "eloquent",
    "elucidate",
    "emulate",
    "endemic",
    "enervate",
    "engender",
    "enigmatic",
    "enmity",
    "ephemeral",
    "equanimity",
    "equivocate",
    "erudite",
    "esoteric",
    "euphemism",
    "evanescent",
    "exacerbate",
    "exculpate",
    "exigent",
    "exonerate",
    "expedient",
    "expunge",
    "extant",
    "extraneous",
    "facetious",
    "fallacious",
    "fastidious",
    "fathom",
    "fatuous",
    "fecund",
    "felicitous",
    "fervent",
    "fervid",
    "filibuster",
    "flagrant",
    "florid",
    "fluctuate",
    "foment",
    "forestall",
    "fortuitous",
    "fractious",
    "frugal",
    "furtive",
    "garrulous",
    "germane",
    "glib",
    "gossamer",
    "grandiloquent",
    "gregarious",
    "guileless",
    "hackneyed",
    "harangue",
    "harbinger",
    "hedonism",
    "hegemony",
    "heresy",
    "heterogeneous",
    "homogeneous",
    "hubris",
    "iconoclast",
    "idiosyncrasy",
    "ignominious",
    "immutable",
    "impassive",
    "impecunious",
    "impede",
    "impermeable",
    "imperturbable",
    "impervious",
    "impetuous",
    "implacable",
    "implicit",
    "implode",
    "importune",
    "impugn",
    "inchoate",
    "incipient",
    "incisive",
    "incongruous",
    "incontrovertible",
    "incorrigible",
    "indefatigable",
    "indigent",
    "indolent",
    "ineffable",
    "ineluctable",
    "inexorable",
    "ingenuous",
    "inherent",
    "inimical",
    "innocuous",
    "inscrutable",
    "insidious",
    "insipid",
    "intractable",
    "intransigent",
    "intrepid",
    "inundate",
    "inure",
    "invective",
    "inveterate",
    "irascible",
    "irresolute",
    "itinerant",
    "juxtapose",
    "laconic",
    "lambaste",
    "languid",
    "largesse",
    "lassitude",
    "latent",
    "laudable",
    "lethargic",
    "levity",
    "litigious",
    "loquacious",
    "lucid",
    "luminous",
    "magnanimous",
    "malevolent",
    "malleable",
    "maverick",
    "mendacious",
    "mercurial",
    "meticulous",
    "misanthrope",
    "mitigate",
    "mollify",
    "morose",
    "mundane",
    "munificent",
    "nascent",
    "nefarious",
    "neophyte",
    "nonchalant",
    "nonplussed",
    "nostalgia",
    "notorious",
    "noxious",
    "obdurate",
    "obfuscate",
    "oblique",
    "oblivious",
    "obsequious",
    "obstinate",
    "obtuse",
    "obviate",
    "occlude",
    "officious",
    "onerous",
    "opaque",
    "opportunist",
    "opprobrium",
    "oscillate",
    "ostentatious",
    "palliate",
    "paradigm",
    "paragon",
    "pariah",
    "parsimonious",
    "partisan",
    "pathological",
    "paucity",
    "pedantic",
    "penchant",
    "penurious",
    "perennial",
    "perfidious",
    "perfunctory",
    "peripheral",
    "pernicious",
    "perpetuate",
    "perspicacious",
    "perturb",
    "pervasive",
    "petulant",
    "phlegmatic",
    "pine",
    "pious",
    "placate",
    "platitude",
    "plethora",
    "poignant",
    "polarize",
    "polemical",
    "ponderous",
    "portentous",
    "pragmatic",
    "precarious",
    "precipitate",
    "preclude",
    "precocious",
    "predilection",
    "prescient",
    "presumptuous",
    "prevaricate",
    "pristine",
    "probity",
    "proclivity",
    "prodigal",
    "prodigious",
    "profligate",
    "profuse",
    "proliferate",
    "propensity",
    "propitiate",
    "propriety",
    "prosaic",
    "proscribe",
    "protagonist",
    "protean",
    "provident",
    "provincial",
    "provocative",
    "prudent",
    "puerile",
    "pugnacious",
    "punctilious",
    "pungent",
    "pusillanimous",
    "qualified",
    "quandary",
    "querulous",
    "quiescent",
    "quintessential",
    "quixotic",
    "quotidian",
    "rarefied",
    "rarefy",
    "recalcitrant",
    "recant",
    "recondite",
    "redoubtable",
    "refractory",
    "refute",
    "relegate",
    "remonstrate",
    "renege",
    "replete",
    "reprobate",
    "repudiate",
    "rescind",
    "resigned",
    "resolute",
    "reticent",
    "reverent",
    "rhetoric",
    "sagacious",
    "salient",
    "sanction",
    "sanguine",
    "sardonic",
    "satiate",
    "saturate",
    "scrupulous",
    "scrutinize",
    "sedulous",
    "sententious",
    "serendipity",
    "serene",
    "servile",
    "skeptic",
    "solicitous",
    "somnolent",
    "sonorous",
    "sophistry",
    "soporific",
    "specious",
    "sporadic",
    "spurious",
    "squalid",
    "squander",
    "stagnate",
    "stalwart",
    "staunch",
    "stigmatize",
    "stint",
    "stipulate",
    "stolid",
    "strident",
    "stringent",
    "stupefy",
    "stymie",
    "subpoena",
    "substantiate",
    "subsume",
    "subtle",
    "subversive",
    "succinct",
    "supercilious",
    "superfluous",
    "supplant",
    "surfeit",
    "surreptitious",
    "sycophant",
    "tacit",
    "taciturn",
    "tangential",
    "tantamount",
    "temerity",
    "temperance",
    "tenacious",
    "tenuous",
    "terse",
    "tirade",
    "torpid",
    "tortuous",
    "tractable",
    "transient",
    "trenchant",
    "truculent",
    "turgid",
    "turpitude",
    "ubiquitous",
    "umbrage",
    "unctuous",
    "undermine",
    "underscore",
    "unequivocal",
    "untenable",
    "urbane",
    "usurp",
    "vacillate",
    "variegated",
    "vehement",
    "venerate",
    "veracious",
    "verbose",
    "vestige",
    "viable",
    "vicarious",
    "vigilant",
    "vilify",
    "vindicate",
    "virulent",
    "viscous",
    "vitriolic",
    "vituperate",
    "vociferous",
    "volatile",
    "voracious",
    "warrant",
    "wary",
    "zealot",
    "zenith"
  ]
}
```

**Note:** This is ~380 words. For production, expand to 500+ from sources like Magoosh, Manhattan Prep, or Barron's.

**Verification:**

```bash
# Count words in the JSON
cat data/gre-words.json | grep -c '"'
# Should be ~380 lines with quotes (words)
```

**Commit:** `data: add curated GRE/TOEFL word list (~380 words)`

---

### Phase 2: Core Services (Backend)

---

#### Task 2.1: Wiktionary API Service

**Goal:** Fetch and parse etymology data from Wiktionary's API.

**Files to touch:**

- `lib/wiktionary.ts` — Create new file

**Implementation:**

Create `lib/wiktionary.ts`:

```typescript
/**
 * Fetches etymology section from Wiktionary for a given word.
 * Uses the MediaWiki API to get page content.
 */

interface WiktionaryResponse {
  query?: {
    pages?: {
      [key: string]: {
        extract?: string
        missing?: boolean
      }
    }
  }
}

/**
 * Fetch raw etymology text from Wiktionary
 * @param word - The word to look up
 * @returns Raw etymology text or null if not found
 */
export async function fetchWiktionary(word: string): Promise<string | null> {
  const normalizedWord = word.toLowerCase().trim()

  // Wiktionary API endpoint - get plain text extract
  const url = new URL('https://en.wiktionary.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('titles', normalizedWord)
  url.searchParams.set('prop', 'extracts')
  url.searchParams.set('explaintext', 'true')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*') // CORS

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'EtymologyExplorer/1.0 (educational project)',
      },
    })

    if (!response.ok) {
      console.error(`Wiktionary API error: ${response.status}`)
      return null
    }

    const data: WiktionaryResponse = await response.json()
    const pages = data.query?.pages

    if (!pages) return null

    // Get the first (and usually only) page
    const pageId = Object.keys(pages)[0]
    const page = pages[pageId]

    if (page.missing || !page.extract) {
      return null
    }

    // Extract just the etymology section if present
    const extract = page.extract
    const etymologyMatch = extract.match(/Etymology[\s\S]*?(?=\n\n[A-Z]|\n\nPronunciation|$)/i)

    return etymologyMatch ? etymologyMatch[0].trim() : extract.slice(0, 1000)
  } catch (error) {
    console.error('Wiktionary fetch error:', error)
    return null
  }
}
```

**Testing:**
Create `__tests__/wiktionary.test.ts`:

```typescript
import { fetchWiktionary } from '@/lib/wiktionary'

describe('fetchWiktionary', () => {
  it('fetches etymology for a common word', async () => {
    const result = await fetchWiktionary('perfidious')
    expect(result).not.toBeNull()
    expect(result).toContain('Latin') // Should mention Latin origin
  }, 10000) // 10s timeout for network

  it('returns null for nonsense words', async () => {
    const result = await fetchWiktionary('xyzabc123nonsense')
    expect(result).toBeNull()
  }, 10000)

  it('handles edge cases', async () => {
    const result = await fetchWiktionary('  Word  ') // whitespace
    expect(result).not.toBeNull()
  }, 10000)
})
```

**Run tests:**

```bash
npm install --save-dev jest @types/jest ts-jest
npx jest __tests__/wiktionary.test.ts
```

**Commit:** `feat: add Wiktionary API service for etymology fetching`

---

#### Task 2.2: Etymonline Scraper

**Goal:** Scrape etymology data from Etymonline (they don't have an API).

**Files to touch:**

- `lib/etymonline.ts` — Create new file

**Implementation:**

Create `lib/etymonline.ts`:

```typescript
/**
 * Scrapes etymology data from Etymonline.
 * Note: This is fragile as HTML structure may change.
 * Always implement graceful fallback.
 */

/**
 * Fetch etymology text from Etymonline
 * @param word - The word to look up
 * @returns Raw etymology text or null if not found/failed
 */
export async function fetchEtymonline(word: string): Promise<string | null> {
  const normalizedWord = word.toLowerCase().trim().replace(/\s+/g, '-')
  const url = `https://www.etymonline.com/word/${encodeURIComponent(normalizedWord)}`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EtymologyExplorer/1.0 (educational project)',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null // Word not found
      }
      console.error(`Etymonline error: ${response.status}`)
      return null
    }

    const html = await response.text()

    // Extract the etymology text from the page
    // Look for the main content section
    // This regex pattern may need updating if site structure changes
    const contentMatch = html.match(
      /<section[^>]*class="[^"]*word__defination[^"]*"[^>]*>([\s\S]*?)<\/section>/i
    )

    if (!contentMatch) {
      // Try alternative pattern
      const altMatch = html.match(/<div[^>]*class="[^"]*word--C9UPa[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      if (!altMatch) return null
      return stripHtml(altMatch[1])
    }

    return stripHtml(contentMatch[1])
  } catch (error) {
    console.error('Etymonline fetch error:', error)
    return null
  }
}

/**
 * Remove HTML tags and clean up text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace nbsp
    .replace(/&amp;/g, '&') // Replace amp
    .replace(/&lt;/g, '<') // Replace lt
    .replace(/&gt;/g, '>') // Replace gt
    .replace(/&quot;/g, '"') // Replace quot
    .replace(/&#39;/g, "'") // Replace apostrophe
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .slice(0, 2000) // Limit length
}
```

**Testing:**
Create `__tests__/etymonline.test.ts`:

```typescript
import { fetchEtymonline } from '@/lib/etymonline'

describe('fetchEtymonline', () => {
  it('fetches etymology for a common word', async () => {
    const result = await fetchEtymonline('etymology')
    // May return null if scraping fails - that's OK, we have fallback
    if (result) {
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  }, 15000)

  it('returns null for nonsense words', async () => {
    const result = await fetchEtymonline('xyzabc123nonsense')
    expect(result).toBeNull()
  }, 15000)
})
```

**Note:** Scraping is inherently fragile. If tests fail due to HTML changes, update the regex patterns or rely more heavily on Wiktionary + Claude synthesis.

**Commit:** `feat: add Etymonline scraper for etymology data`

---

#### Task 2.3: Spell-Check / "Did You Mean" Service

**Goal:** Implement Levenshtein distance for typo suggestions against the GRE word list.

**Files to touch:**

- `lib/spellcheck.ts` — Create new file

**Implementation:**

Create `lib/spellcheck.ts`:

```typescript
import { WordSuggestion } from './types'
import greWordsData from '@/data/gre-words.json'

const greWords: string[] = greWordsData.words

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Get spelling suggestions for a word
 * @param input - The potentially misspelled word
 * @param maxSuggestions - Maximum number of suggestions to return (default: 3)
 * @param maxDistance - Maximum Levenshtein distance to consider (default: 3)
 * @returns Array of suggestions sorted by distance
 */
export function getSuggestions(
  input: string,
  maxSuggestions: number = 3,
  maxDistance: number = 3
): WordSuggestion[] {
  const normalizedInput = input.toLowerCase().trim()

  const suggestions: WordSuggestion[] = greWords
    .map((word) => ({
      word,
      distance: levenshteinDistance(normalizedInput, word),
    }))
    .filter((s) => s.distance <= maxDistance && s.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)

  return suggestions
}

/**
 * Check if a word exists in the GRE word list
 */
export function isKnownWord(word: string): boolean {
  return greWords.includes(word.toLowerCase().trim())
}

/**
 * Check if input looks like a typo (has close matches) vs nonsense
 */
export function isLikelyTypo(input: string): boolean {
  const suggestions = getSuggestions(input, 1, 2)
  return suggestions.length > 0
}
```

**Testing:**
Create `__tests__/spellcheck.test.ts`:

```typescript
import { getSuggestions, isKnownWord, isLikelyTypo } from '@/lib/spellcheck'

describe('spellcheck', () => {
  describe('getSuggestions', () => {
    it('suggests corrections for typos', () => {
      const suggestions = getSuggestions('perfidous') // missing 'i'
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions[0].word).toBe('perfidious')
    })

    it('returns empty array for very different words', () => {
      const suggestions = getSuggestions('xyzabc')
      expect(suggestions).toEqual([])
    })

    it('respects maxSuggestions', () => {
      const suggestions = getSuggestions('per', 5, 5)
      expect(suggestions.length).toBeLessThanOrEqual(5)
    })
  })

  describe('isKnownWord', () => {
    it('returns true for words in list', () => {
      expect(isKnownWord('ephemeral')).toBe(true)
      expect(isKnownWord('EPHEMERAL')).toBe(true) // case insensitive
    })

    it('returns false for unknown words', () => {
      expect(isKnownWord('xyzabc')).toBe(false)
    })
  })

  describe('isLikelyTypo', () => {
    it('returns true for close misspellings', () => {
      expect(isLikelyTypo('perfidous')).toBe(true)
    })

    it('returns false for nonsense', () => {
      expect(isLikelyTypo('sdgukdasbids')).toBe(false)
    })
  })
})
```

**Commit:** `feat: add Levenshtein-based spell-check service`

---

#### Task 2.4: Word List Utilities

**Goal:** Create helper functions for the GRE word list (random selection, etc.).

**Files to touch:**

- `lib/wordlist.ts` — Create new file

**Implementation:**

Create `lib/wordlist.ts`:

```typescript
import greWordsData from '@/data/gre-words.json'

const greWords: string[] = greWordsData.words

/**
 * Get a random word from the GRE list
 * Uses crypto for true randomness (not LLM-biased)
 */
export function getRandomWord(): string {
  // Use crypto.getRandomValues for better randomness in browser/Node
  const array = new Uint32Array(1)

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    // Fallback for environments without crypto
    array[0] = Math.floor(Math.random() * 0xffffffff)
  }

  const index = array[0] % greWords.length
  return greWords[index]
}

/**
 * Get multiple random words (for batch suggestions)
 */
export function getRandomWords(count: number): string[] {
  const selected = new Set<string>()

  while (selected.size < count && selected.size < greWords.length) {
    selected.add(getRandomWord())
  }

  return Array.from(selected)
}

/**
 * Get total word count
 */
export function getWordCount(): number {
  return greWords.length
}

/**
 * Search words that start with a prefix
 */
export function searchByPrefix(prefix: string, limit: number = 10): string[] {
  const normalized = prefix.toLowerCase().trim()
  return greWords.filter((word) => word.startsWith(normalized)).slice(0, limit)
}
```

**Testing:**
Create `__tests__/wordlist.test.ts`:

```typescript
import { getRandomWord, getRandomWords, searchByPrefix } from '@/lib/wordlist'

describe('wordlist', () => {
  describe('getRandomWord', () => {
    it('returns a string', () => {
      const word = getRandomWord()
      expect(typeof word).toBe('string')
      expect(word.length).toBeGreaterThan(0)
    })

    it('returns different words over multiple calls (probabilistic)', () => {
      const words = new Set<string>()
      for (let i = 0; i < 20; i++) {
        words.add(getRandomWord())
      }
      // Should have at least a few different words
      expect(words.size).toBeGreaterThan(5)
    })
  })

  describe('getRandomWords', () => {
    it('returns requested number of unique words', () => {
      const words = getRandomWords(5)
      expect(words.length).toBe(5)
      expect(new Set(words).size).toBe(5) // all unique
    })
  })

  describe('searchByPrefix', () => {
    it('finds words starting with prefix', () => {
      const words = searchByPrefix('per')
      expect(words.length).toBeGreaterThan(0)
      words.forEach((w) => expect(w.startsWith('per')).toBe(true))
    })
  })
})
```

**Commit:** `feat: add word list utilities with crypto randomness`

---

#### Task 2.5: Claude Prompt Templates

**Goal:** Define the system and user prompts for Claude Haiku etymology synthesis.

**Files to touch:**

- `lib/prompts.ts` — Create new file

**Implementation:**

Create `lib/prompts.ts`:

```typescript
/**
 * Prompt templates for Claude Haiku etymology synthesis
 */

export const SYSTEM_PROMPT = `You are an etymology expert who makes word origins memorable and fascinating. You help vocabulary learners (especially GRE/TOEFL students) understand words deeply through their roots.

Your responses must be valid JSON matching this exact structure:
{
  "word": "the word",
  "pronunciation": "IPA pronunciation like /pərˈfɪdiəs/",
  "definition": "brief 5-10 word definition",
  "roots": [
    {
      "root": "root morpheme",
      "origin": "language of origin (Latin, Greek, Old English, etc.)",
      "meaning": "what this root means",
      "relatedWords": ["6-8 GRE-level words sharing this root"]
    }
  ],
  "lore": "2-3 sentences of memorable etymology narrative - make it stick! Include historical context, cultural significance, or interesting evolution.",
  "sources": ["list which sources contributed: etymonline, wiktionary, or synthesized"]
}

Guidelines:
- Prioritize GRE/TOEFL-relevant related words over obscure terms
- Make the lore memorable and interesting - this is what helps learners remember
- Be accurate about language origins (Latin, Greek, Proto-Indo-European, Old French, etc.)
- If the word has multiple roots, include all of them
- Keep the definition brief - we're not a dictionary
- Output ONLY valid JSON, no markdown or explanation`

/**
 * Build the user prompt with source data
 */
export function buildUserPrompt(
  word: string,
  etymonlineData: string | null,
  wiktionaryData: string | null
): string {
  let prompt = `Analyze the etymology of: "${word}"\n\n`

  if (etymonlineData) {
    prompt += `=== Etymonline data ===\n${etymonlineData}\n\n`
  }

  if (wiktionaryData) {
    prompt += `=== Wiktionary data ===\n${wiktionaryData}\n\n`
  }

  if (!etymonlineData && !wiktionaryData) {
    prompt += `(No source data available - synthesize from your training knowledge)\n\n`
  }

  prompt += `Extract the etymology following the JSON schema in your instructions.`

  return prompt
}

/**
 * Quirky error messages for invalid inputs
 */
export const QUIRKY_MESSAGES = {
  nonsense: [
    "That's not a word — though it does have a certain Proto-Keyboard charm.",
    "Hmm, that sequence of letters hasn't made it into any dictionary... yet.",
    "Not a recognized word — perhaps it's from a language yet to be invented?",
    "That doesn't appear in our lexicon, but points for creativity!",
    'No etymology found — this word seems to exist only in the quantum realm.',
  ],
  empty: [
    'The search bar awaits your curiosity...',
    'Type a word to begin your etymological adventure.',
    'Enter a word and discover its hidden roots.',
  ],
}

/**
 * Get a random quirky message
 */
export function getQuirkyMessage(type: 'nonsense' | 'empty'): string {
  const messages = QUIRKY_MESSAGES[type]
  const index = Math.floor(Math.random() * messages.length)
  return messages[index]
}
```

**Commit:** `feat: add Claude prompt templates for etymology synthesis`

---

#### Task 2.6: Claude API Service

**Goal:** Create the service that calls Claude Haiku with the etymology prompt.

**Files to touch:**

- `lib/claude.ts` — Create new file

**Implementation:**

Create `lib/claude.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { EtymologyResult, RawSourceData } from './types'
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts'

/**
 * Call Claude Haiku to synthesize etymology from source data
 */
export async function synthesizeEtymology(
  word: string,
  sourceData: RawSourceData,
  apiKey: string
): Promise<EtymologyResult> {
  const client = new Anthropic({
    apiKey,
  })

  const userPrompt = buildUserPrompt(
    word,
    sourceData.etymonline ?? null,
    sourceData.wiktionary ?? null
  )

  const response = await client.messages.create({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  })

  // Extract text content from response
  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  // Parse JSON response
  try {
    const result = JSON.parse(textContent.text) as EtymologyResult

    // Determine sources used
    result.sources = []
    if (sourceData.etymonline) result.sources.push('etymonline')
    if (sourceData.wiktionary) result.sources.push('wiktionary')
    if (result.sources.length === 0) result.sources.push('synthesized')

    return result
  } catch (parseError) {
    console.error('Failed to parse Claude response:', textContent.text)
    throw new Error('Invalid JSON response from Claude')
  }
}
```

**Dependencies:**

```bash
npm install @anthropic-ai/sdk
```

**Testing:**
Create `__tests__/claude.test.ts`:

```typescript
import { synthesizeEtymology } from '@/lib/claude'

// Skip in CI - requires real API key
describe.skip('claude synthesis', () => {
  it('synthesizes etymology for a word', async () => {
    const result = await synthesizeEtymology(
      'perfidious',
      {
        etymonline: 'from Latin perfidiosus, from perfidia "faithlessness"',
        wiktionary: 'From Latin perfidus ("faithless")',
      },
      process.env.ANTHROPIC_API_KEY!
    )

    expect(result.word).toBe('perfidious')
    expect(result.roots.length).toBeGreaterThan(0)
    expect(result.lore.length).toBeGreaterThan(0)
  }, 30000)
})
```

**Commit:** `feat: add Claude API service for etymology synthesis`

---

### Phase 3: API Routes

---

#### Task 3.1: Main Etymology API Route

**Goal:** Create the main `/api/etymology` endpoint that orchestrates the pipeline.

**Files to touch:**

- `app/api/etymology/route.ts` — Create new file

**Implementation:**

Create `app/api/etymology/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { EtymologyRequest, EtymologyResult, ApiResponse } from '@/lib/types'
import { fetchWiktionary } from '@/lib/wiktionary'
import { fetchEtymonline } from '@/lib/etymonline'
import { synthesizeEtymology } from '@/lib/claude'
import { isKnownWord, isLikelyTypo, getSuggestions } from '@/lib/spellcheck'
import { getRandomWord } from '@/lib/wordlist'
import { getQuirkyMessage } from '@/lib/prompts'

export async function POST(request: NextRequest) {
  try {
    const body: EtymologyRequest = await request.json()
    const { word, apiKey } = body

    // Validate inputs
    if (!word || typeof word !== 'string') {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: 'Word is required',
        },
        { status: 400 }
      )
    }

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: 'API key is required',
        },
        { status: 400 }
      )
    }

    const normalizedWord = word.toLowerCase().trim()

    // Check if it's empty
    if (!normalizedWord) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: getQuirkyMessage('empty'),
        },
        { status: 400 }
      )
    }

    // Check if it looks like nonsense or a typo
    const looksLikeWord = /^[a-zA-Z]+$/.test(normalizedWord)
    if (!looksLikeWord) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: getQuirkyMessage('nonsense'),
        },
        { status: 400 }
      )
    }

    // Fetch from sources in parallel
    const [etymonlineData, wiktionaryData] = await Promise.all([
      fetchEtymonline(normalizedWord),
      fetchWiktionary(normalizedWord),
    ])

    // If no source data found, check if it's a typo
    if (!etymonlineData && !wiktionaryData) {
      if (isLikelyTypo(normalizedWord)) {
        const suggestions = getSuggestions(normalizedWord)
        return NextResponse.json<ApiResponse<{ suggestions: string[] }>>(
          {
            success: false,
            error: `Hmm, we couldn't find "${word}". Did you mean:`,
            data: { suggestions: suggestions.map((s) => s.word) },
          },
          { status: 404 }
        )
      } else {
        // True nonsense - suggest a random word
        const suggestion = getRandomWord()
        return NextResponse.json<ApiResponse<{ suggestion: string }>>(
          {
            success: false,
            error: getQuirkyMessage('nonsense'),
            data: { suggestion },
          },
          { status: 404 }
        )
      }
    }

    // Synthesize with Claude
    const result = await synthesizeEtymology(
      normalizedWord,
      { etymonline: etymonlineData, wiktionary: wiktionaryData },
      apiKey
    )

    return NextResponse.json<ApiResponse<EtymologyResult>>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Etymology API error:', error)

    // Check for Anthropic API errors
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('invalid_api_key')) {
        return NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: 'Invalid API key. Please check your Anthropic API key in settings.',
          },
          { status: 401 }
        )
      }
      if (error.message.includes('429')) {
        return NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: 'Rate limit exceeded. Please wait a moment and try again.',
          },
          { status: 429 }
        )
      }
    }

    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 }
    )
  }
}
```

**Verification:**

```bash
# Start dev server
npm run dev

# Test with curl (replace YOUR_API_KEY)
curl -X POST http://localhost:3000/api/etymology \
  -H "Content-Type: application/json" \
  -d '{"word": "perfidious", "apiKey": "YOUR_API_KEY"}'
```

**Commit:** `feat: add main etymology API route with pipeline orchestration`

---

#### Task 3.2: Random Word API Route

**Goal:** Create `/api/random-word` endpoint for the "Surprise me" feature.

**Files to touch:**

- `app/api/random-word/route.ts` — Create new file

**Implementation:**

Create `app/api/random-word/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getRandomWord } from '@/lib/wordlist'
import { ApiResponse } from '@/lib/types'

export async function GET() {
  const word = getRandomWord()

  return NextResponse.json<ApiResponse<{ word: string }>>({
    success: true,
    data: { word },
  })
}
```

**Verification:**

```bash
curl http://localhost:3000/api/random-word
# Should return something like: {"success":true,"data":{"word":"ephemeral"}}

# Run multiple times - should get different words
for i in {1..5}; do curl -s http://localhost:3000/api/random-word | jq '.data.word'; done
```

**Commit:** `feat: add random word API route`

---

#### Task 3.3: Suggestions API Route

**Goal:** Create `/api/suggestions` endpoint for typo correction.

**Files to touch:**

- `app/api/suggestions/route.ts` — Create new file

**Implementation:**

Create `app/api/suggestions/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSuggestions, isKnownWord } from '@/lib/spellcheck'
import { ApiResponse, WordSuggestion } from '@/lib/types'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')

  if (!query) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: 'Query parameter "q" is required',
      },
      { status: 400 }
    )
  }

  // If it's a known word, return it as the only suggestion
  if (isKnownWord(query)) {
    return NextResponse.json<ApiResponse<{ suggestions: WordSuggestion[] }>>({
      success: true,
      data: {
        suggestions: [{ word: query.toLowerCase(), distance: 0 }],
      },
    })
  }

  const suggestions = getSuggestions(query)

  return NextResponse.json<ApiResponse<{ suggestions: WordSuggestion[] }>>({
    success: true,
    data: { suggestions },
  })
}
```

**Verification:**

```bash
# Test typo
curl "http://localhost:3000/api/suggestions?q=perfidous"
# Should return perfidious, perfidy, etc.

# Test known word
curl "http://localhost:3000/api/suggestions?q=ephemeral"
# Should return ephemeral with distance 0
```

**Commit:** `feat: add suggestions API route for typo correction`

---

### Phase 4: Frontend Components

---

#### Task 4.1: Custom Hooks for localStorage

**Goal:** Create reusable hooks for localStorage (API key, history).

**Files to touch:**

- `lib/hooks/useLocalStorage.ts` — Create new file
- `lib/hooks/useHistory.ts` — Create new file

**Implementation:**

Create `lib/hooks/useLocalStorage.ts`:

```typescript
'use client'

import { useState, useEffect } from 'react'

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(initialValue)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (item) {
        setStoredValue(JSON.parse(item))
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
    }
    setIsHydrated(true)
  }, [key])

  // Return a wrapped version of useState's setter
  const setValue = (value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error)
    }
  }

  return [storedValue, setValue]
}
```

Create `lib/hooks/useHistory.ts`:

```typescript
'use client'

import { useLocalStorage } from './useLocalStorage'
import { HistoryEntry } from '../types'

const MAX_HISTORY_SIZE = 50

export function useHistory() {
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>('etymology-history', [])

  const addToHistory = (word: string) => {
    setHistory((prev) => {
      // Remove if already exists (we'll add to front)
      const filtered = prev.filter((entry) => entry.word !== word.toLowerCase())

      // Add to front
      const newEntry: HistoryEntry = {
        word: word.toLowerCase(),
        timestamp: Date.now(),
      }

      // Keep max size
      return [newEntry, ...filtered].slice(0, MAX_HISTORY_SIZE)
    })
  }

  const clearHistory = () => {
    setHistory([])
  }

  const removeFromHistory = (word: string) => {
    setHistory((prev) => prev.filter((entry) => entry.word !== word.toLowerCase()))
  }

  return {
    history,
    addToHistory,
    clearHistory,
    removeFromHistory,
  }
}
```

**Commit:** `feat: add localStorage hooks for persistence`

---

#### Task 4.2: SearchBar Component

**Goal:** Create the central search bar with URL sync.

**Files to touch:**

- `components/SearchBar.tsx` — Create new file

**Implementation:**

Create `components/SearchBar.tsx`:

```typescript
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface SearchBarProps {
  onSearch: (word: string) => void
  isLoading?: boolean
  initialValue?: string
}

export function SearchBar({ onSearch, isLoading, initialValue = '' }: SearchBarProps) {
  const [value, setValue] = useState(initialValue)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Sync with URL on mount
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && q !== value) {
      setValue(q)
    }
  }, [searchParams])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = value.trim()
      if (trimmed && !isLoading) {
        // Update URL
        router.push(`/?q=${encodeURIComponent(trimmed)}`, { scroll: false })
        onSearch(trimmed)
      }
    },
    [value, isLoading, onSearch, router]
  )

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-content mx-auto">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter a word to explore its roots..."
          disabled={isLoading}
          className="w-full px-6 py-4 text-xl bg-white border-2 border-cream-dark
                     rounded-lg shadow-sm focus:outline-none focus:border-charcoal-light
                     focus:ring-1 focus:ring-charcoal-light transition-colors
                     placeholder:text-charcoal-light/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2
                     text-charcoal-light hover:text-charcoal transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Search"
        >
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <SearchIcon />
          )}
        </button>
      </div>
    </form>
  )
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
    </svg>
  )
}
```

**Commit:** `feat: add SearchBar component with URL sync`

---

#### Task 4.3: EtymologyCard Component

**Goal:** Create the main result display component.

**Files to touch:**

- `components/EtymologyCard.tsx` — Create new file

**Implementation:**

Create `components/EtymologyCard.tsx`:

```typescript
'use client'

import { EtymologyResult } from '@/lib/types'
import { RootChip } from './RootChip'
import { RelatedWordsList } from './RelatedWordsList'

interface EtymologyCardProps {
  result: EtymologyResult
  onWordClick: (word: string) => void
}

export function EtymologyCard({ result, onWordClick }: EtymologyCardProps) {
  return (
    <article className="w-full max-w-content mx-auto animate-fadeIn">
      {/* Header: Word, pronunciation, definition */}
      <header className="mb-6">
        <h1 className="text-4xl font-bold mb-2">{result.word}</h1>
        <p className="text-charcoal-light mb-2 font-mono text-sm">
          {result.pronunciation}
        </p>
        <p className="text-xl italic text-charcoal-light">
          "{result.definition}"
        </p>
      </header>

      {/* Root breakdown */}
      <section className="mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {result.roots.map((root, index) => (
            <RootChip
              key={`${root.root}-${index}`}
              root={root}
              onWordClick={onWordClick}
            />
          ))}
        </div>
      </section>

      {/* Lore / Etymology narrative */}
      <section className="mb-8 p-4 bg-cream-dark/50 rounded-lg border-l-4 border-charcoal-light/30">
        <p className="text-lg leading-relaxed">
          {result.lore}
        </p>
      </section>

      {/* Source citations */}
      <footer className="text-sm text-charcoal-light mb-8">
        Sources: {result.sources.map(s =>
          s === 'synthesized' ? 'Knowledge base' :
          s.charAt(0).toUpperCase() + s.slice(1)
        ).join(', ')}
      </footer>

      {/* Divider */}
      <hr className="border-cream-dark my-8" />

      {/* Related words by root */}
      <section>
        <RelatedWordsList roots={result.roots} onWordClick={onWordClick} />
      </section>
    </article>
  )
}
```

Add animation to `app/globals.css`:

```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}
```

**Commit:** `feat: add EtymologyCard component for result display`

---

#### Task 4.4: RootChip Component (Expandable)

**Goal:** Create clickable root tags that expand inline to show more words.

**Files to touch:**

- `components/RootChip.tsx` — Create new file

**Implementation:**

Create `components/RootChip.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Root } from '@/lib/types'

interface RootChipProps {
  root: Root
  onWordClick: (word: string) => void
}

export function RootChip({ root, onWordClick }: RootChipProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="inline-block">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                   border-2 transition-all duration-200 text-sm
                   ${isExpanded
                     ? 'bg-charcoal text-cream border-charcoal'
                     : 'bg-white border-cream-dark hover:border-charcoal-light'
                   }`}
      >
        <span className="font-semibold">{root.root}</span>
        <span className="text-xs opacity-70">·</span>
        <span className="opacity-70">{root.origin}</span>
        <ChevronIcon expanded={isExpanded} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-2 ml-2 pl-4 border-l-2 border-cream-dark animate-fadeIn">
          <p className="text-sm text-charcoal-light mb-2">
            <span className="font-medium">Meaning:</span> {root.meaning}
          </p>
          <div className="flex flex-wrap gap-1">
            {root.relatedWords.map((word) => (
              <button
                key={word}
                onClick={() => onWordClick(word)}
                className="px-2 py-0.5 text-sm bg-cream-dark/50 rounded
                         hover:bg-cream-dark transition-colors cursor-pointer"
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}
```

**Commit:** `feat: add RootChip component with inline expansion`

---

#### Task 4.5: RelatedWordsList Component

**Goal:** Display related words grouped by root at the bottom of results.

**Files to touch:**

- `components/RelatedWordsList.tsx` — Create new file

**Implementation:**

Create `components/RelatedWordsList.tsx`:

```typescript
'use client'

import { Root } from '@/lib/types'

interface RelatedWordsListProps {
  roots: Root[]
  onWordClick: (word: string) => void
}

export function RelatedWordsList({ roots, onWordClick }: RelatedWordsListProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {roots.map((root, index) => (
        <div key={`${root.root}-${index}`}>
          <h3 className="text-sm font-medium text-charcoal-light mb-2">
            From '{root.root}' ({root.meaning})
          </h3>
          <div className="space-y-1">
            {root.relatedWords.map((word) => (
              <button
                key={word}
                onClick={() => onWordClick(word)}
                className="flex items-center gap-2 w-full text-left px-2 py-1
                         rounded hover:bg-cream-dark/50 transition-colors group"
              >
                <span className="text-charcoal-light group-hover:text-charcoal">
                  →
                </span>
                <span className="group-hover:underline">{word}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Commit:** `feat: add RelatedWordsList component`

---

#### Task 4.6: HistorySidebar Component

**Goal:** Create collapsible history sidebar showing exploration trail.

**Files to touch:**

- `components/HistorySidebar.tsx` — Create new file

**Implementation:**

Create `components/HistorySidebar.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { HistoryEntry } from '@/lib/types'

interface HistorySidebarProps {
  history: HistoryEntry[]
  onWordClick: (word: string) => void
  onClear: () => void
}

export function HistorySidebar({ history, onWordClick, onClear }: HistorySidebarProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (history.length === 0) {
    return null
  }

  return (
    <>
      {/* Toggle button - fixed position */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-4 top-1/2 -translate-y-1/2 z-40
                   p-2 bg-white border-2 border-cream-dark rounded-full
                   shadow-lg hover:border-charcoal-light transition-all
                   md:left-6"
        aria-label="Toggle history"
      >
        <HistoryIcon />
        {history.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-charcoal
                         text-cream text-xs rounded-full flex items-center justify-center">
            {history.length}
          </span>
        )}
      </button>

      {/* Sidebar panel */}
      <div
        className={`fixed left-0 top-0 h-full w-72 bg-white border-r-2 border-cream-dark
                   shadow-xl z-50 transform transition-transform duration-300
                   ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-4 border-b border-cream-dark flex items-center justify-between">
          <h2 className="font-bold text-lg">History</h2>
          <div className="flex gap-2">
            <button
              onClick={onClear}
              className="text-sm text-charcoal-light hover:text-charcoal"
            >
              Clear
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-cream-dark rounded"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-60px)]">
          <ul className="space-y-1">
            {history.map((entry, index) => (
              <li key={`${entry.word}-${entry.timestamp}`}>
                <button
                  onClick={() => {
                    onWordClick(entry.word)
                    setIsOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 rounded hover:bg-cream-dark/50
                           transition-colors flex items-center gap-2"
                >
                  {index === 0 && (
                    <span className="w-2 h-2 bg-charcoal rounded-full" />
                  )}
                  {index > 0 && (
                    <span className="w-2 h-2 border border-charcoal-light rounded-full" />
                  )}
                  <span>{entry.word}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}

function HistoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
```

**Commit:** `feat: add HistorySidebar component`

---

#### Task 4.7: SettingsModal Component

**Goal:** Create modal for API key input.

**Files to touch:**

- `components/SettingsModal.tsx` — Create new file

**Implementation:**

Create `components/SettingsModal.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  apiKey: string
  onSave: (key: string) => void
}

export function SettingsModal({ isOpen, onClose, apiKey, onSave }: SettingsModalProps) {
  const [inputValue, setInputValue] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    setInputValue(apiKey)
  }, [apiKey, isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    onSave(inputValue.trim())
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter') handleSave()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                   w-full max-w-md bg-white rounded-lg shadow-2xl z-50 p-6"
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-xl font-bold mb-4">Settings</h2>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            Anthropic API Key
          </label>
          <p className="text-sm text-charcoal-light mb-3">
            Your API key is stored locally in your browser and never sent to our servers.{' '}
            <a
              href="https://console.anthropic.com/account/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-charcoal"
            >
              Get an API key →
            </a>
          </p>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-4 py-2 border-2 border-cream-dark rounded-lg
                       focus:outline-none focus:border-charcoal-light pr-20"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1
                       text-sm text-charcoal-light hover:text-charcoal"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-charcoal-light hover:text-charcoal transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-charcoal text-cream rounded-lg
                     hover:bg-charcoal-light transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </>
  )
}
```

**Commit:** `feat: add SettingsModal component for API key management`

---

#### Task 4.8: SurpriseButton and ErrorState Components

**Goal:** Create the "Surprise me" button and quirky error states.

**Files to touch:**

- `components/SurpriseButton.tsx` — Create new file
- `components/ErrorState.tsx` — Create new file

**Implementation:**

Create `components/SurpriseButton.tsx`:

```typescript
'use client'

interface SurpriseButtonProps {
  onClick: () => void
  isLoading?: boolean
}

export function SurpriseButton({ onClick, isLoading }: SurpriseButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="px-4 py-2 text-charcoal-light hover:text-charcoal
               transition-colors disabled:opacity-50 disabled:cursor-not-allowed
               flex items-center gap-2"
    >
      <span>✨</span>
      <span>Surprise me</span>
    </button>
  )
}
```

Create `components/ErrorState.tsx`:

```typescript
'use client'

interface ErrorStateProps {
  message: string
  suggestions?: string[]
  randomSuggestion?: string
  onSuggestionClick: (word: string) => void
}

export function ErrorState({
  message,
  suggestions,
  randomSuggestion,
  onSuggestionClick,
}: ErrorStateProps) {
  return (
    <div className="w-full max-w-content mx-auto text-center py-12 animate-fadeIn">
      <p className="text-xl mb-6 text-charcoal-light">{message}</p>

      {/* Typo suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((word) => (
            <button
              key={word}
              onClick={() => onSuggestionClick(word)}
              className="block mx-auto px-4 py-2 hover:bg-cream-dark/50
                       rounded transition-colors"
            >
              → {word}
            </button>
          ))}
        </div>
      )}

      {/* Random word suggestion for nonsense */}
      {randomSuggestion && !suggestions && (
        <div className="mt-4">
          <p className="text-charcoal-light mb-2">Perhaps you'd enjoy exploring:</p>
          <button
            onClick={() => onSuggestionClick(randomSuggestion)}
            className="px-4 py-2 hover:bg-cream-dark/50 rounded transition-colors"
          >
            → {randomSuggestion}
          </button>
        </div>
      )}
    </div>
  )
}
```

**Commit:** `feat: add SurpriseButton and ErrorState components`

---

### Phase 5: Main Page Assembly

---

#### Task 5.1: Assemble Main Page

**Goal:** Wire everything together in the main page.

**Files to touch:**

- `app/page.tsx` — Replace default content

**Implementation:**

Replace `app/page.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SearchBar } from '@/components/SearchBar'
import { EtymologyCard } from '@/components/EtymologyCard'
import { HistorySidebar } from '@/components/HistorySidebar'
import { SettingsModal } from '@/components/SettingsModal'
import { SurpriseButton } from '@/components/SurpriseButton'
import { ErrorState } from '@/components/ErrorState'
import { useLocalStorage } from '@/lib/hooks/useLocalStorage'
import { useHistory } from '@/lib/hooks/useHistory'
import { EtymologyResult, ApiResponse } from '@/lib/types'

function HomeContent() {
  const searchParams = useSearchParams()
  const [apiKey, setApiKey] = useLocalStorage('etymology-api-key', '')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<EtymologyResult | null>(null)
  const [error, setError] = useState<{
    message: string
    suggestions?: string[]
    randomSuggestion?: string
  } | null>(null)
  const { history, addToHistory, clearHistory } = useHistory()

  // Handle search
  const handleSearch = useCallback(async (word: string) => {
    if (!apiKey) {
      setIsSettingsOpen(true)
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/etymology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, apiKey }),
      })

      const data: ApiResponse<EtymologyResult | { suggestions?: string[]; suggestion?: string }> =
        await response.json()

      if (data.success && data.data && 'word' in data.data) {
        setResult(data.data as EtymologyResult)
        addToHistory(word)
      } else {
        setError({
          message: data.error || 'Something went wrong',
          suggestions: (data.data as { suggestions?: string[] })?.suggestions,
          randomSuggestion: (data.data as { suggestion?: string })?.suggestion,
        })
      }
    } catch (err) {
      setError({ message: 'Network error. Please check your connection.' })
    } finally {
      setIsLoading(false)
    }
  }, [apiKey, addToHistory])

  // Handle surprise me
  const handleSurprise = useCallback(async () => {
    try {
      const response = await fetch('/api/random-word')
      const data: ApiResponse<{ word: string }> = await response.json()
      if (data.success && data.data) {
        handleSearch(data.data.word)
      }
    } catch (err) {
      setError({ message: 'Failed to get random word' })
    }
  }, [handleSearch])

  // Handle URL-based search on mount/change
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && apiKey) {
      handleSearch(q)
    }
  }, [searchParams, apiKey]) // Don't include handleSearch to avoid infinite loop

  return (
    <main className="min-h-screen pb-20">
      {/* Settings button */}
      <button
        onClick={() => setIsSettingsOpen(true)}
        className="fixed top-4 right-4 p-2 text-charcoal-light hover:text-charcoal
                 transition-colors z-30"
        aria-label="Settings"
      >
        <SettingsIcon />
      </button>

      {/* History sidebar */}
      <HistorySidebar
        history={history}
        onWordClick={handleSearch}
        onClear={clearHistory}
      />

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 pt-20">
        {/* Header - only show when no result */}
        {!result && !isLoading && !error && (
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-2">Etymology Explorer</h1>
            <p className="text-charcoal-light">
              Discover the roots and origins of words
            </p>
          </header>
        )}

        {/* Search bar */}
        <div className="mb-8">
          <SearchBar
            onSearch={handleSearch}
            isLoading={isLoading}
            initialValue={searchParams.get('q') || ''}
          />

          {/* Surprise me button - only when no result shown */}
          {!result && !isLoading && (
            <div className="flex justify-center mt-4">
              <SurpriseButton onClick={handleSurprise} isLoading={isLoading} />
            </div>
          )}
        </div>

        {/* API key prompt */}
        {!apiKey && !isSettingsOpen && (
          <div className="text-center py-8">
            <p className="text-charcoal-light mb-4">
              To explore etymologies, add your Anthropic API key
            </p>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-2 bg-charcoal text-cream rounded-lg
                       hover:bg-charcoal-light transition-colors"
            >
              Add API Key
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-pulse">
              <p className="text-charcoal-light">Exploring etymology...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <ErrorState
            message={error.message}
            suggestions={error.suggestions}
            randomSuggestion={error.randomSuggestion}
            onSuggestionClick={handleSearch}
          />
        )}

        {/* Results */}
        {result && !isLoading && (
          <EtymologyCard result={result} onWordClick={handleSearch} />
        )}
      </div>

      {/* Settings modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        onSave={setApiKey}
      />
    </main>
  )
}

function SettingsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  )
}

// Wrap in Suspense for useSearchParams
export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <HomeContent />
    </Suspense>
  )
}
```

**Verification:**

```bash
npm run dev
# 1. Visit http://localhost:3000
# 2. Add API key via settings
# 3. Search for "perfidious"
# 4. Click on related words
# 5. Check history sidebar
# 6. Test "Surprise me"
# 7. Test typo: "perfidous"
# 8. Test nonsense: "sdgukdasbids"
```

**Commit:** `feat: assemble main page with all components`

---

### Phase 6: Polish & Deployment

---

#### Task 6.1: Add Meta Tags and Favicon

**Goal:** Improve SEO and social sharing.

**Files to touch:**

- `app/layout.tsx` — Enhance metadata
- `public/favicon.ico` — Add favicon (or use SVG)

**Implementation:**

Update `app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Etymology Explorer | Discover Word Origins',
  description: 'Explore the roots and origins of words. Break down vocabulary into etymological components, discover related words, and learn memorable word histories.',
  keywords: ['etymology', 'vocabulary', 'GRE', 'TOEFL', 'word origins', 'language learning'],
  openGraph: {
    title: 'Etymology Explorer',
    description: 'Discover the roots and origins of words',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Etymology Explorer',
    description: 'Discover the roots and origins of words',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
```

**Commit:** `chore: add metadata for SEO and social sharing`

---

#### Task 6.2: Mobile Responsiveness

**Goal:** Ensure the app works well on mobile devices.

**Files to review and adjust:**

- `components/HistorySidebar.tsx` — Make it a bottom sheet on mobile
- `components/EtymologyCard.tsx` — Stack root columns on mobile

**Key CSS adjustments (add to relevant components):**

```css
/* In globals.css */
@media (max-width: 768px) {
  /* History sidebar becomes bottom sheet on mobile */
  .mobile-bottom-sheet {
    @apply bottom-0 left-0 right-0 top-auto h-auto max-h-[60vh] w-full rounded-t-2xl;
  }
}
```

**Verification:**

- Test on Chrome DevTools mobile view
- Test landscape and portrait orientations
- Ensure touch targets are at least 44x44px

**Commit:** `style: improve mobile responsiveness`

---

#### Task 6.3: Deploy to Vercel

**Goal:** Deploy the app to Vercel.

**Steps:**

1. Push to GitHub:

```bash
git add .
git commit -m "chore: prepare for deployment"
git push origin main
```

2. Connect to Vercel:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Vercel auto-detects Next.js settings
   - Click "Deploy"

3. Configure domain (optional):
   - In Vercel dashboard → Settings → Domains
   - Add custom domain if desired

**Verification:**

- Visit your Vercel URL
- Test all features work in production
- Check for any console errors

**Commit:** No additional commit needed (Vercel deploys from existing commits)

---

## 5. Testing Strategy

### Unit Tests

- **Location:** `__tests__/` directory
- **Framework:** Jest + React Testing Library
- **Coverage target:** 70%+ for lib/ functions

### What to Test

| Module              | Test Focus                             |
| ------------------- | -------------------------------------- |
| `lib/spellcheck.ts` | Levenshtein accuracy, edge cases       |
| `lib/wordlist.ts`   | Randomness distribution, prefix search |
| `lib/wiktionary.ts` | API response parsing (mock fetch)      |
| `lib/etymonline.ts` | HTML parsing (mock fetch)              |
| `components/*`      | Render tests, interaction tests        |

### Running Tests

```bash
# Install test dependencies
npm install --save-dev jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom

# Create jest.config.js
npx jest --init

# Run all tests
npm test

# Run with coverage
npm test -- --coverage
```

### Integration Tests

- Test the `/api/etymology` route with mocked external APIs
- Test the full search flow in the UI

---

## 6. Documentation Updates

### README.md

Create a README with:

- Project description
- Local development setup
- How to add API key
- Technology stack
- Contributing guidelines

### Inline Comments

- Add JSDoc comments to all exported functions in `lib/`
- Document complex logic in components

---

## 7. Definition of Done

- [ ] All Phase 1-6 tasks completed
- [ ] App builds without errors: `npm run build`
- [ ] All tests passing: `npm test`
- [ ] Mobile responsive (tested on iPhone, Android)
- [ ] API key flow works correctly
- [ ] Search, history, and exploration features work
- [ ] Error states display correctly
- [ ] Deployed to Vercel and accessible
- [ ] README documentation complete

---

## Using This Plan with Claude Code

This written plan serves as a reference document. When actually implementing:

1. **Use Claude Code's plan mode** for interactive implementation
2. **Reference this doc** for specific code patterns and file structures
3. **Follow the task order** — dependencies are built in
4. **Commit after each task** — keeps history clean and reversible

Good luck with your GRE prep! 📚

---

_Generated via /brainstorm-plan on 2025-12-29_
