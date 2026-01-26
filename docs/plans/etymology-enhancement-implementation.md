# Etymology Explorer Enhancement: Implementation Plan

A detailed implementation guide for 6 features that will transform Etymology Explorer into a comprehensive word exploration tool.

**Design Doc:** [`shimmying-sleeping-allen.md`](./shimmying-sleeping-allen.md)

---

## 1. Overview

We're adding 6 interconnected features to the Etymology Explorer:

1. **Database caching** - Persist results in Upstash Redis to reduce API costs
2. **Schema extension** - Add types for POS, suggestions, and modern usage
3. **POS tags** - Show part-of-speech with per-POS definitions
4. **Related words** - Synonyms, antonyms, homophones, easily-confused
5. **Modern slang** - Wikipedia + Urban Dictionary sources for contemporary usage
6. **Pronunciation audio** - ElevenLabs TTS playback
7. **Convergent roots** - Visualize shared PIE ancestors

---

## 2. Prerequisites

### Tools & Versions

```bash
node --version   # v18+ required (Next.js 14)
yarn --version   # v1.22+ (project uses yarn)
```

### Environment Setup

1. Clone and install:

   ```bash
   git clone <repo>
   cd etymology-explorer
   yarn install
   ```

2. Copy environment template:

   ```bash
   cp .env.example .env.local
   ```

3. Add required API keys to `.env.local`:

   ```env
   # Existing (for LLM)
   ANTHROPIC_API_KEY=sk-ant-...

   # New - Upstash Redis (Issue #9)
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=AXxx...

   # New - ElevenLabs (Issue #8)
   ELEVENLABS_API_KEY=sk-...
   ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
   ```

### Services to Set Up

- **Upstash**: Create free account at https://upstash.com, create Redis database
- **ElevenLabs**: Create account at https://elevenlabs.io, get API key

---

## 3. Codebase Orientation

### Key Directories

```
lib/                    # Core business logic
├── types.ts           # ALL type definitions - start here
├── claude.ts          # LLM client + ETYMOLOGY_SCHEMA
├── prompts.ts         # System prompt + user prompt builders
├── research.ts        # Agentic multi-source pipeline
├── etymonline.ts      # HTML scraper for etymonline.com
└── wiktionary.ts      # MediaWiki API client

app/
├── api/etymology/route.ts   # Main POST endpoint
├── page.tsx                 # Main UI + state management

components/
├── EtymologyCard.tsx   # Result display container
├── AncestryTree.tsx    # Visual etymology graph
├── RootChip.tsx        # Expandable root display
└── RelatedWordsList.tsx
```

### Existing Patterns to Follow

**Type definitions** (`lib/types.ts`):

- All interfaces exported individually
- Optional fields use `?` suffix
- Use union types for enums: `'noun' | 'verb'`

**Schema extension** (`lib/claude.ts:28-117`):

- JSON Schema format with `type`, `properties`, `required`
- Nested objects use same pattern
- `additionalProperties: false` on all objects

**Source fetchers** (see `lib/etymonline.ts`, `lib/wiktionary.ts`):

```typescript
export async function fetchXxx(word: string): Promise<SourceData | null> {
  // Returns { text: string, url: string } or null
}
```

**UI sections** (`components/EtymologyCard.tsx`):

```tsx
<section className="mb-8">
  <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-4">
    Section Title
  </h2>
  {/* Content */}
</section>
```

---

## 4. Implementation Tasks

### Task 1: Cache Infrastructure (#9)

**Goal:** Reduce API costs by caching etymology results in Upstash Redis.

**Branch:** `feat/issue-9-persist-db`

**Files to create:**

- `lib/cache.ts` - Redis client with versioned keys

**Files to modify:**

- `app/api/etymology/route.ts` - Add cache check/store wrapper
- `.env.example` - Document new env vars
- `package.json` - Add @upstash/redis

**Implementation steps:**

1. Install Upstash Redis:

   ```bash
   yarn add @upstash/redis
   ```

2. Create `lib/cache.ts`:

   ```typescript
   import { Redis } from '@upstash/redis'
   import { EtymologyResult } from './types'

   // Initialize Redis from environment
   const redis = Redis.fromEnv()

   // Version prefix - bump when schema changes
   const CACHE_VERSION = 1
   const CACHE_PREFIX = `etymology:v${CACHE_VERSION}:`
   const CACHE_TTL = 30 * 24 * 60 * 60 // 30 days

   /**
    * Get cached etymology result
    */
   export async function getCachedEtymology(word: string): Promise<EtymologyResult | null> {
     const key = `${CACHE_PREFIX}${word.toLowerCase().trim()}`
     try {
       return await redis.get<EtymologyResult>(key)
     } catch (error) {
       console.error('[Cache] Get error:', error)
       return null // Fail open - continue without cache
     }
   }

   /**
    * Cache etymology result
    */
   export async function cacheEtymology(word: string, result: EtymologyResult): Promise<void> {
     const key = `${CACHE_PREFIX}${word.toLowerCase().trim()}`
     try {
       await redis.set(key, result, { ex: CACHE_TTL })
     } catch (error) {
       console.error('[Cache] Set error:', error)
       // Fail silently - result was already returned to user
     }
   }

   /**
    * Check if Redis is configured (for conditional caching)
    */
   export function isCacheConfigured(): boolean {
     return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
   }
   ```

