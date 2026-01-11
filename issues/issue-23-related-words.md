# Issue #23: Add suggestions for related words, synonyms, antonyms, homophones, easily_confused_with etc

**Status:** Open
**Labels:** `enhancement`
**Created:** 2026-01-10
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/23

---

## Problem

The current etymology results lack suggestions for related words such as synonyms, antonyms, homophones, and commonly confused words. Adding these would enhance the educational value of the tool.

## Implementation Context

### Current State

The `EtymologyResult` type in `lib/types.ts` includes `roots[]` with `relatedWords`, but these are specifically words that share etymological roots, not linguistic relatives like synonyms or antonyms.

### Proposed Changes

**1. Extend `lib/types.ts` with new suggestion types:**

```typescript
interface WordSuggestions {
  synonyms?: string[] // Words with similar meaning
  antonyms?: string[] // Words with opposite meaning
  homophones?: string[] // Words that sound the same (e.g., "their/there/they're")
  easilyConfusedWith?: string[] // Words often mistaken (e.g., "affect/effect")
  seeAlso?: string[] // Other interesting related words
}

interface EtymologyResult {
  // ... existing fields
  suggestions?: WordSuggestions
}
```

**2. Update LLM prompt in `lib/prompts.ts`:**

Add instructions for the LLM to identify and return these word relationships:

```typescript
const SUGGESTIONS_INSTRUCTIONS = `
Additionally, identify any of the following relationships for the word:
- synonyms: Words with similar meanings
- antonyms: Words with opposite meanings
- homophones: Words that sound identical but have different spellings/meanings
- easilyConfusedWith: Words commonly mistaken for this word (spelling or meaning)

Only include relationships that are genuinely useful - quality over quantity.
`
```

**3. Update JSON schema:**

```typescript
suggestions: {
  type: "object",
  properties: {
    synonyms: { type: "array", items: { type: "string" } },
    antonyms: { type: "array", items: { type: "string" } },
    homophones: { type: "array", items: { type: "string" } },
    easilyConfusedWith: { type: "array", items: { type: "string" } }
  }
}
```

**4. Update UI in `components/EtymologyCard.tsx`:**

Add a collapsible section for word suggestions:

```tsx
{
  result.suggestions && (
    <div className="suggestions-section">
      {result.suggestions.synonyms?.length > 0 && (
        <div className="synonym-chips">
          <h4>Synonyms</h4>
          {result.suggestions.synonyms.map((word) => (
            <WordChip key={word} word={word} onClick={handleSearch} />
          ))}
        </div>
      )}
      {/* Similar for antonyms, homophones, etc. */}
    </div>
  )
}
```

### Files to Modify

- `lib/types.ts` - Add WordSuggestions interface
- `lib/prompts.ts` - Update system prompt and JSON schema
- `components/EtymologyCard.tsx` - Add UI for displaying suggestions

### Example Output

For the word **"affect"**:

**Suggestions:**

- **Synonyms:** influence, impact, shape, alter
- **Antonyms:** leave alone, ignore
- **Easily Confused With:** effect (noun: result; verb: to bring about)
