# UX Overhaul v2 - Learnings

## Phase 1A: Streaming Types (COMPLETED)

### StreamEvent Union Type

- Added 11 event shapes covering full streaming pipeline lifecycle
- Covers: source fetching (started/complete/failed), parsing, root identification, research, synthesis, enrichment, result, and error states
- Error type discriminated by `errorType` field: 'rate_limit' | 'budget' | 'network' | 'unknown'
- Placed after SecurityTelemetryEvent for logical grouping with other event types

### EtymologyResult Enhancement

- Added optional `rawSources` field: `{ wikipedia?: string; urbanDictionary?: string[] }`
- Maintains backward compatibility (optional field)
- Follows existing pattern of optional fields (partsOfSpeech, suggestions, modernUsage)
- Enables Phase 1B (Hidden Data) to surface raw source text to clients

### Type File Organization

- Existing file uses clear pattern: interfaces → types → exports
- All types properly exported with `export` keyword
- Docstrings follow existing style (brief, explanatory)
- Build passes with no type errors (verified with `bun run build`)

### Verification

- LSP diagnostics: clean (no errors)
- Build: successful (5.2s compile time)
- All 11 StreamEvent variants properly typed
- EtymologyResult backward compatible

## Streaming Synthesis Implementation (Phase 1A)

### What Was Done

Added `streamSynthesis()` function to `lib/claude.ts` that:

- Uses Anthropic SDK's `client.messages.stream()` API
- Emits tokens via callback as they arrive
- Accumulates full response internally for JSON parsing
- Reuses enrichment logic from `synthesizeFromResearch()`
- Returns `SynthesisResult` with token usage tracking

### Key Implementation Details

1. **Token Streaming**: Listens for `content_block_delta` events with `text_delta` type
2. **Token Usage**: Captures `inputTokens` from `message_start` and `outputTokens` from `message_delta`
3. **Error Handling**: Wraps streaming in try-catch, provides error preview on parse failure
4. **Enrichment**: Identical to non-streaming version (ancestry graph, sources, validation)
5. **Backward Compatibility**: `synthesizeFromResearch()` unchanged, both exports available

### Signature

```typescript
export async function streamSynthesis(
  researchContext: ResearchContext,
  onToken: (token: string) => void
): Promise<SynthesisResult>
```

### Build Status

✓ `bun run build` passes with no errors
✓ LSP diagnostics clean
✓ TypeScript strict mode satisfied

### Notes for Next Phase

- This enables token-by-token streaming to client via SSE or WebSocket
- The `onToken` callback can be wired to `StreamEvent` emission in API route
- No changes needed to existing non-streaming code path

## Wave 1B: Progress Callbacks + Raw Data Preservation

### Changes Made

1. **lib/research.ts**:
   - Added optional `onProgress?: (event: StreamEvent) => void` parameter to `conductAgenticResearch()`
   - Added `emitProgress()` helper function for safe, non-blocking callback emission
   - Emits events at key points:
     - `source_started`: before each source fetch (etymonline, wiktionary, wikipedia, urbanDictionary)
     - `source_complete`: after successful fetch with timing and preview
     - `source_failed`: on fetch failure with error message
     - `parsing_complete`: after parseSourceTexts() with chainCount
     - `roots_identified`: after extractRootsQuick() with identified roots array
     - `root_research`: for each root research fetch (both roots and related terms)
   - Preserves raw Wikipedia and Urban Dictionary data in `context.rawSources`

2. **lib/types.ts**:
   - Added `rawSources?: { wikipedia?: string; urbanDictionary?: string[] }` field to `ResearchContext`
   - Aligns with existing `EtymologyResult.rawSources` field from Wave 1

### Design Decisions

- **Non-blocking callbacks**: Errors in callbacks are caught and logged, never propagate
- **Timing measurement**: Uses `Date.now()` for source completion timing
- **Preview generation**: Slices first 100 chars of source text for preview
- **Raw data preservation**: Wikipedia stored as string, Urban Dictionary as array (matches EtymologyResult pattern)
- **Optional parameter**: Maintains backward compatibility - existing callers work without changes

### Verification

- `bun run build` passes with no errors
- LSP diagnostics clean on both modified files
- Type safety maintained throughout

### Next Steps

- Phase 1C: Wire callbacks into API endpoint for streaming response
- Phase 1D: Client-side streaming UI to consume events

## Wave 1A: useStreamingEtymology Hook

**Created**: lib/hooks/useStreamingEtymology.ts

### Key Implementation Details

- Uses EventSource API for SSE consumption (not fetch)
- Accumulates StreamEvent[] in state for progressive UI updates
- Extracts partialResult when 'result' event arrives
- Handles lifecycle: open → message/error → close → cleanup on unmount
- Follows existing hook patterns (useState, useCallback, useEffect)
- Returns: { state, events, partialResult, error, search, reset }

### Design Decisions

