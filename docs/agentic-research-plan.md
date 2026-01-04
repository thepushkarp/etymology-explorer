# Agentic Etymology Research Enhancement Plan

## Overview

This document outlines the plan to enhance the Etymology Explorer with:

1. Dynamic number of constituent roots (1 to many, not fixed at 2)
2. Agentic multi-source research phase with iterative lookups
3. Richer, longer lore with etymological ancestry context

## Current Architecture

```
User Search → /api/etymology
    ├── Parallel fetch: Etymonline + Wiktionary (single pass)
    ├── LLM synthesis (single call, 1024 tokens)
    └── Response: EtymologyResult
```

**Limitations:**

- Only fetches data for the searched word (no root exploration)
- Fixed single-pass synthesis
- Short lore (2-3 sentences)
- No lateral/ancestral exploration

## Proposed Architecture

```
User Search → /api/etymology
    ├── Phase 1: Initial Fetch (Etymonline + Wiktionary for main word)
    ├── Phase 2: Root Extraction (quick LLM call to identify roots)
    ├── Phase 3: Agentic Research Loop
    │   ├── For each root: fetch Etymonline + Wiktionary
    │   ├── Identify related/ancestor words
    │   ├── Fetch data for related words (depth-limited)
    │   └── Aggregate all research context
    ├── Phase 4: Rich Synthesis (larger context, longer output)
    └── Response: Enhanced EtymologyResult with richer lore
```

## Implementation Steps

### Step 1: Update Type Definitions (`lib/types.ts`)

**Changes:**

- Keep `Root[]` as dynamic array (already supports 1+)
- Add `ResearchContext` interface for aggregated research
- Add optional `ancestorWords` and `descendantWords` to Root
- Extend lore field description for longer content

```typescript
interface ResearchContext {
  mainWord: SourceData | null
  rootResearch: RootResearchData[]
  relatedWordsData: Map<string, SourceData>
}

interface RootResearchData {
  root: string
  etymonlineData: SourceData | null
  wiktionaryData: SourceData | null
  relatedTerms: string[]
}

interface Root {
  root: string
  origin: string
  meaning: string
  relatedWords: string[] // existing
  ancestorRoots?: string[] // NEW: PIE roots or older forms
  descendantWords?: string[] // NEW: modern derivatives
}
```

### Step 2: Create Agentic Research Module (`lib/research.ts`)

**New file with:**

- `extractRootsQuick()`: Fast LLM call to identify probable roots from initial data
- `fetchRootContext()`: Fetch Etymonline/Wiktionary for a specific root
- `identifyRelatedTerms()`: Extract related words mentioned in source text
- `conductAgenticResearch()`: Main orchestrator that:
  1. Fetches initial word data
  2. Extracts roots
  3. For each root, fetches additional context
  4. Identifies and fetches related words (depth-limited to 2)
  5. Returns aggregated ResearchContext

**Depth limits to control API costs:**

- Max 3 roots to explore
- Max 2 related words per root
- Max total of 8 additional fetches

### Step 3: Update Prompts (`lib/prompts.ts`)

**Changes:**

- Update system prompt to expect richer context
- Request 4-6 sentence lore instead of 2-3
- Emphasize etymological ancestry and word evolution
- Add instructions for variable number of roots

```typescript
// Updated lore instruction:
"lore": "4-6 sentences of rich etymology narrative. Include:
  - The word's journey through languages
  - Historical/cultural context of when meanings shifted
  - Connection to ancestor and sibling words
  - Memorable story elements that aid retention"
```

### Step 4: Update LLM Client (`lib/claude.ts`)

**Changes:**

- Update JSON schema for extended lore
- Add `ancestorRoots` and `descendantWords` to root schema
- Increase max_tokens from 1024 to 2048
- Add `extractRootsFromText()` for quick root identification
- Update `synthesizeEtymology()` to accept ResearchContext

### Step 5: Update API Route (`app/api/etymology/route.ts`)

**Changes:**

- Import and use new research module
- Replace simple parallel fetch with `conductAgenticResearch()`
- Pass full ResearchContext to synthesis
- Handle potential timeout with graceful degradation

### Step 6: Add Wikipedia Support (`lib/wikipedia.ts`)

**New file for additional context:**

- Fetch Wikipedia article summaries for cultural/historical context
- Use REST API: `https://en.wikipedia.org/api/rest_v1/page/summary/{word}`
- Optional enrichment for lore generation

## API Cost Management

To use API keys wisely:

1. Quick root extraction uses smaller model (claude-3-haiku or similar)
2. Depth-limited exploration (max 8 additional fetches)
3. Cache Etymonline/Wiktionary responses within same request
4. Final synthesis is the only "expensive" call

## Testing Plan

1. Test with simple single-root word: "cat"
2. Test with two-root word: "telephone" (tele + phone)
3. Test with complex multi-root word: "autobiography" (auto + bio + graph)
4. Verify lore length and quality
5. Check root exploration depth

## Rollback Plan

If agentic research causes issues:

- Keep existing simple synthesis as fallback
- Add `?simple=true` query param to bypass research phase