3. Modify `app/api/etymology/route.ts` - add cache wrapper around line 72:

   ```typescript
   import { getCachedEtymology, cacheEtymology, isCacheConfigured } from '@/lib/cache'

   // ... inside POST handler, after validation, before research ...

   // Check cache first (if configured)
   if (isCacheConfigured()) {
     const cached = await getCachedEtymology(normalizedWord)
     if (cached) {
       console.log(`[Etymology API] Cache hit for "${normalizedWord}"`)
       return NextResponse.json<ApiResponse<EtymologyResult>>({
         success: true,
         data: cached,
         // @ts-expect-error - extending response type
         cached: true,
       })
     }
   }

   // ... existing research logic ...

   // Cache result for future lookups (after synthesis, before return)
   if (isCacheConfigured()) {
     await cacheEtymology(normalizedWord, result)
   }
   ```

4. Update `.env.example`:
   ```env
   # Upstash Redis (optional - for caching)
   UPSTASH_REDIS_REST_URL=
   UPSTASH_REDIS_REST_TOKEN=
   ```

**Code patterns to follow:**

- Error handling: fail open (return null, continue without cache)
- Logging: prefix with `[Cache]` for grep-ability
- See `lib/etymonline.ts:15-25` for similar try/catch pattern

**Testing:**

- Manual: Search "hello" twice, check console for "Cache hit" on second search
- Verify response includes `cached: true` (check network tab)

**Verification:**

```bash
yarn dev
# Search "hello" → wait for result
# Search "hello" again → should be instant
# Check terminal for: [Etymology API] Cache hit for "hello"
```

**Commit:** `feat(cache): add Upstash Redis caching for etymology results`

---

### Task 2: Schema Extension (Foundation)

**Goal:** Add TypeScript types and JSON Schema for all new fields before feature implementation.

**Branch:** `feat/schema-extension`

**Files to modify:**

- `lib/types.ts` - Add new interfaces
- `lib/claude.ts` - Extend ETYMOLOGY_SCHEMA

**Implementation steps:**

1. Add types to `lib/types.ts` (after line 66, before `EtymologyRequest`):

   ```typescript
   /**
    * Part of speech with definition
    */
   export type PartOfSpeech =
     | 'noun'
     | 'verb'
     | 'adjective'
     | 'adverb'
     | 'preposition'
     | 'conjunction'
     | 'pronoun'
     | 'interjection'
     | 'determiner'

   export interface POSDefinition {
     pos: PartOfSpeech
     definition: string
     pronunciation?: string // If different per POS (e.g., "record")
   }

   /**
    * Word relationship suggestions
    */
   export interface WordSuggestions {
     synonyms?: string[]
     antonyms?: string[]
     homophones?: string[] // Words that sound the same
     easilyConfusedWith?: string[] // Words often mistaken
     seeAlso?: string[] // Other interesting related words
   }

   /**
    * Modern/slang usage information
    */
   export interface ModernUsage {
     hasSlangMeaning: boolean
     slangDefinition?: string
     popularizedBy?: string // e.g., "LGBTQ+ drag culture"
     contexts?: string[] // e.g., ["social media", "Gen Z"]
     notableReferences?: string[]
   }

   /**
    * Convergence point where multiple roots share ancestry
    */
   export interface ConvergencePoint {
     pieRoot: string // e.g., "*leg-"
     meaning: string // e.g., "to collect, speak"
     branchIndices: number[] // Which branches share this root
   }
   ```

2. Extend `EtymologyResult` interface (around line 58):

   ```typescript
   export interface EtymologyResult {
     word: string
     pronunciation: string
     definition: string
     roots: Root[]
     ancestryGraph: AncestryGraph
     lore: string
     sources: SourceReference[]
     // NEW optional fields
     partsOfSpeech?: POSDefinition[]
     suggestions?: WordSuggestions
     modernUsage?: ModernUsage
   }
   ```

3. Extend `AncestryGraph` interface (around line 45):

   ```typescript
   export interface AncestryGraph {
     branches: AncestryBranch[]
     mergePoint?: {
       form: string
       note: string
     }
     postMerge?: AncestryStage[]
     // NEW: for convergent roots
     convergencePoints?: ConvergencePoint[]
   }
   ```

4. Extend `SourceReference.name` union (around line 18):

   ```typescript
   export interface SourceReference {
     name: 'etymonline' | 'wiktionary' | 'wikipedia' | 'urbandictionary' | 'synthesized'
     url?: string
     word?: string
   }
   ```

