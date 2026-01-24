# Issue #25: Add POS (Part of Speech) tag words

**Status:** Open
**Labels:** `enhancement`
**Created:** 2026-01-11
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/25

---

## Problem

The words currently lack information about the part of speech (POS) they belong to. Having this information will help users understand how words function grammatically and how etymology may differ across parts of speech.

## Implementation Context

### Current State

The `EtymologyResult` type in `lib/types.ts` has a `definition` field but no explicit part-of-speech information:

```typescript
interface EtymologyResult {
  word: string
  pronunciation: string
  definition: string // Brief definition, no POS
  roots: Root[]
  // ...
}
```

### Why This Matters

Many English words can function as multiple parts of speech with different meanings:

- **"run"**: noun (a run in the park), verb (to run fast)
- **"light"**: noun (turn on the light), adjective (light weight), verb (light a candle)
- **"record"**: noun (/ˈrekərd/ - a vinyl record), verb (/rɪˈkɔːrd/ - to record a song)

Sometimes the etymology differs by POS, or the word evolved into new POS over time.

### Proposed Changes

**1. Extend `lib/types.ts` with POS support:**

```typescript
type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'preposition'
  | 'conjunction'
  | 'pronoun'
  | 'interjection'
  | 'determiner'

interface POSDefinition {
  pos: PartOfSpeech
  definition: string
  pronunciation?: string // If different per POS (e.g., "record")
}

interface EtymologyResult {
  word: string
  pronunciation: string // Primary/most common pronunciation
  partsOfSpeech: POSDefinition[] // All POS with definitions
  definition: string // Primary definition (for backwards compat)
  roots: Root[]
  // ...
}
```

**2. Update LLM prompt in `lib/prompts.ts`:**

```typescript
const POS_INSTRUCTIONS = `
Identify all common parts of speech (POS) for this word.
For each POS, provide:
- The part of speech (noun, verb, adjective, etc.)
- A brief definition specific to that POS
- The pronunciation if it differs from the primary pronunciation

Common POS to consider: noun, verb, adjective, adverb, preposition, conjunction, pronoun, interjection, determiner.
`
```

**3. Update JSON schema:**

```typescript
partsOfSpeech: {
  type: "array",
  items: {
    type: "object",
    properties: {
      pos: {
        type: "string",
        enum: ["noun", "verb", "adjective", "adverb", "preposition",
               "conjunction", "pronoun", "interjection", "determiner"]
      },
      definition: { type: "string" },
      pronunciation: { type: "string" }
    },
    required: ["pos", "definition"]
  }
}
```

**4. Update UI in `components/EtymologyCard.tsx`:**

Display POS tags as chips or badges:

```tsx
<div className="pos-tags">
  {result.partsOfSpeech.map(({ pos, definition }) => (
    <div key={pos} className="pos-tag">
      <span className="pos-label">{pos}</span>
      <span className="pos-definition">{definition}</span>
    </div>
  ))}
</div>
```

### Files to Modify

- `lib/types.ts` - Add POSDefinition interface, update EtymologyResult
- `lib/prompts.ts` - Update system prompt and JSON schema
- `components/EtymologyCard.tsx` - Add POS display

### Example Output

For the word **"record"**:

**Parts of Speech:**

- **noun** /ˈrekərd/ - A thing constituting evidence; a vinyl disc
- **verb** /rɪˈkɔːrd/ - To set down in writing; to capture sound or video

**Etymology:**
Both derive from Latin "recordari" (to remember), from "re-" (again) + "cor" (heart).
The stress shift between noun and verb is a common English pattern.

---

## Contributing

To work on this issue:

1. Create branch: `git checkout -b feat/issue-25-pos-tags`
2. Implement changes per the context above
3. Create PR with title: `feat: <description>`
4. In PR description, add: `Closes #25`

**Auto-close:** Include `Closes #25`, `Fixes #25`, or `Resolves #25` in the PR **description** (not title) to auto-close when merged.
