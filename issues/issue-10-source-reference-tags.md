# Issue #10: Show word and source in reference tags

**Status:** Open
**Labels:** `enhancement`, `good first issue`
**Created:** 2026-01-05
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/10

---

## Problem

Right now, the sources show just "Wiktionary" or "EtymOnline" with no info on what's inside. Would be better if we could also indicate what word the link redirects to along with the domain info.

## Implementation Context

### Current State

Looking at `lib/types.ts`, the `SourceReference` type is:

```typescript
interface SourceReference {
  source: 'etymonline' | 'wiktionary'
  url?: string
}
```

The sources are populated by `lib/etymonline.ts` and `lib/wiktionary.ts` scrapers during the agentic research phase in `lib/research.ts`.

### Proposed Changes

**1. Extend `SourceReference` type in `lib/types.ts`:**

```typescript
interface SourceReference {
  source: 'etymonline' | 'wiktionary'
  word: string // The specific word that was looked up
  url: string // Direct link to the source page
  displayName?: string // Human-readable label, e.g., "EtymOnline: algorithm"
}
```

**2. Update `lib/etymonline.ts` to return the full URL:**

```typescript
export async function fetchEtymonline(word: string): Promise<EtymonlineResult> {
  const url = `https://www.etymonline.com/word/${encodeURIComponent(word)}`
  // ... existing scraping logic
  return {
    // ... existing fields
    source: {
      source: 'etymonline',
      word: word,
      url: url,
    },
  }
}
```

**3. Update `lib/wiktionary.ts` similarly:**

```typescript
const url = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`
```

**4. Update `components/EtymologyCard.tsx` to display enhanced source info:**

```tsx
{
  result.sources.map((src) => (
    <a href={src.url} target="_blank" className="source-chip">
      {src.source === 'etymonline' ? 'EtymOnline' : 'Wiktionary'}: {src.word}
    </a>
  ))
}
```

### Files to Modify

- `lib/types.ts` - Extend SourceReference interface
- `lib/etymonline.ts` - Return full URL and word
- `lib/wiktionary.ts` - Return full URL and word
- `lib/research.ts` - Ensure source metadata flows through
- `lib/prompts.ts` - Update JSON schema if needed
- `components/EtymologyCard.tsx` - Update UI to show word + domain