5. Extend ETYMOLOGY_SCHEMA in `lib/claude.ts` (add after `lore` property, around line 108):

   ```typescript
   partsOfSpeech: {
     type: 'array',
     description: 'All parts of speech this word can be',
     items: {
       type: 'object',
       properties: {
         pos: {
           type: 'string',
           enum: ['noun', 'verb', 'adjective', 'adverb', 'preposition',
                  'conjunction', 'pronoun', 'interjection', 'determiner'],
         },
         definition: { type: 'string', description: 'Definition for this POS' },
         pronunciation: { type: 'string', description: 'IPA if different from main' },
       },
       required: ['pos', 'definition'],
       additionalProperties: false,
     },
   },
   suggestions: {
     type: 'object',
     description: 'Related words and linguistic relationships',
     properties: {
       synonyms: { type: 'array', items: { type: 'string' } },
       antonyms: { type: 'array', items: { type: 'string' } },
       homophones: { type: 'array', items: { type: 'string' } },
       easilyConfusedWith: { type: 'array', items: { type: 'string' } },
       seeAlso: { type: 'array', items: { type: 'string' } },
     },
     additionalProperties: false,
   },
   modernUsage: {
     type: 'object',
     description: 'Modern slang or cultural meanings',
     properties: {
       hasSlangMeaning: { type: 'boolean' },
       slangDefinition: { type: 'string' },
       popularizedBy: { type: 'string' },
       contexts: { type: 'array', items: { type: 'string' } },
       notableReferences: { type: 'array', items: { type: 'string' } },
     },
     required: ['hasSlangMeaning'],
     additionalProperties: false,
   },
   ```

6. Add convergencePoints to ancestryGraph schema (around line 85):
   ```typescript
   convergencePoints: {
     type: 'array',
     description: 'Shared PIE ancestors where branches converge',
     items: {
       type: 'object',
       properties: {
         pieRoot: { type: 'string', description: 'PIE root like *leg-' },
         meaning: { type: 'string', description: 'What the PIE root means' },
         branchIndices: {
           type: 'array',
           items: { type: 'number' },
           description: 'Indices of branches sharing this ancestor',
         },
       },
       required: ['pieRoot', 'meaning', 'branchIndices'],
       additionalProperties: false,
     },
   },
   ```

**Testing:**

```bash
yarn lint      # Should pass with no type errors
yarn build     # Should compile successfully
```

**Commit:** `feat(types): extend schema for POS, suggestions, modern usage, convergence`

---

### Task 3: POS Tags (#25)

**Goal:** Display part-of-speech information with per-POS definitions.

**Branch:** `feat/issue-25-pos-tags`
**Depends on:** Task 2 (Schema Extension)

**Files to modify:**

- `lib/prompts.ts` - Add POS instructions to system prompt
- `components/EtymologyCard.tsx` - Add POS UI section

**Implementation steps:**

1. Update SYSTEM_PROMPT in `lib/prompts.ts` (add after line 78, before closing backtick):

   ```typescript
   - PARTS OF SPEECH: Identify all common parts of speech for this word.
     * For each POS, provide the grammatical category and a brief definition
     * Include pronunciation if it differs by POS (e.g., "record" noun vs verb)
     * Example: "record" → [{pos: "noun", definition: "a thing kept as evidence", pronunciation: "/ˈrekərd/"}, {pos: "verb", definition: "to set down in writing", pronunciation: "/rɪˈkɔːrd/"}]
   ```

2. Add POS display to `components/EtymologyCard.tsx` (after the definition, around line 73):
   ```tsx
   {
     /* Parts of Speech badges */
   }
   {
     result.partsOfSpeech && result.partsOfSpeech.length > 0 && (
       <div className="flex flex-wrap gap-2 mt-4">
         {result.partsOfSpeech.map(({ pos, definition, pronunciation }, idx) => (
           <div
             key={`${pos}-${idx}`}
             className="
             inline-flex flex-col
             px-3 py-2
             bg-cream-dark/50
             border border-charcoal/10
             rounded-lg
           "
           >
             <div className="flex items-center gap-2">
               <span className="text-xs font-serif uppercase tracking-wider text-charcoal/60">
                 {pos}
               </span>
               {pronunciation && (
                 <span className="text-xs font-serif italic text-charcoal/40">{pronunciation}</span>
               )}
             </div>
             <span className="text-sm font-serif text-charcoal/80 mt-1">{definition}</span>
           </div>
         ))}
       </div>
     )
   }
   ```

**Code patterns to follow:**

- Section header style: `font-serif text-sm uppercase text-charcoal-light tracking-widest mb-4`
- Content: `font-serif text-lg text-charcoal/80`
- See existing RootChip for badge styling patterns

**Testing:**

- Search "record" → should show both noun and verb with different pronunciations
- Search "run" → should show noun and verb
- Search "cat" → should show just noun