1. **EventSource over fetch**: SSE requires persistent connection; EventSource is the standard API
2. **Event accumulation**: Allows UI to show progress (sources fetched, parsing done, etc.)
3. **Ref for connection**: eventSourceRef prevents multiple concurrent connections
4. **Graceful error handling**: Network errors, parse errors, server errors all handled
5. **History integration**: Calls addToHistory on successful result (mirrors useEtymologySearch)

### Type Safety

- StreamEvent type already exists in lib/types.ts (Wave 1 prerequisite)
- EtymologyResult type used for partialResult
- No new dependencies added

### Build Status

- ✅ No TypeScript diagnostics
- ✅ bun run build passes
- ✅ Ready for API endpoint implementation (Wave 3)

## RootChip Expansion - Ancestor Roots & Descendant Words

**Task**: Surface ancestorRoots and descendantWords in RootChip expandable panel

**Implementation**:

- Added conditional rendering for ancestorRoots section (if present and non-empty)
- Added conditional rendering for descendantWords section (if present and non-empty)
- Maintained existing relatedWords functionality with new section header
- Styled consistently with scholarly aesthetic:
  - Ancestor Roots: read-only spans with subtle bg-charcoal/10 (historical context)
  - Related Words: interactive buttons with bg-cream-dark/60 (clickable)
  - Descendant Words: interactive buttons with bg-cream-dark/40 (lighter, modern derivatives)
- All sections use staggered animation delays for smooth reveal
- Sections only render if data exists (backward compatible)

**Design Rationale**:

- Ancestor Roots are non-interactive (historical forms, often reconstructed)
- Related Words remain interactive (existing behavior preserved)
- Descendant Words are interactive but lighter styling (modern, less central)
- Section headers use uppercase tracking-wide for visual hierarchy
- Consistent spacing with mb-4 between sections

**Verification**:

- LSP diagnostics: clean
- Build: passes (no errors)
- Type safety: Root type already has optional ancestorRoots/descendantWords fields

## SSE Streaming in Etymology Route (Phase 1A)

**File**: app/api/etymology/route.ts

**Pattern**: Dual-mode endpoint with `?stream=true` parameter

**Architecture Decisions**:

- Cache hits ALWAYS return JSON instantly (no streaming) - streaming cached data would waste resources
- Singleflight lock held throughout entire stream lifecycle
- Asymmetric lock release: streaming releases in ReadableStream finally, non-streaming in outer finally
- SSE format: `data: ${JSON.stringify(event)}\n\n`

**Key Helpers**:

- `countConfidence(result, level)` - counts ancestry stages by confidence level for enrichment_done event
- `emit()` closure - encodes + enqueues StreamEvent objects

**Event Flow**:

1. source_started/complete/failed (from conductAgenticResearch onProgress)
2. parsing_complete, roots_identified
3. root_research events
4. synthesis_started
5. synthesis_token (streamed JSON tokens from streamSynthesis)
6. enrichment_done (with high/medium confidence counts)
7. result (full EtymologyResult)
8. error (if anything fails)

**Critical Safety**:

- Lock release timing comments MUST stay - prevent concurrency bugs
- Cache hit comment explains design rationale
- Error handling: emit error event + close stream (no throw)

**Dependencies**:

- `streamSynthesis()` in lib/claude.ts - accepts onToken callback
- `conductAgenticResearch(..., onProgress)` in lib/research.ts - accepts progress callback
- StreamEvent type in lib/types.ts - defines all event shapes

## Google Ngrams Usage Timeline Integration

- Added server utility `lib/ngrams.ts` with `fetchNgram()` using Google Books ngram JSON endpoint and `fetchWithTimeout()`.
- Added new API route `app/api/ngram/route.ts` to avoid browser CORS issues; returns `ApiResponse` and sets long-lived cache headers (`s-maxage` + `stale-while-revalidate`).
- Added `components/UsageTimeline.tsx` as a custom SVG sparkline (no chart libraries), including area fill, line path, ARIA label, and optional year labels.
- Extended `EtymologyResult` with optional `ngram?: NgramResult` in `lib/types.ts` for UI composition without breaking existing server payloads.
- Updated `components/EtymologyCard.tsx` to render a "Usage over time" section when `result.ngram` exists.
- Updated `app/page.tsx` to fetch `/api/ngram?word=...` after streaming result completion, clear stale timeline data between words, and abort in-flight ngram requests on cleanup.
- Verification: LSP diagnostics clean on all changed files and `bun run build` passes; existing unrelated warning about missing `html2canvas` dynamic import remains.

## Cost Guard Mode Indicator UI

- Added `components/CostModeIndicator.tsx` client component with `CostMode` union (`normal | degraded | cache_only | blocked`).
- Component initializes from `initialMode` prop and then reads `localStorage['cost-mode']` on mount to support simple client-side mode persistence.
- Indicator hides entirely in `normal` mode and renders subtle inline pill for non-normal states with status-specific label/color and explanatory tooltip.
- Integrated indicator in `app/page.tsx` header beneath the subtitle so budget constraints are visible without disrupting search flow.
- Verification: LSP diagnostics clean for both changed files; `bun run build` passes (existing unrelated warning: missing optional `html2canvas` module in `ShareMenu.tsx`).
