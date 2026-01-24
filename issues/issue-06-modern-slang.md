# Issue #6: Add support for modern slangs

**Status:** Open
**Labels:** `enhancement`
**Created:** 2026-01-05
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/6

---

## Problem

Along with searching the current sources, also do a search engine + Wikipedia lookup, and if there's a modern slang connotation to the word, include that in the etymology as well.

## Implementation Context

### Current State

The agentic research pipeline in `lib/research.ts` currently fetches from two sources:

1. **Etymonline** (`lib/etymonline.ts`) - HTML scraping
2. **Wiktionary** (`lib/wiktionary.ts`) - MediaWiki API

The `EtymologyResult` type in `lib/types.ts` has a `lore` field for narrative context, but no dedicated field for modern usage/slang.

### Proposed Implementation

**1. Extend `lib/types.ts` with slang support:**

```typescript
interface EtymologyResult {
  // ... existing fields
  modernUsage?: ModernUsage
}

interface ModernUsage {
  hasSlangMeaning: boolean
  slangDefinition?: string // e.g., "In internet culture, 'slay' means..."
  popularizedBy?: string // e.g., "Popularized by drag culture in 2010s"
  contexts?: string[] // e.g., ["social media", "Gen Z", "gaming"]
  notableReferences?: string[] // e.g., ["Beyoncé's 2016 album"]
}
```

**2. Create Wikipedia API wrapper (`lib/wikipedia.ts`):**

```typescript
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'

interface WikipediaResult {
  extract: string // Plain text summary
  slangSection?: string // Content from "Slang" or "Modern usage" sections
  categories: string[] // For detecting slang-related categories
}

export async function fetchWikipedia(word: string): Promise<WikipediaResult | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: word,
    prop: 'extracts|categories',
    exintro: 'true',
    explaintext: 'true',
    origin: '*',
  })

  const response = await fetch(`${WIKIPEDIA_API}?${params}`)
  const data = await response.json()

  // Parse response...
  return result
}
```

**3. Add Urban Dictionary API (optional, for explicit slang):**

```typescript
// lib/urbanDictionary.ts
const URBAN_API = 'https://api.urbandictionary.com/v0/define'

export async function fetchUrbanDictionary(word: string) {
  const response = await fetch(`${URBAN_API}?term=${encodeURIComponent(word)}`)
  const data = await response.json()

  // Filter for high-upvote definitions
  return data.list.filter((def: any) => def.thumbs_up > 1000).slice(0, 3)
}
```

**4. Update research pipeline (`lib/research.ts`):**

```typescript
export async function conductResearch(word: string, config: Config) {
  // Existing sources
  const [etymonline, wiktionary] = await Promise.all([fetchEtymonline(word), fetchWiktionary(word)])

  // New sources for modern usage
  const [wikipedia, urbanDict] = await Promise.all([
    fetchWikipedia(word),
    fetchUrbanDictionary(word).catch(() => null), // Optional, may fail
  ])

  // Pass all context to LLM synthesis
  return synthesizeEtymology({
    word,
    etymonline,
    wiktionary,
    wikipedia, // New
    urbanDictionary: urbanDict, // New
    config,
  })
}
```

**5. Update LLM prompt (`lib/prompts.ts`):**

Add to system prompt:

```typescript
const MODERN_USAGE_INSTRUCTIONS = `
If the word has notable modern slang or internet culture meanings:
1. Include a "modernUsage" section in the response
2. Distinguish between the etymological origin and modern connotations
3. Note when/how the slang meaning emerged
4. Cite specific cultural references if relevant (songs, memes, communities)

Example for "slay":
- Etymology: From Old English "slēan" meaning "to strike, kill"
- Modern Usage: In LGBTQ+ and internet culture, "slay" means to do something exceptionally well or look amazing. Popularized by drag culture and mainstream through social media.
`
```

**6. Update JSON schema in `lib/prompts.ts`:**

```typescript
modernUsage: {
  type: "object",
  description: "Modern slang or cultural meanings distinct from etymology",
  properties: {
    hasSlangMeaning: { type: "boolean" },
    slangDefinition: { type: "string" },
    popularizedBy: { type: "string" },
    contexts: { type: "array", items: { type: "string" } },
  },
  required: ["hasSlangMeaning"],
}
```

**7. Update UI (`components/EtymologyCard.tsx`):**

Add a collapsible section for modern usage:

```tsx
{
  result.modernUsage?.hasSlangMeaning && (
    <div className="modern-usage-section">
      <h3>💬 Modern Usage</h3>
      <p>{result.modernUsage.slangDefinition}</p>
      {result.modernUsage.contexts && (
        <div className="contexts">
          {result.modernUsage.contexts.map((ctx) => (
            <span key={ctx} className="context-chip">
              {ctx}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Files to Create/Modify

- `lib/types.ts` - Add ModernUsage interface
- `lib/wikipedia.ts` - New Wikipedia API wrapper
- `lib/urbanDictionary.ts` - New Urban Dictionary wrapper (optional)
- `lib/research.ts` - Add new sources to pipeline
- `lib/prompts.ts` - Update system prompt and JSON schema
- `components/EtymologyCard.tsx` - Add modern usage UI section

### Example Output

For the word **"slay"**:

**Etymology:**

- Old English "slēan" → Middle English "slen" → Modern English "slay"
- Proto-Germanic \*slahaną (to strike)

**Modern Usage:**

- **Definition:** To do something exceptionally well; to look amazing
- **Popularized by:** LGBTQ+ drag culture, particularly RuPaul's Drag Race
- **Contexts:** Social media, Gen Z slang, fashion
- **Example:** "She absolutely slayed that presentation"

---

## Contributing

To work on this issue:

1. Create branch: `git checkout -b feat/issue-6-modern-slang`
2. Implement changes per the context above
3. Create PR with title: `feat: <description>`
4. In PR description, add: `Closes #6`

**Auto-close:** Include `Closes #6`, `Fixes #6`, or `Resolves #6` in the PR **description** (not title) to auto-close when merged.