**Verification:**

```bash
yarn dev
# Search "record" - verify noun /ˈrekərd/ and verb /rɪˈkɔːrd/ appear
# Check that clicking POS badges doesn't cause errors
```

**Commit:** `feat(ui): add part-of-speech display with per-POS definitions`

---

### Task 4: Related Words (#23)

**Goal:** Display synonyms, antonyms, homophones, and easily-confused words.

**Branch:** `feat/issue-23-related-words`
**Depends on:** Task 2 (Schema Extension)

**Files to modify:**

- `lib/prompts.ts` - Add suggestions instructions
- `components/EtymologyCard.tsx` - Add suggestions section

**Implementation steps:**

1. Update SYSTEM_PROMPT in `lib/prompts.ts`:

   ```typescript
   - WORD SUGGESTIONS: If relevant, include linguistic relationships:
     * synonyms: Words with similar meanings (3-5 useful ones)
     * antonyms: Words with opposite meanings
     * homophones: Words that sound identical (e.g., their/there/they're)
     * easilyConfusedWith: Words often mistaken for this one (e.g., affect/effect)
     Quality over quantity - only genuinely useful relationships.
   ```

2. Add suggestions section to `components/EtymologyCard.tsx` (after lore section, before sources):

   ```tsx
   {
     /* Related Words / Suggestions */
   }
   {
     result.suggestions && (
       <section className="mt-8 pt-6 border-t border-charcoal/10">
         <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-4">
           Related Words
         </h2>
         <div className="grid gap-6 md:grid-cols-2">
           {result.suggestions.synonyms && result.suggestions.synonyms.length > 0 && (
             <div>
               <h3 className="text-xs uppercase tracking-wider text-charcoal/50 mb-2">Synonyms</h3>
               <div className="flex flex-wrap gap-2">
                 {result.suggestions.synonyms.map((word) => (
                   <button
                     key={word}
                     onClick={() => onWordClick(word)}
                     className="
                     px-2 py-1 text-sm font-serif
                     border border-charcoal/20 rounded
                     hover:bg-charcoal/5 hover:border-charcoal/30
                     transition-colors
                   "
                   >
                     {word}
                   </button>
                 ))}
               </div>
             </div>
           )}

           {result.suggestions.antonyms && result.suggestions.antonyms.length > 0 && (
             <div>
               <h3 className="text-xs uppercase tracking-wider text-charcoal/50 mb-2">Antonyms</h3>
               <div className="flex flex-wrap gap-2">
                 {result.suggestions.antonyms.map((word) => (
                   <button
                     key={word}
                     onClick={() => onWordClick(word)}
                     className="
                     px-2 py-1 text-sm font-serif
                     border border-charcoal/20 rounded
                     hover:bg-charcoal/5 hover:border-charcoal/30
                     transition-colors
                   "
                   >
                     {word}
                   </button>
                 ))}
               </div>
             </div>
           )}

           {result.suggestions.homophones && result.suggestions.homophones.length > 0 && (
             <div>
               <h3 className="text-xs uppercase tracking-wider text-charcoal/50 mb-2">
                 Homophones
               </h3>
               <div className="flex flex-wrap gap-2">
                 {result.suggestions.homophones.map((word) => (
                   <button
                     key={word}
                     onClick={() => onWordClick(word)}
                     className="
                     px-2 py-1 text-sm font-serif
                     border border-charcoal/20 rounded
                     hover:bg-charcoal/5 hover:border-charcoal/30
                     transition-colors
                   "
                   >
                     {word}
                   </button>
                 ))}
               </div>
             </div>
           )}

           {result.suggestions.easilyConfusedWith &&
             result.suggestions.easilyConfusedWith.length > 0 && (
               <div>
                 <h3 className="text-xs uppercase tracking-wider text-amber-600/80 mb-2">
                   Easily Confused With
                 </h3>
                 <div className="flex flex-wrap gap-2">
                   {result.suggestions.easilyConfusedWith.map((word) => (
                     <button
                       key={word}
                       onClick={() => onWordClick(word)}
                       className="
                     px-2 py-1 text-sm font-serif
                     border border-amber-500/30 rounded
                     bg-amber-50/50
                     hover:bg-amber-100/50 hover:border-amber-500/50
                     transition-colors
                   "
                     >
                       {word}
                     </button>
                   ))}
                 </div>
               </div>
             )}
         </div>
       </section>
     )
   }
   ```

**Testing:**

- Search "affect" → should show "effect" in "Easily Confused With"
- Search "their" → should show "there", "they're" in homophones
- Click any suggestion → should navigate to that word

**Commit:** `feat(ui): add synonyms, antonyms, homophones, confused-with suggestions`

---

### Task 5: Modern Slang Sources (#6)

**Goal:** Add Wikipedia + Urban Dictionary data for modern/slang meanings.

**Branch:** `feat/issue-6-modern-slang`
**Depends on:** Task 2 (Schema Extension)

