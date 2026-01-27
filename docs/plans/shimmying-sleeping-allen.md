# Task 8: Integration Testing & Polish

## Summary

Final polish task:

1. Update documentation (CLAUDE.md, README.md)
2. Fix 3 bugs identified by agents
3. Parallelize root research (2-3x latency improvement)
4. Verify build/lint passes

**Scope: Required + High Impact** (user selected)

## Agent Analysis Summary

**Gemini, Codex, and Code Simplifier agents reviewed the codebase. Key findings:**

### Bugs to Fix

| Issue                                                | File                               | Severity |
| ---------------------------------------------------- | ---------------------------------- | -------- |
| Uncaught JSON.parse                                  | `lib/claude.ts:325,364`            | Medium   |
| Schema mismatch (ancestryGraph required vs optional) | `lib/schemas/etymology.ts:99`      | Medium   |
| Missing optional chaining                            | `components/EtymologyCard.tsx:121` | Low      |

### Performance Opportunities

| Issue                    | File                      | Impact                          |
| ------------------------ | ------------------------- | ------------------------------- |
| Sequential root research | `lib/research.ts:232-255` | High (2-3x latency reduction)   |
| Cache key missing model  | `lib/cache.ts:39`         | Medium (cross-model cache hits) |

### Code Simplification Opportunities

| Issue                             | File                                   | Lines Saved |
| --------------------------------- | -------------------------------------- | ----------- |
| Consolidate suggestion rows       | `components/EtymologyCard.tsx:209-251` | ~25 lines   |
| Extract ApiKeyInput component     | `components/SettingsModal.tsx`         | ~60 lines   |
| Consolidate LLM provider dispatch | `lib/claude.ts:306-398`                | ~30 lines   |

### Rejected (Not Worth Doing)

- Color map consolidation (different semantic purposes)
- Schema file extraction (adds indirection)
- Combining useEffects in SettingsModal (reduces clarity)

## Phase 1: Documentation Updates

### 1.1 CLAUDE.md Updates

**File:** `/Users/pupa/projects/etymology-explorer/CLAUDE.md`

#### A. Update Key Directories (after line 69)

Add to `app/api/` description or create new section:

```markdown
- **`app/`** - Page routes and SEO:
  - `faq/page.tsx` - FAQ page with FAQPage JSON-LD schema
  - `learn/what-is-etymology/page.tsx` - Educational content for SEO
  - `sitemap.ts` - Dynamic sitemap generator
  - `robots.ts` - Robots.txt configuration
  - `og/route.tsx` - Dynamic Open Graph image generation
- **`data/`** - Static content:
  - `gre-words.json` - ~500 word list for random selection and spell-check
  - `faq.ts` - FAQ content with FaqItem interface
```

Add missing components to `components/` description:

```markdown
- `JsonLd.tsx` - WebApplication schema with SearchAction for sitelinks
- `FaqSchema.tsx` - FAQPage JSON-LD schema generator
- `FaqAccordion.tsx` - Accessible FAQ using native details/summary
- `ErrorState.tsx` - Error display with retry functionality
- `RelatedWordsList.tsx` - Related words chip display
```

#### B. Update API Endpoints Table (line 120-129)

Add missing endpoint:

```markdown
| `/api/pronunciation` | GET | TTS audio - `?word=word` (ElevenLabs) |
```

#### C. Update Important Files (after line 145)

Add:

```markdown
- **`data/faq.ts`** - FAQ content (shared by UI and JSON-LD schema)
- **`components/JsonLd.tsx`** - WebApplication schema with SearchAction
- **`components/FaqSchema.tsx`** - FAQPage JSON-LD for Google rich results
- **`components/FaqAccordion.tsx`** - Accessible FAQ with native details/summary
- **`app/faq/page.tsx`** - FAQ page with metadata and structured data
- **`app/learn/what-is-etymology/page.tsx`** - Long-form educational content (~1200 words)
- **`app/sitemap.ts`** - Dynamic sitemap for all routes
```

### 1.2 README.md Updates

**File:** `/Users/pupa/projects/etymology-explorer/README.md`

#### A. Update Project Structure (line 81-113)

Add to `app/` section:

```
│   ├── faq/              # FAQ page with structured data
│   ├── learn/            # Educational content pages
│   │   └── what-is-etymology/
│   ├── sitemap.ts        # Dynamic sitemap
│   ├── robots.ts         # Robots.txt
│   └── og/               # Dynamic OG images
```

Add to `app/api/`:

```
│   │   └── pronunciation/    # TTS audio endpoint
```

Add to `components/`:

```
│   ├── JsonLd.tsx        # WebApplication schema
│   ├── FaqSchema.tsx     # FAQPage JSON-LD
│   ├── FaqAccordion.tsx  # Accessible FAQ accordion
│   ├── ErrorState.tsx    # Error display
│   └── RelatedWordsList.tsx  # Related words chips
```

Add to `data/`:

```
│   └── faq.ts            # FAQ content
```

#### B. Update API Endpoints Table (line 115-123)

Add:

```markdown
| `/api/pronunciation` | GET | Get pronunciation audio |
```

---

## Phase 2: Bug Fixes (Required)

### 2.1 Add try-catch for JSON.parse

**File:** `/Users/pupa/projects/etymology-explorer/lib/claude.ts`

Lines 325 and 364 - wrap JSON.parse in try-catch:

```typescript
try {
  const result = JSON.parse(responseText) as EtymologyResult
  // ... rest of code
} catch (e) {
  throw new Error(`Failed to parse LLM response as JSON: ${e}`)
}
```

### 2.2 Fix schema mismatch

**File:** `/Users/pupa/projects/etymology-explorer/lib/schemas/etymology.ts`

Line 99 - change `ancestryGraph` from optional to required:

```typescript
ancestryGraph: AncestryGraphSchema,  // Remove .optional()
```

### 2.3 Add defensive optional chaining

**File:** `/Users/pupa/projects/etymology-explorer/components/EtymologyCard.tsx`

Line 121 - add optional chaining:

```typescript
result.ancestryGraph?.branches?.length > 0
```

---

## Phase 3: Code Simplification (Optional)

### 3.1 RootChip Memoization

**File:** `/Users/pupa/projects/etymology-explorer/components/RootChip.tsx`

Change line 11 from:

```typescript
export function RootChip({ root, onWordClick }: RootChipProps) {
```

To:

```typescript
import { memo } from 'react'
export const RootChip = memo(function RootChip({ root, onWordClick }: RootChipProps) {
```

**Rationale:** Prevents re-renders when parent state changes but props remain same.

### 3.2 Optional: Parallelize Root Research (High Impact)

**File:** `/Users/pupa/projects/etymology-explorer/lib/research.ts`

Lines 232-255 - change sequential loop to parallel:

```typescript
// Before: sequential
for (const root of rootsToResearch) {
  const rootData = await fetchRootResearch(root)
  // ...
}

// After: parallel with Promise.allSettled
const rootPromises = rootsToResearch.map((root) => fetchRootResearch(root))
const results = await Promise.allSettled(rootPromises)
```

**Impact:** 2-3x latency reduction for compound words.

### 3.3 Optional: Add Model to Cache Key

**File:** `/Users/pupa/projects/etymology-explorer/lib/cache.ts`

Line 39 - include model in cache key:

```typescript
const key = `${ETYMOLOGY_PREFIX}${word.toLowerCase().trim()}:${model}`
```

**Impact:** Prevents cross-model cache hits when users switch LLM providers.

### 3.4 NOT Refactoring (Justified)

| Suggestion                  | Verdict  | Reason                                                   |
| --------------------------- | -------- | -------------------------------------------------------- |
| Extract color mappings      | NO       | Different semantic purposes, co-located is clearer       |
| Consolidate suggestion rows | OPTIONAL | ~25 lines saved but adds abstraction                     |
| Extract ApiKeyInput         | OPTIONAL | ~60 lines saved but component is self-contained          |
| Abstract LLM calls          | NO       | Different patterns (SDK vs fetch), current code is clear |

---

## Phase 4: Verification Checklist

### 4.1 Build & Lint

```bash
cd /Users/pupa/projects/etymology-explorer

# 1. Lint check
yarn lint

# 2. Auto-fix (if needed)
yarn lint:fix

# 3. Format check
yarn format:check

# 4. Production build
yarn build

# 5. Start production server
yarn start
```

**Expected:** All pass with no errors.

### 4.2 Manual Page Verification

| Route                      | Checks                                            |
| -------------------------- | ------------------------------------------------- |
| `/`                        | Search works, history loads, settings modal opens |
| `/faq`                     | Accordion expands/collapses, search links work    |
| `/learn/what-is-etymology` | Page renders, internal links work                 |
| `/sitemap.xml`             | Contains all 3 URLs                               |

### 4.3 Schema Validation

1. Open `/faq` → View Source → Find `<script type="application/ld+json">`
2. Validate at https://validator.schema.org/ or https://search.google.com/test/rich-results
3. Expect: Valid FAQPage with 6 Question entities

### 4.4 Smoke Test (with API key)

1. Search "telephone" → multiple roots
2. Search "perfidious" → single root with related words
3. Click related word → new search
4. "Surprise me" → random word
5. Pronunciation button → speaker icon present

---

## Critical Files (Final Scope)

| File                           | Change                                     | Status                   |
| ------------------------------ | ------------------------------------------ | ------------------------ |
| `CLAUDE.md`                    | Add missing routes, components, data files | ✅ Include               |
| `README.md`                    | Update project structure, API table        | ✅ Include               |
| `lib/claude.ts`                | Add try-catch for JSON.parse               | ✅ Include               |
| `lib/schemas/etymology.ts`     | Fix ancestryGraph schema                   | ✅ Include               |
| `components/EtymologyCard.tsx` | Add optional chaining                      | ✅ Include               |
| `lib/research.ts`              | Parallelize root research                  | ✅ Include (High Impact) |
| `components/RootChip.tsx`      | Add memo() wrapper                         | ❌ Skip                  |
| `lib/cache.ts`                 | Add model to cache key                     | ❌ Skip                  |

---

## Commit Message

```
chore: update docs, fix bugs, parallelize research for Task 8

- Add FAQ, Learn, SEO routes to CLAUDE.md
- Add missing components and data files to docs
- Update API endpoints table with /api/pronunciation
- Update README.md project structure
- Fix uncaught JSON.parse in LLM client
- Fix ancestryGraph schema mismatch (required vs optional)
- Add defensive optional chaining in EtymologyCard
- Parallelize root research for 2-3x latency reduction
```
