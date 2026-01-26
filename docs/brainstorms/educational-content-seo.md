# Educational Content Pages for SEO & AI Citation

## Overview

This feature adds educational content pages to Etymology Explorer, optimized for AI search citation and Google rich results. Based on Princeton's GEO research, structured FAQ content and educational guides with statistics, quotes, and clear hierarchies significantly increase citation rates by AI systems.

We'll create two initial pages:

1. **`/faq`** - Frequently asked questions with FAQPage schema for Google rich results
2. **`/learn/what-is-etymology`** - Comprehensive guide with definition-first format, statistics, and expert citations

Both pages use a content-driven architecture where visible content and structured data (JSON-LD) are generated from the same data source, ensuring they stay in sync.

## Goals

- **AI citation optimization**: Structure content for high citation rates by LLMs (definition-first paragraphs, statistics with specific numbers, expert quotes)
- **Google rich results**: FAQPage schema for FAQ accordion in search results
- **Single source of truth**: FAQ data drives both UI rendering and JSON-LD schema
- **Discoverable navigation**: Header links to FAQ and Learn section
- **Consistent design**: Match existing scholarly/editorial aesthetic (Libre Baskerville, cream/charcoal palette)
- **Sitemap inclusion**: Add new pages to `sitemap.xml` for search engine discovery

## Non-Goals

- **Not a CMS**: Content is static in code, no admin editing interface
- **Not comprehensive documentation**: Start with 2 pages, expand later (PIE languages, Latin roots, etc.)
- **Not dynamic content**: No user-generated FAQs or comments
- **No search within educational content**: Users use main search for word lookups

## User Experience

### Navigation Flow

```
┌─────────────────────────────────────────────────────┐
│  Etymology Explorer    [FAQ]  [Learn]  [Settings]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│              [ Search for a word... ]               │
│                                                     │
```

Header gains two new links:

- **FAQ** → `/faq`
- **Learn** → `/learn/what-is-etymology` (future: dropdown menu when more pages exist)

### FAQ Page (`/faq`)

- Clean Q&A format with expandable/collapsible questions (accordion)
- 5-7 questions covering: what is etymology, word origins breakdown (29% Latin, etc.), how words change, what is PIE, how to use this tool
- Each answer: 50-150 words, concise but complete
- Internal links to main search (e.g., "Try searching for 'nice' to see semantic shift")

### Etymology Guide (`/learn/what-is-etymology`)

- Long-form educational content (~1000-1500 words)
- Definition in first paragraph (AI citation optimization)
- Statistics section with specific numbers
- Expert quote with attribution
- Clear H2/H3 hierarchy
- Bulleted lists for processes (semantic shift, borrowing, etc.)
- Source citations at bottom

## Technical Approach

### File Structure

```
app/
├── faq/
│   └── page.tsx          # FAQ page with accordion UI
├── learn/
│   └── what-is-etymology/
│       └── page.tsx      # Educational guide
├── sitemap.ts            # Add new routes
└── layout.tsx            # Update: add header nav component

components/
├── Header.tsx            # New: shared header with nav links
├── FaqAccordion.tsx      # New: expandable Q&A component
└── FaqSchema.tsx         # New: generates FAQPage JSON-LD from data

data/
└── faq.ts                # FAQ content as typed array
```

### Content-Driven FAQ Architecture

```tsx
// data/faq.ts
export interface FaqItem {
  question: string
  answer: string // Can include markdown/links
}

export const faqs: FaqItem[] = [
  { question: 'What is etymology?', answer: '...' },
  // ...
]

// components/FaqSchema.tsx - consumes same data
export function FaqSchema({ faqs }: { faqs: FaqItem[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }
  return <script type="application/ld+json">...</script>
}
```

### Sitemap

Next.js App Router `sitemap.ts` exports URL entries. Add `/faq` and `/learn/what-is-etymology` with appropriate `lastModified` and `priority` values.

## Key Components

### 1. Header Component (`components/Header.tsx`)

- Logo/title linking to home
- Nav links: FAQ, Learn, Settings gear icon
- Responsive: collapses to hamburger on mobile (or stays minimal)
- Matches existing aesthetic (Libre Baskerville, cream/charcoal)

### 2. FAQ Accordion (`components/FaqAccordion.tsx`)

- Expandable/collapsible question items
- Uses `<details>`/`<summary>` for native accessibility (no JS required for basic function)
- Smooth open/close animation via CSS
- Supports markdown in answers (links to search, emphasis)

### 3. FAQ Schema (`components/FaqSchema.tsx`)

- Takes `FaqItem[]` as prop
- Generates valid FAQPage JSON-LD
- Strips markdown/HTML from answers for schema text (plain text only in schema)
- Renders as `<script type="application/ld+json">`

### 4. Sitemap (`app/sitemap.ts`)

- Returns array of `{ url, lastModified, changeFrequency, priority }`
- Home page: priority 1.0
- FAQ: priority 0.8
- Learn pages: priority 0.7

### 5. Page Metadata

Each new page exports Next.js `metadata` object with:

- Title (using template from layout)
- Description optimized for search
- OpenGraph tags
- Canonical URL

## Open Questions

1. **Header placement in existing UI**: Extract to shared `Header.tsx` used by all pages, or keep page-specific headers with nav links added to main page?

2. **Mobile navigation**: Hamburger menu or just smaller horizontal links?

3. **FAQ content scope**: Include "How to use this tool?" questions, or stay purely educational?

4. **Internal linking strategy**: How aggressively should educational content link to main search?

## Related Issues

- [Issue #17: Add FAQ schema for common etymology questions](https://github.com/thepushkarp/etymology-explorer/issues/17)
- [Issue #21: Add educational content pages for AI citation optimization](https://github.com/thepushkarp/etymology-explorer/issues/21)

---

_Generated via /brainstorm on 2026-01-17_