**Files to create:**

- `lib/wikipedia.ts` - Wikipedia API wrapper
- `lib/urbanDictionary.ts` - Urban Dictionary with NSFW filter

**Files to modify:**

- `lib/research.ts` - Add new sources to Phase 1
- `lib/prompts.ts` - Add modern usage instructions
- `components/EtymologyCard.tsx` - Add modern usage section

**Implementation steps:**

1. Create `lib/wikipedia.ts`:

   ```typescript
   import { SourceData } from './types'

   const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'

   /**
    * Fetch Wikipedia summary for a word
    * Returns plain text extract suitable for LLM context
    */
   export async function fetchWikipedia(word: string): Promise<SourceData | null> {
     const params = new URLSearchParams({
       action: 'query',
       format: 'json',
       titles: word,
       prop: 'extracts|categories',
       exintro: 'true',
       explaintext: 'true',
       origin: '*',
     })

     try {
       const response = await fetch(`${WIKIPEDIA_API}?${params}`)
       if (!response.ok) return null

       const data = await response.json()
       const pages = data.query?.pages
       if (!pages) return null

       // Get first page (Wikipedia returns object keyed by page ID)
       const pageId = Object.keys(pages)[0]
       if (pageId === '-1') return null // Page not found

       const page = pages[pageId]
       const extract = page.extract?.trim()
       if (!extract || extract.length < 50) return null

       return {
         text: extract.slice(0, 2000), // Limit context size
         url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
       }
     } catch (error) {
       console.error('[Wikipedia] Fetch error:', error)
       return null
     }
   }
   ```

2. Create `lib/urbanDictionary.ts`:

   ```typescript
   import { SourceData } from './types'

   const URBAN_API = 'https://api.urbandictionary.com/v0/define'

   // NSFW filter keywords
   const NSFW_KEYWORDS = [
     'sex',
     'sexual',
     'fuck',
     'dick',
     'pussy',
     'cock',
     'nude',
     'porn',
     'orgasm',
     'masturbat',
     'erotic',
     'genitals',
   ]

   interface UrbanEntry {
     definition: string
     thumbs_up: number
     thumbs_down: number
     example: string
   }

   /**
    * Check if text contains NSFW content
    */
   function isNSFW(text: string): boolean {
     const lower = text.toLowerCase()
     return NSFW_KEYWORDS.some((kw) => lower.includes(kw))
   }

   /**
    * Fetch Urban Dictionary definitions with quality and content filtering
    */
   export async function fetchUrbanDictionary(word: string): Promise<SourceData | null> {
     try {
       const response = await fetch(`${URBAN_API}?term=${encodeURIComponent(word)}`)
       if (!response.ok) return null

       const data = await response.json()
       const entries: UrbanEntry[] = data.list || []

       // Filter: high quality (500+ upvotes, 2:1 ratio) and SFW
       const filtered = entries
         .filter((e) => e.thumbs_up >= 500)
         .filter((e) => e.thumbs_up / Math.max(e.thumbs_down, 1) >= 2)
         .filter((e) => !isNSFW(e.definition) && !isNSFW(e.example))
         .slice(0, 2)

       if (filtered.length === 0) return null

       const text = filtered.map((e, i) => `${i + 1}. ${e.definition}`).join('\n\n')

       return {
         text,
         url: `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(word)}`,
       }
     } catch (error) {
       console.error('[UrbanDictionary] Fetch error:', error)
       return null
     }
   }
   ```

3. Modify `lib/research.ts` - add to Phase 1 parallel fetch (around line 130):

   ```typescript
   import { fetchWikipedia } from './wikipedia'
   import { fetchUrbanDictionary } from './urbanDictionary'

   // In conductAgenticResearch, modify Phase 1:
   const [etymonlineData, wiktionaryData, wikipediaData, urbanDictData] = await Promise.all([
     fetchEtymonline(normalizedWord),
     fetchWiktionary(normalizedWord),
     fetchWikipedia(normalizedWord),
     fetchUrbanDictionary(normalizedWord).catch(() => null),
   ])
   ```

4. Update `lib/types.ts` - extend ResearchContext:

   ```typescript
   export interface ResearchContext {
     mainWord: {
       word: string
       etymonline: SourceData | null
       wiktionary: SourceData | null
       wikipedia?: SourceData | null // NEW
       urbanDictionary?: SourceData | null // NEW
     }
     // ... rest unchanged
   }
   ```

5. Update SYSTEM_PROMPT in `lib/prompts.ts`:

   ```typescript
   - MODERN USAGE: If the word has notable slang or internet culture meanings:
     * Set hasSlangMeaning: true if there's a distinct modern connotation
     * Include slangDefinition with the modern meaning
     * Note popularizedBy if known (e.g., "LGBTQ+ drag culture", "Gen Z TikTok")
     * List relevant contexts (e.g., ["social media", "gaming", "fashion"])
     * Distinguish clearly between etymological origin and modern usage
   ```

