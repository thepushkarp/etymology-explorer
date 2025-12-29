# Etymology Explorer

## Overview

**Etymology Explorer** is a minimal, elegant web tool for vocabulary learners (particularly GRE/TOEFL prep) who want to understand words deeply through their roots and origins.

At its core: a single search bar where you type a word and receive a rich breakdown of its etymological components - each root traced to its origin language, a compelling narrative about how the word evolved, and pathways to explore related words sharing those same roots.

The experience prioritizes curiosity-driven learning. Rather than just defining words, it reveals the _why_ behind language - showing how "comprehend" connects to "prehensile" through the Latin _prehendere_ (to grasp), making both words more memorable. This transforms vocabulary study from rote memorization into genuine discovery.

Built with Next.js and deployed on Vercel, it uses Claude Haiku as an intelligent synthesis layer that draws from Etymonline, Wiktionary, and Wikipedia, presenting information in a consistent, beautiful format while citing sources.

### Example Usage

You search for **"perfidious"** (a classic GRE word). The tool returns:

```
perfidious  /pərˈfɪdiəs/
"deceitful and untrustworthy"

┌─ per- (Latin: through, to destruction)
└─ fides (Latin: faith, trust)

→ Literally "through faith" in the destructive sense - one who
  breaks through the bonds of trust. The Romans used "perfidia"
  to describe treaty-breakers, the gravest accusation in a
  society built on sworn oaths.

Sources: Etymonline, Wiktionary

─────────────────────────────────────

From 'fides' (faith):         From 'per-' (through):
├─ fidelity                   ├─ pervasive
├─ confide                    ├─ pernicious
├─ diffident                  ├─ perpetual
└─ infidel                    └─ pervade
```

Clicking **"fides"** expands inline to show more words from that root. Clicking **"diffident"** triggers a new full search, and your history sidebar tracks: _perfidious → diffident_.

---

## Goals

- **Deep word understanding** — Break every word into constituent roots with origin languages (Latin, Greek, Old English, Proto-Indo-European, etc.) and explain how meanings combined/evolved

- **Memorable learning through story** — Provide a 2-3 sentence "lore" for each word that makes it stick (historical context, cultural significance, interesting evolution)

- **Root-based exploration** — Enable discovery of word families; searching "benevolent" should reveal connections to "benediction," "benefit," and "bonus" through the Latin _bene_ (well)

- **GRE/TOEFL vocabulary expansion** — Surface related words that are test-relevant (prioritize words like "sanguine," "laconic," "ephemeral" over obscure terms)

- **Curiosity-driven flow** — Support rabbit-hole exploration with inline root expansion + clickable words + persistent history trail

- **Source transparency** — Show which sources (Etymonline, Wiktionary, Wikipedia) contributed to each result

- **Minimal, distraction-free design** — Clean serif typography, ample whitespace, no ads or clutter — feels like a beautifully typeset reference book

- **Fast and reliable** — Hybrid caching ensures quick responses; graceful fallback if live sources fail

---

## Non-Goals

- **Not a dictionary** — We don't aim to provide comprehensive definitions, usage examples, or pronunciation guides; other tools do that well

- **Not a flashcard/spaced repetition system** — No quizzes, no "mark as learned," no spaced review schedules; this is exploration, not drilling

- **Not a full corpus search** — We won't index every English word upfront; etymology is fetched on-demand per search

- **Not multi-language** — English words only (though we'll show roots from Latin, Greek, etc., we won't let you search in those languages)

- **Not user accounts/social** — No login, no sharing progress, no leaderboards; local storage keeps it simple and private

- **Not a scraping service** — We synthesize and cite sources rather than reproducing their content wholesale; respect for Etymonline/Wiktionary

- **Not mobile-app** — Web-first, responsive design works on mobile browsers but no native app planned

- **Not AI chat** — Single-purpose tool; you search a word, you get etymology; no conversational back-and-forth

---

## User Experience

### Landing State

- Clean page with a single centered search bar, subtle placeholder text: _"Enter a word to explore its roots..."_
- Below: a "Surprise me" button that fetches a random GRE-worthy word
- History sidebar (collapsed by default, expands on hover/click) showing recent explorations from local storage

### Search Flow

