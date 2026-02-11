# Plan: Grounded Etymology Tree

## Problem

The ancestry tree is built entirely from LLM hallucination. Etymonline returns text like `"from Latin perfidia 'faithlessness,' from perfidus 'faithless,' from PIE root *bheid-"` but we throw away that structure — the LLM reverse-engineers it from prose, often inventing stages, misordering them, or fabricating PIE roots.

## Core Insight

Both Etymonline and Wiktionary have **highly regular "from X, from Y" chains** in their text. We can pre-parse these into structured `{language, form, meaning}` tuples BEFORE the LLM call, then:

1. Feed parsed chains to the LLM so it **validates/extends** rather than invents from scratch
2. **Post-process** the LLM's output by matching stages against parsed evidence to assign confidence + source attribution (the LLM should NOT self-assess confidence — we determine it programmatically)

## Architecture

```
                     CURRENT                              PROPOSED
                     ─────────                            ──────────
Raw text ──→ LLM (guesses structure) ──→ Tree    Raw text ──→ Parser (extracts chains)
                                                              ↓
                                                   Parsed chains + raw text ──→ LLM (validates/extends)
                                                              ↓
                                                   LLM output ──→ Post-processor (matches stages to evidence)
                                                              ↓
                                                   Enriched graph ──→ Tree (with confidence + sources)
```

---

## Step 1: New file `lib/etymologyParser.ts` — Pre-parse chains from source text

**New types** (in this file, exported):

```ts
interface ParsedEtymLink {
  language: string // "Latin", "Old French", "Proto-Indo-European"
  form: string // "perfidia", "*bheid-"
  meaning?: string // "faithlessness"
  isReconstructed: boolean // true for PIE *-prefixed forms
  rawSnippet: string // exact substring from source that yielded this
}

interface ParsedEtymChain {
  source: 'etymonline' | 'wiktionary'
  word: string
  links: ParsedEtymLink[] // ordered modern → oldest
  dateAttested?: string // "1590s"
}
```

**Parsing strategy** — multi-pass, not one giant regex:

1. Split text on `from ` (case-insensitive) to get segments
2. For each segment, match against `KNOWN_LANGUAGES` list (~30 languages including PIE, Proto-Germanic, Old French, Latin, Greek, Sanskrit, Arabic, etc.)
3. After language name, extract word form (up to first comma/quote)
4. If quotes follow (`"meaning"` or `'meaning'`), extract meaning
5. Detect `*`-prefix and `PIE root` markers for `isReconstructed`
6. Wiktionary variant: also handle `("meaning")` parenthesized format

**Exported functions:**

- `parseEtymonlineText(text, word) → ParsedEtymChain`
- `parseWiktionaryText(text, word) → ParsedEtymChain`
- `parseSourceTexts(word, etymonlineText, wiktionaryText) → ParsedEtymChain[]` — convenience wrapper

---

## Step 2: New file `lib/etymologyEnricher.ts` — Post-process LLM output

After LLM returns `AncestryGraph`, match each stage against parsed chains:

**New types** (in `lib/types.ts`):

```ts
interface StageEvidence {
  source: 'etymonline' | 'wiktionary'
  snippet: string // raw text excerpt (~120 chars max)
}

type StageConfidence = 'high' | 'medium' | 'low'
// high = form found in 2+ source chains
// medium = form found in 1 source chain
// low = no match in any parsed chain (LLM-only)

// Extend AncestryStage with optional new fields:
interface AncestryStage {
  stage: string
  form: string
  note: string // existing
  isReconstructed?: boolean // NEW
  confidence?: StageConfidence // NEW
  evidence?: StageEvidence[] // NEW
}
```

**Matching algorithm** in `enrichAncestryGraph(graph, parsedChains)`:

- For each `stage` in each branch, fuzzy-match `stage.form` against parsed links by:
  - Normalize both (lowercase, strip diacritics, strip parentheticals)
  - Check substring containment (parsed link form ⊂ stage form or vice versa)
  - Also match by language name (stage.stage ≈ link.language)
- Count how many sources attest each match → assign confidence
- Attach `evidence[]` with source name + raw snippet
- Set `isReconstructed = true` if form starts with `*` or stage contains "Proto-Indo-European"

**No LLM schema changes needed.** The enrichment is purely post-processing.

---

## Step 3: Modify `lib/research.ts` — Integrate parser into pipeline

Insert **Phase 1.5** between fetch and root extraction:

```ts
// After Phase 1 parallel fetch, before Phase 2 root extraction:
console.log('[Research] Phase 1.5: Pre-parsing etymology chains')
const parsedChains = parseSourceTexts(word, etymonlineText, wiktionaryText)
context.parsedChains = parsedChains // new optional field on ResearchContext
```

Also update `buildResearchPrompt()` to append parsed chains to prompt:

```
=== Pre-Parsed Etymology Chains ===
(Extracted from source text. Use as ground truth for ancestry stages.)

--- Chain from etymonline ---
First attested: 1590s
  French: perfidie
  Latin: perfidia "faithlessness, falsehood, treachery"
  Latin: perfidus "faithless"
  Latin: fides "faith"
  Proto-Indo-European: *bheid- "to trust, confide" [RECONSTRUCTED]
```

