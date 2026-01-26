# Parallel Feature Development Plan: Tasks 3, 4, 5

## Current Status (Post-PR #31)

**COMPLETED:**

- ✅ Task 1: Cache Infrastructure (#9)
- ✅ Task 2: Schema Extension (types, claude.ts, prompts.ts)
- ✅ Task 6: Pronunciation Audio (#8)

**IN PROGRESS (This Sprint):**

- ⏳ Task 3: POS Tags UI (#25)
- ⏳ Task 4: Related Words UI (#23)
- ⏳ Task 5: Modern Slang (#6)

**DEFERRED:**

- Task 7: Convergent Roots (#7) - needs richer data first

## Parallel Development Strategy

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           GIT WORKTREE LAYOUT                               │
├────────────────────────────────────────────────────────────────────────────┤
│  Main Repo (stays on main)                                                  │
│  /Users/pupa/projects/etymology-explorer                                    │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Worktree 1      │  │ Worktree 2      │  │ Worktree 3      │             │
│  │ ../etym-pos     │  │ ../etym-related │  │ ../etym-slang   │             │
│  │                 │  │                 │  │                 │             │
│  │ Branch:         │  │ Branch:         │  │ Branch:         │             │
│  │ feat/issue-25   │  │ feat/issue-23   │  │ feat/issue-6    │             │
│  │                 │  │                 │  │                 │             │
│  │ Task 3: POS     │  │ Task 4: Related │  │ Task 5: Slang   │             │
│  │ Tags UI         │  │ Words UI        │  │ (Full-stack)    │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Worktree Setup Commands

```bash
# From main repo directory
cd /Users/pupa/projects/etymology-explorer

# Create 3 worktrees
git worktree add ../etym-pos feat/issue-25-pos-tags
git worktree add ../etym-related feat/issue-23-related-words
git worktree add ../etym-slang feat/issue-6-modern-slang

# Copy .env to each worktree for testing
cp .env ../etym-pos/
cp .env ../etym-related/
cp .env ../etym-slang/
```

---

## Task 3: POS Tags UI (#25)

**Worktree**: `../etym-pos`
**Branch**: `feat/issue-25-pos-tags`
**Complexity**: Low (UI only)

### Files to Modify

| File                           | Change                                  |
| ------------------------------ | --------------------------------------- |
| `components/EtymologyCard.tsx` | Add POS badges section after definition |

### Implementation

Add POS section in header, after definition:

```tsx
{
  /* POS Tags - after definition */
}
{
  result.partsOfSpeech && result.partsOfSpeech.length > 0 && (
    <div className="flex flex-wrap gap-2 mt-4">
      {result.partsOfSpeech.map(({ pos, definition, pronunciation }, idx) => (
        <div
          key={`${pos}-${idx}`}
          className="group inline-flex items-center gap-2 px-3 py-1.5 bg-cream-dark/50 border border-charcoal/10 rounded-full"
          title={definition}
        >
          <span className="text-xs font-serif uppercase tracking-wider text-charcoal/60">
            {pos}
          </span>
          {pronunciation && pronunciation !== result.pronunciation && (
            <span className="text-xs font-serif italic text-charcoal/50">{pronunciation}</span>
          )}
        </div>
      ))}
    </div>
  )
}
```

### UI Design

```
perfidious  /pərˈfɪdiəs/
─────────────────────────────────
disloyal, deceitful, treacherous

[adjective]
```

For words with pronunciation variants:

```
record  /ˈrekərd/
────────────────────────────────
a preserved account or evidence

[noun /ˈrekərd/] [verb /rɪˈkɔːrd/]
```

### Verification

1. `yarn dev` in worktree
2. Search "record" → noun and verb badges with different pronunciations
3. Search "run" → multiple POS (noun, verb) without pronunciation variants
4. Search "cat" → single POS badge (noun)
5. `yarn lint && yarn format`

---

## Task 4: Related Words UI (#23)

**Worktree**: `../etym-related`
**Branch**: `feat/issue-23-related-words`
**Complexity**: Low (UI only)

### Files to Modify

| File                           | Change                                      |
| ------------------------------ | ------------------------------------------- |
| `components/EtymologyCard.tsx` | Add Related Words section after "The Story" |

### Implementation

Add new section before footer:

```tsx
{
  /* Related Words / Suggestions - after lore section */
}
{
  result.suggestions && (
    <section className="mb-8">
      <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-4">
        Related Words
      </h2>
      <div className="space-y-4">
        {result.suggestions.synonyms && result.suggestions.synonyms.length > 0 && (
          <SuggestionRow
            label="Synonyms"
            words={result.suggestions.synonyms}
            onWordClick={onWordClick}
            color="emerald"
          />
        )}
        {result.suggestions.antonyms && result.suggestions.antonyms.length > 0 && (
          <SuggestionRow
            label="Antonyms"
            words={result.suggestions.antonyms}
            onWordClick={onWordClick}
            color="rose"
          />
        )}
        {result.suggestions.homophones && result.suggestions.homophones.length > 0 && (
          <SuggestionRow
            label="Homophones"
            words={result.suggestions.homophones}
            onWordClick={onWordClick}
            color="amber"
          />
        )}
        {result.suggestions.easilyConfusedWith &&
          result.suggestions.easilyConfusedWith.length > 0 && (
            <SuggestionRow
              label="Often Confused With"
              words={result.suggestions.easilyConfusedWith}
              onWordClick={onWordClick}
              color="blue"
            />
          )}
        {result.suggestions.seeAlso && result.suggestions.seeAlso.length > 0 && (
          <SuggestionRow
            label="See Also"
            words={result.suggestions.seeAlso}
            onWordClick={onWordClick}
            color="purple"
          />
        )}
      </div>
    </section>
  )
}
```

Helper component:

```tsx
function SuggestionRow({
  label,
  words,
  onWordClick,
  color,
}: {
  label: string
  words: string[]
  onWordClick: (word: string) => void
  color: 'emerald' | 'rose' | 'amber' | 'blue' | 'purple'
}) {
  const colorClasses = {
    emerald: 'border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300',
    rose: 'border-rose-200 hover:bg-rose-50 hover:border-rose-300',
    amber: 'border-amber-200 hover:bg-amber-50 hover:border-amber-300',
    blue: 'border-blue-200 hover:bg-blue-50 hover:border-blue-300',
    purple: 'border-purple-200 hover:bg-purple-50 hover:border-purple-300',
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-serif uppercase tracking-wider text-charcoal/40 w-32 shrink-0">
        {label}
      </span>
      {words.map((word) => (
        <button
          key={word}
          onClick={() => onWordClick(word)}
          className={`
            px-2.5 py-1 text-sm font-serif text-charcoal/80
            border rounded-md transition-colors cursor-pointer
            ${colorClasses[color]}
          `}
        >
          {word}
        </button>
      ))}
    </div>
  )
}
```

### UI Design

```
Related Words
─────────────────────────────────────────────────
Synonyms         [influence] [impact] [alter]
Antonyms         [preserve] [maintain]
Often Confused   [effect]
See Also         [emotion] [affection]
```

### Verification

1. `yarn dev` in worktree
2. Search "affect" → "effect" in "Often Confused With"
3. Search "their" → homophones "there", "they're"
4. Click any chip → verify new search triggers
5. `yarn lint && yarn format`

---

## Task 5: Modern Slang (#6)

**Worktree**: `../etym-slang`
**Branch**: `feat/issue-6-modern-slang`
**Complexity**: Medium (full-stack)

### Files to Create

| File                     | Purpose                               |
| ------------------------ | ------------------------------------- |
| `lib/wikipedia.ts`       | Wikipedia REST API fetcher            |
| `lib/urbanDictionary.ts` | Urban Dictionary API with NSFW filter |

### Files to Modify

| File                           | Change                                       |
| ------------------------------ | -------------------------------------------- |
| `lib/research.ts`              | Add Wikipedia + UD to Phase 1 parallel fetch |
| `lib/types.ts`                 | Extend `ResearchContext` with new sources    |
| `components/EtymologyCard.tsx` | Add Modern Usage section                     |

### Implementation

**`lib/wikipedia.ts`**:

```typescript
import { SourceData } from './types'

const WIKIPEDIA_REST_API = 'https://en.wikipedia.org/api/rest_v1/page/summary'

export async function fetchWikipedia(word: string): Promise<SourceData | null> {
  try {
    const response = await fetch(`${WIKIPEDIA_REST_API}/${encodeURIComponent(word)}`, {
      headers: { 'User-Agent': 'EtymologyExplorer/1.0' },
    })

    if (!response.ok) return null

    const data = await response.json()

    if (data.type === 'disambiguation' || !data.extract) {
      return null
    }

    return {
      text: data.extract,
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${word}`,
    }
  } catch {
    return null
  }
}
```

**`lib/urbanDictionary.ts`**:

```typescript
import { SourceData } from './types'

const URBAN_DICTIONARY_API = 'https://api.urbandictionary.com/v0/define'

const NSFW_WORDS = [
  'fuck',
  'shit',
  'cock',
  'dick',
  'pussy',
  'cunt',
  'ass',
  'penis',
  'vagina',
  'anal',
  'orgasm',
  'ejaculate',
  'masturbat',
]

function isClean(text: string): boolean {
  const lower = text.toLowerCase()
  return !NSFW_WORDS.some((word) => lower.includes(word))
}

export async function fetchUrbanDictionary(word: string): Promise<SourceData | null> {
  try {
    const response = await fetch(`${URBAN_DICTIONARY_API}?term=${encodeURIComponent(word)}`)

    if (!response.ok) return null

    const data = await response.json()

    // Filter to clean definitions with decent votes
    const filtered = (data.list || [])
      .filter((d: { thumbs_up: number }) => d.thumbs_up > 100)
      .filter(
        (d: { definition: string; example: string }) =>
          isClean(d.definition) && isClean(d.example || '')
      )
      .slice(0, 2)

    if (filtered.length === 0) return null

    const text = filtered
      .map((d: { definition: string }) => d.definition.replace(/\[|\]/g, ''))
      .join('\n\n')

    return {
      text,
      url: `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(word)}`,
    }
  } catch {
    return null
  }
}
```

**`lib/research.ts`** (Phase 1 modification):

```typescript
import { fetchWikipedia } from './wikipedia'
import { fetchUrbanDictionary } from './urbanDictionary'

// In conductAgenticResearch, Phase 1:
const [etymonlineData, wiktionaryData, wikipediaData, urbanDictData] = await Promise.all([
  fetchEtymonline(normalizedWord),
  fetchWiktionary(normalizedWord),
  fetchWikipedia(normalizedWord).catch(() => null),
  fetchUrbanDictionary(normalizedWord).catch(() => null),
])
totalFetches += 4

// Add to context:
const context: ResearchContext = {
  mainWord: {
    word: normalizedWord,
    etymonline: etymonlineData,
    wiktionary: wiktionaryData,
    wikipedia: wikipediaData, // NEW
    urbanDictionary: urbanDictData, // NEW
  },
  // ...
}
```

**`lib/types.ts`** (extend ResearchContext):

```typescript
export interface ResearchContext {
  mainWord: {
    word: string
    etymonline: SourceData | null
    wiktionary: SourceData | null
    wikipedia?: SourceData | null // NEW
    urbanDictionary?: SourceData | null // NEW
  }
  // ...
}
```

**`components/EtymologyCard.tsx`** (add Modern Usage section):

```tsx
{
  /* Modern Usage - after lore, before related words */
}
{
  result.modernUsage && result.modernUsage.hasSlangMeaning && (
    <section className="mb-8">
      <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-4">
        Modern Usage
      </h2>
      <div className="relative pl-6 border-l-2 border-violet-200">
        {result.modernUsage.slangDefinition && (
          <p className="font-serif text-lg text-charcoal/80 leading-relaxed mb-3">
            {result.modernUsage.slangDefinition}
          </p>
        )}
        {result.modernUsage.popularizedBy && (
          <p className="text-sm text-charcoal/60 mb-2">
            <span className="font-medium">Popularized by:</span> {result.modernUsage.popularizedBy}
          </p>
        )}
        {result.modernUsage.contexts && result.modernUsage.contexts.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {result.modernUsage.contexts.map((ctx) => (
              <span
                key={ctx}
                className="px-2 py-0.5 text-xs font-serif bg-violet-50 text-violet-700 border border-violet-200 rounded-full"
              >
                {ctx}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
```

### Verification

1. `yarn dev` in worktree
2. Search "slay" → Modern Usage section with LGBTQ+/drag culture context
3. Search "yeet" → contexts and popularizedBy
4. Search "cat" → no Modern Usage section (hasSlangMeaning: false)
5. `yarn lint && yarn format`

---

## Merge Strategy

After all 3 agents complete:

```bash
cd /Users/pupa/projects/etymology-explorer

# Merge in order (smallest diff first to minimize conflicts)
git checkout main
git pull origin main

# 1. Merge POS (header area)
git merge feat/issue-25-pos-tags --no-ff -m "feat(#25): add POS tags UI"

# 2. Merge Related Words (new section after lore)
git merge feat/issue-23-related-words --no-ff -m "feat(#23): add related words suggestions UI"

# 3. Merge Modern Slang (new files + new section)
git merge feat/issue-6-modern-slang --no-ff -m "feat(#6): add modern slang sources and UI"

# Clean up worktrees
git worktree remove ../etym-pos
git worktree remove ../etym-related
git worktree remove ../etym-slang

# Delete merged branches
git branch -d feat/issue-25-pos-tags feat/issue-23-related-words feat/issue-6-modern-slang
```

### Potential Merge Conflicts

| File                | Conflict Area | Resolution                                                              |
| ------------------- | ------------- | ----------------------------------------------------------------------- |
| `EtymologyCard.tsx` | Section order | Keep all 3 sections in order: POS (header), Modern Usage, Related Words |
| `lib/research.ts`   | Phase 1 fetch | Add all 4 fetchers in Promise.all                                       |

---

## Final Verification Checklist

After merging all 3:

- [ ] `yarn lint` passes
- [ ] `yarn build` succeeds
- [ ] Search "record" → POS tags with pronunciations
- [ ] Search "affect" → Related words with "effect" disambiguation
- [ ] Search "slay" → Modern usage section visible
- [ ] Click any related word → new search triggers
- [ ] Pronunciation audio still works (regression test)

---

## Open Questions

None - all requirements clear from existing schema and prompts.