1. User types "perfidious" and presses Enter (or clicks search icon)
2. URL updates to `etymologyexplorer.com/?q=perfidious` — bookmarkable, shareable
3. Brief loading state with subtle animation
4. Results appear: pronunciation, definition, root breakdown, lore, source citations, related words grouped by root

### Exploration Flow

- **Click a root** (e.g., "fides") → Expands inline to reveal more words from that root, without losing current context
- **Click a related word** (e.g., "diffident") → New search triggers, URL updates, word added to history sidebar
- **History sidebar** → Click any past word to revisit; shows trail like breadcrumbs

### Shareable URLs

- Every word lookup has a clean URL: `/?q=perfidious`
- Direct links work — sharing `/?q=ephemeral` with a friend loads that word immediately

### Graceful Fallbacks

**Nonsense input** (e.g., "sdgukdasbids") → Quirky acknowledgment + random suggestion (no auto-load):

```
"sdgukdasbids" 🤔

That's not a word — though it does have a certain
Proto-Keyboard charm.

Perhaps you'd enjoy exploring:

   → laconic
```

_Clicking "laconic" triggers the actual search._

**True randomness**: Maintain a curated list of ~500 GRE/TOEFL words server-side; pick randomly using `Math.random()` or crypto randomness — never ask the LLM to "pick a random word."

**Typo-like input** (e.g., "perfidous") → Show multiple suggestions:

```
Hmm, we couldn't find "perfidous". Did you mean:

   → perfidious
   → perfidy
   → tedious
```

_User clicks one to trigger actual search._

**Source fetch failure** → Falls back to Claude synthesis, notes "Etymology synthesized from knowledge base"

**Empty search** → _"The search bar awaits your curiosity..."_

### Visual Design

- Serif typeface (e.g., Libre Baskerville, Cormorant Garamond) for that classic, scholarly feel
- Warm off-white background (`#FDFBF7`), dark charcoal text (`#2C2C2C`)
- Generous whitespace, subtle dividers, no visual clutter
- Smooth transitions on expand/collapse, subtle fade-ins on load

---

## Technical Approach

### Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS
- **Backend**: Next.js API Routes (serverless functions on Vercel)
- **AI**: Claude Haiku via Anthropic API (user-provided key)
- **Hosting**: Vercel (free tier)
- **Storage**: Browser localStorage (history, favorites, API key)

### API Key Flow

1. User opens Settings modal (gear icon in corner)
2. Pastes their Anthropic API key → stored in localStorage (never sent to any server for storage)
3. On each search, frontend sends: `POST /api/etymology` with `{ word, apiKey }` in request body
4. API route uses key for that single request, returns result, discards key
5. No key? Friendly prompt to add one before searching

### Data Fetching Pipeline (Approach A: Pipeline)

```
User searches "perfidious"
         │
         ▼
┌─────────────────────────────────────────────┐
│  Next.js API Route: /api/etymology          │
│                                             │
│  1. Check cache (localStorage or Vercel KV) │
│     → If cached, return immediately         │
│                                             │
│  2. Fetch from sources (parallel):          │
│     • Etymonline (scrape/parse)             │
│     • Wiktionary API                        │
│                                             │
│  3. Send to Claude Haiku:                   │
│     "Given this raw data, extract:          │
│      - roots + origin languages             │
│      - etymology narrative (2-3 sentences)  │
│      - 4-6 related GRE words per root"      │
│                                             │
│  4. Cache result, return to client          │
└─────────────────────────────────────────────┘
```

This is a deterministic pipeline where the LLM is called once at the end to synthesize. Benefits:

- Fast: parallel fetches, single LLM call
- Cheap: one Haiku call per new word (~$0.0003)
- Predictable: same inputs → same flow
- Debuggable: you know exactly what's happening

**Future consideration**: Agentic approach (Approach B) where Claude has tools and decides what to fetch. More flexible but slower/costlier. Consider if sources often return sparse data.

### Caching Strategy

