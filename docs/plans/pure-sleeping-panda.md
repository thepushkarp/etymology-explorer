# Fix: Related Words Spacing on Mobile (Issue #35)

## Problem

On mobile, the "Related Words" section inside `EtymologyCard` has excessive horizontal padding. Root cause confirmed by 3 independent analyses (Explore, Gemini, Codex):

### Primary Culprit: `SuggestionRow` label `w-32 shrink-0`

**File**: `components/EtymologyCard.tsx:381`

```tsx
<span className="... w-32 shrink-0">  // 128px fixed width, never shrinks
```

On a 375px mobile screen:

- `px-4` (main): -32px
- `p-8` (card): -64px
- Available content: **279px**
- `w-32` label eats: -128px
- Left for chips: **~151px** (only 54% of content area)

The label ("Synonyms", "Antonyms", etc.) wastes ~46% of horizontal space on mobile, forcing chips to wrap awkwardly.

### Secondary: Card padding `p-8` on mobile

**File**: `components/EtymologyCard.tsx:39`

`p-8` = 32px per side = 64px total lost on mobile. Too generous for small screens.

## Fix

### Change 1: Stack `SuggestionRow` on mobile (EtymologyCard.tsx:380-381)

**Before:**

```tsx
<div className="flex flex-wrap items-center gap-2">
  <span className="text-xs font-serif uppercase tracking-wider text-charcoal/40 w-32 shrink-0">
```

**After:**

```tsx
<div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-2">
  <span className="text-xs font-serif uppercase tracking-wider text-charcoal/40 sm:w-32 sm:shrink-0">
```

- Mobile: column layout, label stacks above chips (full-width label, full-width chip row)
- `sm:` and up: original inline layout with `w-32` label preserved
- `gap-1.5` on mobile for tighter vertical spacing between label and chips

### Change 2: Reduce card padding on mobile (EtymologyCard.tsx:39)

**Before:**

```tsx
<div className="relative p-8 md:p-12">
```

**After:**

```tsx
<div className="relative p-5 sm:p-8 md:p-12">
```

Recovers 24px (12px/side) on smallest screens.

## Files Modified

- `components/EtymologyCard.tsx` (2 edits, lines 39 and 380-381)

## Verification

1. `yarn lint` - no lint errors
2. `yarn build` - builds successfully
3. Manual check: Open dev tools, toggle mobile viewport (375px width), search for a word, verify:
   - Labels stack above chips on mobile, no horizontal space waste
   - Chips have room to display naturally
   - Desktop layout unchanged (inline labels with `w-32`)
   - Card padding feels appropriate on mobile
