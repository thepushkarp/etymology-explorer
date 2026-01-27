# Code Simplification Review: etymology-explorer

## Summary

After reviewing the five key files (AncestryTree.tsx, EtymologyCard.tsx, SettingsModal.tsx, research.ts, claude.ts), I found a **well-maintained codebase** with clean separation of concerns. Most code is appropriately structured. There are a few modest simplification opportunities, but no major refactoring needed.

**Verdict**: The codebase is in good shape. I identified **3 actionable simplifications** and **2 minor cleanups**. I'm being conservative - only suggesting changes that clearly improve maintainability without adding complexity.

---

## Actionable Simplifications

### 1. EtymologyCard.tsx: Consolidate SuggestionRow Repetition (Lines 209-251)

**Current state**: Five nearly identical conditional blocks for rendering suggestion rows (synonyms, antonyms, homophones, easilyConfusedWith, seeAlso).

```tsx
{result.suggestions.synonyms && result.suggestions.synonyms.length > 0 && (
  <SuggestionRow label="Synonyms" words={result.suggestions.synonyms} ... color="emerald" />
)}
{result.suggestions.antonyms && result.suggestions.antonyms.length > 0 && (
  <SuggestionRow label="Antonyms" words={result.suggestions.antonyms} ... color="rose" />
)}
// ... 3 more identical patterns
```

**Suggested simplification**: Extract to a data-driven pattern:

```tsx
const suggestionTypes = [
  { key: 'synonyms', label: 'Synonyms', color: 'emerald' },
  { key: 'antonyms', label: 'Antonyms', color: 'rose' },
  { key: 'homophones', label: 'Homophones', color: 'amber' },
  { key: 'easilyConfusedWith', label: 'Often Confused With', color: 'blue' },
  { key: 'seeAlso', label: 'See Also', color: 'purple' },
] as const

// Then in JSX:
{
  suggestionTypes.map(({ key, label, color }) => {
    const words = result.suggestions?.[key]
    if (!words?.length) return null
    return (
      <SuggestionRow
        key={key}
        label={label}
        words={words}
        onWordClick={onWordClick}
        color={color}
      />
    )
  })
}
```

**Benefit**: Reduces 40+ lines to ~15, eliminates copy-paste risk, makes adding new suggestion types trivial.

---

### 2. SettingsModal.tsx: Extract Duplicated API Key Input Pattern (Lines 318-352 and 465-498)

**Current state**: Two nearly identical API key input blocks (Anthropic and OpenRouter), each with:

- Password input with show/hide toggle
- EyeIcon button
- Identical styling classes

**Suggested simplification**: Create `ApiKeyInput` component:

```tsx
function ApiKeyInput({
  value,
  onChange,
  showKey,
  onToggleShow,
  placeholder,
  inputRef,
}: {
  value: string
  onChange: (value: string) => void
  showKey: boolean
  onToggleShow: () => void
  placeholder: string
  inputRef?: React.RefObject<HTMLInputElement>
}) {
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type={showKey ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="..." // existing classes
      />
      <button type="button" onClick={onToggleShow} className="..." aria-label={...}>
        <EyeIcon show={showKey} />
      </button>
    </div>
  )
}
```

**Benefit**: Eliminates ~60 lines of duplication, ensures consistent behavior across both providers.

---

### 3. claude.ts: Deduplicate Provider Call Logic (Lines 306-341 and 347-398)

**Current state**: Two synthesis functions (`synthesizeEtymology` and `synthesizeFromResearch`) with identical provider-dispatch and source-building patterns:

```tsx
// Pattern repeated twice:
let responseText: string
if (llmConfig.provider === 'openrouter') {
  responseText = await callOpenRouter(userPrompt, llmConfig)
} else {
  responseText = await callAnthropic(userPrompt, llmConfig)
}
const result = JSON.parse(responseText) as EtymologyResult
```

**Suggested simplification**: Extract helper function:

```tsx
async function callLLM(userPrompt: string, config: LLMConfig): Promise<EtymologyResult> {
  const responseText =
    config.provider === 'openrouter'
      ? await callOpenRouter(userPrompt, config)
      : await callAnthropic(userPrompt, config)
  return JSON.parse(responseText) as EtymologyResult
}
```

**Benefit**: Single place to modify LLM dispatch logic, clearer intent.

---

## Minor Cleanups (Low Priority)

### 4. AncestryTree.tsx: gridColsClass could be a lookup object

**Current**: Function with if/else chain (lines 149-153)
**Suggestion**:

```tsx
const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1 max-w-xs mx-auto',
  2: 'grid-cols-2 max-w-lg mx-auto',
}
const gridColsClass = (count: number) => GRID_COLS[count] ?? 'grid-cols-3 max-w-2xl mx-auto'
```

**Impact**: Minimal - current code is fine.

### 5. research.ts: extractRelatedTerms regex loop could use matchAll

**Current**: Manual while loop with exec() (lines 129-138)
**Suggestion**: Modern `matchAll()` pattern
**Impact**: Minor readability improvement, current code works correctly.

---

## Things I Considered But Rejected

### SettingsModal multiple useEffects

Five useEffects handle different concerns (sync props, fetch models, focus, escape key). While seemingly many, each has a clear single responsibility. Combining them would reduce clarity.

### Schema duplication in claude.ts

The JSON schema is large (100+ lines) but correctly represents a complex type structure. Extracting to a separate file would add indirection without benefit since it's only used in one place.

### Color maps in AncestryTree and EtymologyCard

Both have color lookup objects. These are intentionally different (language stages vs source types) and don't share logic. Consolidating would create inappropriate coupling.

### Error handling patterns in research.ts

The current `.catch()` pattern for Wikipedia and Urban Dictionary is appropriate - these are supplementary sources where failure shouldn't block the main flow.

---

## Implementation Priority

1. **EtymologyCard suggestion rows** - Highest value, clear win
2. **SettingsModal ApiKeyInput** - Good deduplication opportunity
3. **claude.ts callLLM helper** - Small but clean improvement

All three changes are low-risk, localized, and don't change functionality.