- Cache etymology results by word (they don't change)
- Options: Vercel KV (simple), or localStorage on client for repeat lookups
- Cache TTL: long (30+ days) — etymology doesn't expire

### Random Word List

- Curated JSON file of ~500 GRE/TOEFL words stored in repo
- Server-side `Math.random()` selection for "Surprise me" and fallback suggestions
- No LLM involvement in randomness

### Spell-check / "Did you mean"

- Lightweight: Levenshtein distance against the 500-word list
- Or: simple API like `datamuse.com/api` for suggestions

---

## Key Components

### Frontend (`/app`)

| Component          | Purpose                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `SearchBar`        | Central input with debounced submit, updates URL `?q=`               |
| `EtymologyCard`    | Main result display: word, pronunciation, definition, roots, lore    |
| `RootChip`         | Clickable root tag (e.g., "fides · Latin") — expands inline on click |
| `RelatedWordsList` | Words grouped by root, each clickable to trigger new search          |
| `HistorySidebar`   | Collapsible sidebar showing exploration trail from localStorage      |
| `SettingsModal`    | API key input, stored to localStorage                                |
| `SurpriseButton`   | "Random word" button, fetches from server's curated list             |
| `ErrorState`       | Quirky fallback UI for nonsense/typos with suggestions               |

### API Routes (`/app/api`)

| Route                     | Purpose                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/etymology`     | Main endpoint: receives `{ word, apiKey }`, orchestrates fetch → Claude → response |
| `GET /api/random-word`    | Returns random word from curated GRE list (no API key needed)                      |
| `GET /api/suggestions?q=` | Returns spell-check suggestions for typo-like input                                |

### Core Services (`/lib`)

| Module          | Purpose                                                |
| --------------- | ------------------------------------------------------ |
| `etymonline.ts` | Fetches & parses Etymonline page for a word            |
| `wiktionary.ts` | Fetches Wiktionary API, extracts etymology section     |
| `claude.ts`     | Constructs prompt, calls Haiku, parses JSON response   |
| `cache.ts`      | Simple cache layer (Vercel KV or in-memory Map)        |
| `wordlist.ts`   | Loads curated GRE word list, provides random selection |
| `spellcheck.ts` | Levenshtein-based "did you mean" against word list     |

### Data & Config

| File                  | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `data/gre-words.json` | Curated ~500 GRE/TOEFL words for randomness & spell-check          |
| `lib/prompts.ts`      | System & user prompt templates for Claude                          |
| `lib/types.ts`        | TypeScript interfaces: `EtymologyResult`, `Root`, `WordSuggestion` |

### Styling

| Concern    | Approach                                                               |
| ---------- | ---------------------------------------------------------------------- |
| Typography | Libre Baskerville (serif) via Google Fonts                             |
| Colors     | Off-white background `#FDFBF7`, charcoal text `#2C2C2C`, muted accents |
| Layout     | Tailwind CSS, centered container, generous `max-w-2xl`                 |
| Animations | Subtle fade-ins, smooth expand/collapse via CSS transitions            |

---

## Open Questions

1. **Caching layer choice**
   - Vercel KV: Persistent across deploys, ~$0 at low usage, slight complexity
   - In-memory Map: Simplest, but resets on each deploy/cold start
   - Client localStorage only: No server caching, but repeated lookups fast per-user
   - _Leaning toward_: Start with client localStorage, add Vercel KV later if needed

2. **Etymonline scraping reliability**
   - They don't have a public API; HTML structure could change
   - _Mitigation_: Graceful fallback to Claude synthesis if parsing fails
   - _Alternative_: Rely more heavily on Wiktionary (has stable API) + Claude's training knowledge

3. **Rate limiting**
   - Should we limit requests per user to prevent API key abuse testing?
   - _Probably not needed_: Users bring their own keys, abuse is their problem
   - _Maybe_: Light rate limit (60 req/min) just to prevent accidental infinite loops

4. **"Expand root" data source**
   - When user clicks a root to see more related words, where do those come from?
   - _Leaning toward_: Ask Claude for 6-8 words per root in initial response (cheaper than extra calls)

5. **Mobile experience**
   - Sidebar history might be awkward on small screens
   - _Solution_: Bottom sheet or collapsed icon on mobile, expand on tap

6. **GRE word list source**
   - Need a good curated list of ~500 test-relevant words
   - _Options_: Magoosh GRE list, Manhattan Prep, or compile from multiple sources

---

_Generated via /brainstorm on 2025-12-29_