6. Add modern usage section to `components/EtymologyCard.tsx`:

   ```tsx
   {
     /* Modern Usage / Slang */
   }
   {
     result.modernUsage?.hasSlangMeaning && (
       <section className="mt-8 pt-6 border-t border-charcoal/10">
         <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-4 flex items-center gap-2">
           <span>Modern Usage</span>
           <span className="text-xs px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">
             slang
           </span>
         </h2>

         <p className="font-serif text-lg text-charcoal/80 leading-relaxed mb-4">
           {result.modernUsage.slangDefinition}
         </p>

         {result.modernUsage.popularizedBy && (
           <p className="text-sm text-charcoal/60 mb-3">
             <span className="font-medium">Popularized by:</span> {result.modernUsage.popularizedBy}
           </p>
         )}

         {result.modernUsage.contexts && result.modernUsage.contexts.length > 0 && (
           <div className="flex flex-wrap gap-2">
             {result.modernUsage.contexts.map((ctx) => (
               <span
                 key={ctx}
                 className="px-2 py-1 text-xs bg-violet-50 text-violet-600 rounded-full"
               >
                 {ctx}
               </span>
             ))}
           </div>
         )}
       </section>
     )
   }
   ```

**Testing:**

- Search "slay" → should show modern LGBTQ+/drag culture meaning
- Search "lit" → should show modern slang usage
- Search "cat" → should NOT show modern usage section

**Commit:** `feat(sources): add Wikipedia and Urban Dictionary for modern slang`

---

### Task 6: Pronunciation Audio (#8)

**Goal:** Add ElevenLabs TTS audio playback for word pronunciation.

**Branch:** `feat/issue-8-pronunciation-elevenlabs`
**Depends on:** Task 1 (Cache Infrastructure - for audio caching)

**Files to create:**

- `lib/elevenlabs.ts` - ElevenLabs API wrapper
- `app/api/pronunciation/route.ts` - Audio endpoint
- `components/PronunciationButton.tsx` - Play button component

**Files to modify:**

- `lib/cache.ts` - Add audio caching functions
- `components/EtymologyCard.tsx` - Add play button
- `.env.example` - Document ElevenLabs vars

**Implementation steps:**

1. Create `lib/elevenlabs.ts`:

   ```typescript
   const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'

   /**
    * Generate pronunciation audio using ElevenLabs TTS
    */
   export async function generatePronunciation(word: string): Promise<ArrayBuffer> {
     const apiKey = process.env.ELEVENLABS_API_KEY
     const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM' // Rachel

     if (!apiKey) {
       throw new Error('ELEVENLABS_API_KEY not configured')
     }

     const response = await fetch(`${ELEVENLABS_API}/text-to-speech/${voiceId}`, {
       method: 'POST',
       headers: {
         'xi-api-key': apiKey,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         text: word,
         model_id: 'eleven_monolingual_v1',
         voice_settings: {
           stability: 0.75,
           similarity_boost: 0.75,
         },
       }),
     })

     if (!response.ok) {
       const error = await response.text()
       throw new Error(`ElevenLabs API error: ${error}`)
     }

     return response.arrayBuffer()
   }

   /**
    * Check if ElevenLabs is configured
    */
   export function isElevenLabsConfigured(): boolean {
     return !!process.env.ELEVENLABS_API_KEY
   }
   ```

2. Add audio caching to `lib/cache.ts`:

   ```typescript
   const AUDIO_PREFIX = 'audio:v1:'
   const AUDIO_TTL = 365 * 24 * 60 * 60 // 1 year (audio doesn't change)

   /**
    * Get cached audio (as base64 string)
    */
   export async function getCachedAudio(word: string): Promise<string | null> {
     const key = `${AUDIO_PREFIX}${word.toLowerCase().trim()}`
     try {
       return await redis.get<string>(key)
     } catch (error) {
       console.error('[Cache] Audio get error:', error)
       return null
     }
   }

   /**
    * Cache audio (as base64 string)
    */
   export async function cacheAudio(word: string, audioBase64: string): Promise<void> {
     const key = `${AUDIO_PREFIX}${word.toLowerCase().trim()}`
     try {
       await redis.set(key, audioBase64, { ex: AUDIO_TTL })
     } catch (error) {
       console.error('[Cache] Audio set error:', error)
     }
   }
   ```