**Zero new API calls.** Parsing is CPU-only on already-fetched data.

---

## Step 4: Modify `lib/types.ts` — Extend types

- Add `StageEvidence`, `StageConfidence` types
- Add optional `isReconstructed`, `confidence`, `evidence` to `AncestryStage`
- Add optional `parsedChains` to `ResearchContext`

All additions are optional → backward compatible with cached results.

---

## Step 5: Modify `lib/schemas/etymology.ts` — Zod accepts new fields

The Zod schema already uses `.passthrough()` at the top level, but `AncestryStageSchema` is strict. Add optional fields:

```ts
const AncestryStageSchema = z.object({
  stage: z.string(),
  form: z.string(),
  note: z.string().optional(),
  isReconstructed: z.boolean().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  evidence: z.array(z.object({ source: z.string(), snippet: z.string() })).optional(),
})
```

**Do NOT modify `lib/schemas/llm-schema.ts`** — the LLM schema stays unchanged. Enrichment happens post-LLM.

---

## Step 6: Modify `lib/claude.ts` — Add enrichment post-processing

In `synthesizeFromResearch()`, after parsing LLM response:

```ts
const result = await generateEtymologyResponse(userPrompt, llmConfig)

// NEW: Enrich with source evidence
if (researchContext.parsedChains?.length) {
  enrichAncestryGraph(result.ancestryGraph, researchContext.parsedChains)
}
```

---

## Step 7: Modify `lib/prompts.ts` — Update system prompt

Add to `SYSTEM_PROMPT` after the ancestry graph guidelines:

```
GROUNDED ANCESTRY:
- When pre-parsed etymology chains are provided below the raw text, use them as the backbone of your ancestryGraph stages.
- Prefer forms/spellings from the parsed chains over your training data.
- Do NOT invent PIE roots that aren't in the parsed chains unless you have high confidence.
- You may add intermediate stages the parser missed, but keep them minimal.
```

Update `buildRichUserPrompt()` to mention parsed chains when present.

---

## Step 8: Modify `components/AncestryTree.tsx` — Visual improvements

Keep **vertical layout** (better for mobile, matches scholarly aesthetic). Add:

### 8a. Confidence indicators on each StageNode

- `high` → solid green dot + "Verified" tooltip
- `medium` → amber dot + "Single source" tooltip
- `low` → gray dot + "AI-inferred" tooltip
- No confidence data (old cache) → no indicator shown

### 8b. Source attribution pills

Small badges below each stage note: `etymonline` | `wiktionary` | `AI`
Colors: amber for etymonline, blue for wiktionary, purple for AI

### 8c. Reconstructed form styling

PIE/\*-prefixed forms get:

- Dashed border instead of solid
- Italic form text
- Small "reconstructed" label
- Slightly muted colors (stone palette)

### 8d. Evidence popover (click to expand)

Clicking a stage with evidence shows the raw source snippet in a popover/tooltip. Styled like a marginalia note:

- Left-border accent (4px)
- Serif italic text
- Small source label
- Click outside to dismiss
- On mobile: expands inline (accordion) instead of popover

### 8e. Staggered reveal animation (CSS-only)

```css
@keyframes stageReveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Each stage gets `animationDelay: ${idx * 100}ms`.

### 8f. Better merge SVG

Replace straight V-lines with smooth bezier curves for merge visualization.

---

## Files to modify (ordered by dependency)

| Order | File                          | Change                                                                                   |
| ----- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| 1     | `lib/etymologyParser.ts`      | **NEW** — pre-parse "from X" chains                                                      |
| 2     | `lib/types.ts`                | Add `StageEvidence`, `StageConfidence`, extend `AncestryStage`, extend `ResearchContext` |
| 3     | `lib/schemas/etymology.ts`    | Add optional fields to `AncestryStageSchema`                                             |
| 4     | `lib/etymologyEnricher.ts`    | **NEW** — post-process LLM output, match stages to parsed evidence                       |
| 5     | `lib/research.ts`             | Insert Phase 1.5 parsing, update `buildResearchPrompt`                                   |
| 6     | `lib/prompts.ts`              | Update system prompt with grounding instructions, update `buildRichUserPrompt`           |
| 7     | `lib/claude.ts`               | Call enricher after LLM response in `synthesizeFromResearch`                             |
| 8     | `components/AncestryTree.tsx` | Confidence dots, source pills, reconstructed styling, evidence popover, animation        |

## Verification

1. `yarn lint` — passes
2. `yarn build` — passes (no type errors from new optional fields)
3. Manual test: search "perfidy" → verify tree shows confidence dots, source pills, correct PIE root
4. Manual test: search "telephone" → verify 2-branch merge with per-stage evidence
5. Manual test: search a rare word → verify graceful fallback when parser finds nothing (all stages show "low"/"AI" or no indicator)
6. Check mobile responsiveness — evidence shows as inline accordion, not popover

## Resolved decisions

1. **Evidence snippet length** — cap at ~120 chars. Trim to nearest word boundary.
2. **Cache invalidation** — bump cache version to force re-fetch. All users get enriched results on next search.
3. **Token budget** — include full per-source parsed chains in prompt. ~200-400 extra input tokens, well within limits.
