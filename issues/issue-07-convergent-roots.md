# Issue #7: Improve linking of common roots and remove irrelevant roots

**Status:** Open (visualization remaining)
**Labels:** `bug`
**Created:** 2026-01-05
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/7

---

## Progress (PR #31)

✅ **Backend complete:**

- `lib/types.ts` - Added `ConvergencePoint` interface, `convergencePoints` to `AncestryGraph`
- `lib/claude.ts` - Extended schema with `convergencePoints` property
- `lib/prompts.ts` - Added convergent etymology guidelines
- `lib/schemas/etymology.ts` - Zod validation for convergencePoints

⏳ **Remaining:** `components/AncestryTree.tsx` - Visual update to show shared PIE ancestors

---

## Problem

Not all roots have to be independent. There can be shared histories as well. Basically, do not force any particular structure. Feel free to reuse blocks if they are relevant to avoid duplication.

## Implementation Context

### The Real Problem

The issue is about **convergent etymology** - when multiple morphemes in a word trace back to the **same ancestral root**.

**Example: "lexicology"**

- **lexic-** (Greek "lexikos" = "of words") ← Greek "lexis" (word) ← PIE **\*leg-** (to collect, speak)
- **-logy** (Greek "logos" = "study, word") ← PIE **\*leg-** (to collect, speak)

Both morphemes derive from the **same PIE root _\*leg-_**! The current implementation likely treats them as independent trees, missing this fascinating connection.

**Other examples:**

- **"bibliography"**: "biblio-" and "-graphy" both trace to PIE roots related to writing/marking
- **"television"**: "tele-" (Greek) and "vision" (Latin) have independent roots, but could share Indo-European connections
- **"automobile"**: "auto-" (Greek "self") and "mobile" (Latin "movere") - truly independent

### Current State

The `AncestryGraph` in `lib/types.ts`:

```typescript
interface AncestryGraph {
  nodes: AncestryNode[]
  edges: AncestryEdge[]
}
```

The structure _supports_ DAGs (shared ancestors), but the LLM prompt in `lib/prompts.ts` likely doesn't instruct the model to look for convergent roots.

### Proposed Solution

**1. Update system prompt in `lib/prompts.ts`:**

```typescript
const ANCESTRY_INSTRUCTIONS = `
When generating the ancestry graph, look for CONVERGENT ETYMOLOGY:

1. Check if multiple morphemes trace back to the SAME Proto-Indo-European (PIE) root
2. If roots converge at a common ancestor, create a SINGLE node for that ancestor
3. Draw edges from multiple child nodes to the shared ancestor

Example for "lexicology":
- Both "lexic-" and "-logy" derive from PIE *leg- (to collect → to speak → word)
- The graph should show BOTH morphemes connecting to ONE PIE *leg- node

This is linguistically significant - it shows the word has internally reinforced meaning!

DO NOT create duplicate nodes for shared ancestors. The graph should be a true DAG.
`
```

**2. Enhance the JSON schema description:**

```typescript
ancestryGraph: {
  description: `A directed acyclic graph showing word evolution.
    CRITICAL: Identify when morphemes share common ancestors (especially PIE roots).
    Example: In "lexicology", both "lexic-" and "-logy" trace to PIE *leg-.
    Create ONE node for shared ancestors with edges from BOTH child morphemes.`,
}
```

**3. Add root convergence detection in `lib/research.ts`:**

```typescript
interface RootAnalysis {
  morpheme: string
  pieRoot?: string // e.g., "*leg-"
  pieMeaning?: string // e.g., "to collect, speak"
}

function detectConvergentRoots(roots: RootAnalysis[]): Map<string, string[]> {
  // Group morphemes by their PIE root
  const convergenceMap = new Map<string, string[]>()

  for (const root of roots) {
    if (root.pieRoot) {
      const existing = convergenceMap.get(root.pieRoot) || []
      existing.push(root.morpheme)
      convergenceMap.set(root.pieRoot, existing)
    }
  }

  // Return only roots with multiple morphemes (actual convergence)
  return new Map([...convergenceMap.entries()].filter(([_, morphemes]) => morphemes.length > 1))
}
```

**4. Update the LLM call to highlight convergence:**

Pass convergence info to the synthesis prompt:

```typescript
const convergentRoots = detectConvergentRoots(extractedRoots)
if (convergentRoots.size > 0) {
  prompt += '\n\nNOTE: Detected potential convergent etymology:\n'
  for (const [pieRoot, morphemes] of convergentRoots) {
    prompt += `- ${morphemes.join(' and ')} may share PIE root ${pieRoot}\n`
  }
  prompt += 'Verify and reflect this in the ancestry graph with shared nodes.\n'
}
```

**5. Add UI indicator for convergent roots (`components/EtymologyCard.tsx`):**

```tsx
{
  hasConvergentRoots && (
    <div className="convergence-callout">
      <span className="icon">🔄</span>
      <p>
        <strong>Convergent etymology:</strong> The roots "{root1}" and "{root2}" both trace back to
        PIE <em>{pieRoot}</em> ({pieMeaning})
      </p>
    </div>
  )
}
```

### Visual Example

**Before (incorrect - independent trees):**

```
lexicology
├── lexic- (Greek)
│   └── lexis
│       └── PIE *leg- ←─── DUPLICATE!
└── -logy (Greek)
    └── logos
        └── PIE *leg- ←─── DUPLICATE!
```

**After (correct - convergent graph):**

```
lexicology
├── lexic- (Greek "of words")
│   └── lexis (Greek "word")
│       └──┐
└── -logy (Greek "study")    │
    └── logos (Greek "word") │
        └──────────────────>─┴── PIE *leg- (to collect → to speak)
```

### Files to Modify

- `lib/prompts.ts` - Update system prompt to look for convergent roots
- `lib/research.ts` - Add convergence detection helper
- `lib/types.ts` - Optionally add `convergentWith?: string[]` to Root type
- `components/AncestryTree.tsx` - Ensure shared nodes render correctly
- `components/EtymologyCard.tsx` - Add convergence callout UI

### Why This Matters

Convergent etymology is linguistically fascinating - it shows when a word has "built-in redundancy" of meaning. "Lexicology" literally means "word-word-study" at the PIE level! Surfacing these connections makes the tool more educational and unique.

---

## Contributing

To work on this issue:

1. Create branch: `git checkout -b fix/issue-7-convergent-roots`
2. Implement changes per the context above
3. Create PR with title: `fix: <description>`
4. In PR description, add: `Closes #7`

**Auto-close:** Include `Closes #7`, `Fixes #7`, or `Resolves #7` in the PR **description** (not title) to auto-close when merged.