3. Create `app/api/pronunciation/route.ts`:

   ```typescript
   import { NextRequest, NextResponse } from 'next/server'
   import { generatePronunciation, isElevenLabsConfigured } from '@/lib/elevenlabs'
   import { getCachedAudio, cacheAudio, isCacheConfigured } from '@/lib/cache'

   export async function GET(request: NextRequest) {
     const { searchParams } = new URL(request.url)
     const word = searchParams.get('word')

     if (!word) {
       return NextResponse.json({ error: 'Word parameter required' }, { status: 400 })
     }

     if (!isElevenLabsConfigured()) {
       return NextResponse.json({ error: 'Audio not available' }, { status: 503 })
     }

     const normalizedWord = word.toLowerCase().trim()

     // Check cache first
     if (isCacheConfigured()) {
       const cached = await getCachedAudio(normalizedWord)
       if (cached) {
         const buffer = Buffer.from(cached, 'base64')
         return new NextResponse(buffer, {
           headers: {
             'Content-Type': 'audio/mpeg',
             'Cache-Control': 'public, max-age=31536000', // 1 year
           },
         })
       }
     }

     try {
       const audioBuffer = await generatePronunciation(normalizedWord)
       const base64 = Buffer.from(audioBuffer).toString('base64')

       // Cache for future requests
       if (isCacheConfigured()) {
         await cacheAudio(normalizedWord, base64)
       }

       return new NextResponse(audioBuffer, {
         headers: {
           'Content-Type': 'audio/mpeg',
           'Cache-Control': 'public, max-age=31536000',
         },
       })
     } catch (error) {
       console.error('[Pronunciation] Error:', error)
       return NextResponse.json({ error: 'Failed to generate pronunciation' }, { status: 500 })
     }
   }
   ```

4. Create `components/PronunciationButton.tsx`:

   ```tsx
   'use client'

   import { useState, useRef } from 'react'

   interface PronunciationButtonProps {
     word: string
   }

   export function PronunciationButton({ word }: PronunciationButtonProps) {
     const [isPlaying, setIsPlaying] = useState(false)
     const [isLoading, setIsLoading] = useState(false)
     const [error, setError] = useState(false)
     const audioRef = useRef<HTMLAudioElement | null>(null)

     const handlePlay = async () => {
       if (isPlaying || isLoading) return

       setError(false)

       // Create audio element if not exists
       if (!audioRef.current) {
         setIsLoading(true)
         audioRef.current = new Audio(`/api/pronunciation?word=${encodeURIComponent(word)}`)
         audioRef.current.onended = () => setIsPlaying(false)
         audioRef.current.onerror = () => {
           setError(true)
           setIsPlaying(false)
           setIsLoading(false)
         }
         audioRef.current.oncanplay = () => setIsLoading(false)
       }

       try {
         setIsPlaying(true)
         await audioRef.current.play()
       } catch (err) {
         setError(true)
         setIsPlaying(false)
       }
     }

     return (
       <button
         onClick={handlePlay}
         disabled={isPlaying || isLoading}
         aria-label={`Play pronunciation of ${word}`}
         className={`
           p-1.5 rounded-full transition-colors
           ${error ? 'text-red-400' : 'text-charcoal/40 hover:text-charcoal/70'}
           ${isPlaying ? 'text-charcoal' : ''}
           disabled:opacity-50
         `}
         title={error ? 'Audio unavailable' : 'Play pronunciation'}
       >
         {isLoading ? (
           <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
             <circle
               className="opacity-25"
               cx="12"
               cy="12"
               r="10"
               stroke="currentColor"
               strokeWidth="4"
             />
             <path
               className="opacity-75"
               fill="currentColor"
               d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
             />
           </svg>
         ) : isPlaying ? (
           <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
             <path d="M11.5 5c-1.38 0-2.5 1.12-2.5 2.5v9c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5v-9c0-1.38-1.12-2.5-2.5-2.5z" />
             <path d="M16.5 5c-1.38 0-2.5 1.12-2.5 2.5v9c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5v-9c0-1.38-1.12-2.5-2.5-2.5z" />
           </svg>
         ) : (
           <svg
             className="w-5 h-5"
             fill="none"
             stroke="currentColor"
             strokeWidth="1.5"
             viewBox="0 0 24 24"
           >
             <path
               strokeLinecap="round"
               strokeLinejoin="round"
               d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
             />
           </svg>
         )}
       </button>
     )
   }
   ```

5. Add to `components/EtymologyCard.tsx` (next to pronunciation span, around line 60):

   ```tsx
   import { PronunciationButton } from './PronunciationButton'

   // In the header, after the pronunciation span:
   ;<div className="flex items-center gap-2">
     <span className="font-serif text-lg text-charcoal-light italic">{result.pronunciation}</span>
     <PronunciationButton word={result.word} />
   </div>
   ```

6. Update `.env.example`:
   ```env
   # ElevenLabs TTS (optional - for pronunciation audio)
   ELEVENLABS_API_KEY=
   ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
   ```

**Testing:**

- Search any word → click speaker icon → should hear pronunciation
- Click again → should play from cache (instant)
- Without ElevenLabs key → button should show error state

**Commit:** `feat(audio): add ElevenLabs pronunciation with caching`

---

### Task 7: Convergent Roots (#7)

**Goal:** Visualize when multiple morphemes share PIE ancestors.

