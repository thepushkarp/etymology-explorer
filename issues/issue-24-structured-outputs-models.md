# Issue #24: Limit Anthropic models to only those that support Structured Outputs

**Status:** Open
**Labels:** `bug`
**Created:** 2026-01-11
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/24

---

## Problem

The app currently fetches all available Anthropic models from the API, but not all models support structured outputs. Users selecting unsupported models will get errors.

## Reference

From [Anthropic's Structured Outputs Documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs):

> Structured outputs are currently available as a public beta feature in the Claude API for **Claude Sonnet 4.5, Claude Opus 4.1, Claude Opus 4.5, and Claude Haiku 4.5**.

## Implementation Context

### Current State

The `/api/models` endpoint in `app/api/models/route.ts` fetches all models from the Anthropic API and displays them in the settings dropdown via `components/SettingsModal.tsx`.

### Proposed Changes

**1. Add a filter for supported models in `app/api/models/route.ts`:**

```typescript
const STRUCTURED_OUTPUT_SUPPORTED_MODELS = [
  'claude-sonnet-4-5',
  'claude-opus-4-1',
  'claude-opus-4-5',
  'claude-haiku-4-5',
  // Include dated versions
  'claude-sonnet-4-5-20241022',
  'claude-opus-4-1-20241022',
  'claude-opus-4-5-20251101',
  'claude-haiku-4-5-20241022',
]

// Filter models to only include those supporting structured outputs
const filteredModels = models.filter((model) =>
  STRUCTURED_OUTPUT_SUPPORTED_MODELS.some(
    (supported) => model.id.includes(supported) || model.id.startsWith(supported)
  )
)
```

**2. Alternative: Check model capabilities dynamically**

If the Anthropic API provides capability metadata, use that instead of hardcoding:

```typescript
const filteredModels = models.filter(
  (model) => model.capabilities?.includes('structured_outputs') ?? false
)
```

**3. Update UI to indicate structured output requirement:**

In `components/SettingsModal.tsx`, add a note explaining the model limitation:

```tsx
<p className="text-sm text-gray-500">Only models supporting structured outputs are shown.</p>
```

### Files to Modify

- `app/api/models/route.ts` - Filter model list
- `components/SettingsModal.tsx` - Add explanatory note

### Acceptance Criteria

- [ ] Only structured-output-capable models appear in the dropdown
- [ ] Users cannot select models that would cause synthesis failures
- [ ] The supported model list is easy to update as Anthropic adds support