**Branch:** `fix/issue-7-convergent-roots`
**Depends on:** Tasks 2-5 (needs richer data)

**Files to modify:**

- `lib/prompts.ts` - Add convergence detection instructions
- `components/AncestryTree.tsx` - Add convergence visualization

**Implementation steps:**

1. Update SYSTEM_PROMPT in `lib/prompts.ts`:

   ```typescript
   - CONVERGENT ETYMOLOGY: Check if multiple morphemes share a Proto-Indo-European (PIE) root.
     * If roots converge at a common ancestor, add convergencePoints to ancestryGraph
     * Example: "lexicology" - both "lexic-" (Greek lexikos) and "-logy" (Greek logos) derive from PIE *leg- (to collect, speak)
     * Include: pieRoot (e.g., "*leg-"), meaning, and branchIndices (which branches share it)
     * This is linguistically significant - it shows built-in meaning reinforcement!
   ```

2. Add convergence indicator to `components/AncestryTree.tsx` (at the top of the tree, before branches):

   ```tsx
   {
     /* Convergence Points - shared PIE ancestors */
   }
   {
     graph.convergencePoints && graph.convergencePoints.length > 0 && (
       <div className="mb-6 p-4 bg-stone-50 rounded-lg border border-stone-200">
         <h4 className="text-xs uppercase tracking-wider text-stone-500 mb-3">
           Convergent Etymology
         </h4>
         {graph.convergencePoints.map((cp, idx) => (
           <div key={idx} className="flex items-center gap-3">
             <span className="text-lg font-serif text-stone-700 font-medium">{cp.pieRoot}</span>
             <span className="text-sm text-stone-500">"{cp.meaning}"</span>
             <span className="text-xs text-stone-400">
               (shared by branches {cp.branchIndices.map((i) => i + 1).join(' & ')})
             </span>
           </div>
         ))}
         <p className="mt-2 text-xs text-stone-500 italic">
           These roots trace back to the same ancestor, reinforcing the word's meaning.
         </p>
       </div>
     )
   }
   ```

3. Color-code convergent branches in the tree:

   ```tsx
   // Add this helper at the top of the component
   const getConvergentBranches = (graph: AncestryGraph): Set<number> => {
     const convergent = new Set<number>()
     graph.convergencePoints?.forEach(cp => {
       cp.branchIndices.forEach(i => convergent.add(i))
     })
     return convergent
   }

   // In the branch rendering, add visual indicator:
   const convergentBranches = getConvergentBranches(graph)

   // For each branch, add a subtle highlight if convergent:
   <div className={`
     ${convergentBranches.has(index) ? 'ring-2 ring-stone-300 ring-offset-2' : ''}
   `}>
   ```

**Testing:**

- Search "lexicology" → should show PIE \*leg- as shared ancestor
- Search "bibliography" → should show shared roots if applicable
- Search "telephone" → should NOT show convergence (different PIE roots)

**Commit:** `feat(viz): show convergent PIE roots in ancestry graph`

---

## 5. Testing Strategy

### Unit Tests

Not required for this sprint - focus on integration testing.

### Integration Testing

Each task includes manual verification steps. After all tasks:

```bash
# Full integration test
yarn dev

# Test words covering all features:
# 1. "record" - POS with different pronunciations
# 2. "affect" - confused with "effect"
# 3. "slay" - modern slang usage
# 4. "their" - homophones
# 5. "lexicology" - convergent roots
# 6. Any word twice - caching
```

### E2E Testing

Manual only for this sprint. Future: add Playwright tests.

---

## 6. Documentation Updates

- [ ] Update `.env.example` with all new environment variables
- [ ] Add "Features" section to README listing new capabilities
- [ ] Update CLAUDE.md with new file descriptions

---

## 7. Definition of Done

- [ ] Task 1: Cache returns `cached: true` on second search
- [ ] Task 2: `yarn build` passes with no type errors
- [ ] Task 3: "record" shows noun/verb POS badges
- [ ] Task 4: "affect" shows "effect" in confused-with
- [ ] Task 5: "slay" shows modern usage section
- [ ] Task 6: Audio plays on click, caches for replay
- [ ] Task 7: "lexicology" shows convergent roots
- [ ] All lint checks pass: `yarn lint`
- [ ] Production build succeeds: `yarn build`

---

## Parallel Execution Guide

For maximum efficiency with multiple agents:

```
Day 1-2 (Sequential):
└── Agent 1: Tasks 1 & 2 (Cache + Schema)

Day 2-4 (Parallel):
├── Agent A: Task 3 (POS Tags)
├── Agent B: Task 4 (Related Words)
├── Agent C: Task 5 (Modern Slang)
└── Agent D: Task 6 (Pronunciation)

Day 5-6 (Sequential):
└── Agent 1: Task 7 (Convergent Roots)

Day 7:
└── Integration testing + polish
```

---

_Generated via /brainstorm-plan on 2026-01-26_
