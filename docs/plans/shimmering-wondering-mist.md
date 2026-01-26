# Plan: Sync GitHub Issues with Local Issue Files

## Current State Analysis

| Issue | GitHub Body | Local File     | Action                          |
| ----- | ----------- | -------------- | ------------------------------- |
| #6    | ✅ Detailed | ✅ Synced      | Add PR note to local            |
| #7    | ✅ Detailed | ✅ Synced      | Add PR note to local            |
| #8    | ✅ Detailed | ✅ Synced      | Add PR note to local            |
| #9    | ✅ Detailed | ✅ Synced      | Add PR note to local            |
| #23   | ❌ EMPTY    | ✅ Has context | **Update GitHub** + add PR note |
| #25   | ⚠️ Minimal  | ✅ Has context | **Update GitHub** + add PR note |

## Implementation

### 1. Update GitHub Issues #23 and #25

Copy implementation context from local files to GitHub issue bodies:

```bash
# Issue #23 - Related words (currently empty)
gh issue edit 23 --body-file issues/issue-23-related-words.md

# Issue #25 - POS tags (currently minimal)
gh issue edit 25 --body-file issues/issue-25-pos-tags.md
```

### 2. Add PR Auto-Close Note to All Local Issue Files

Append to each local issue file:

```markdown
---

## Contributing

To work on this issue:

1. Create branch: `git checkout -b feat/issue-<N>-<short-desc>`
2. Implement changes per the context above
3. Create PR with title: `feat: <description>`
4. In PR description, add: `Closes #<N>`

**Auto-close:** Include `Closes #<N>`, `Fixes #<N>`, or `Resolves #<N>` in the PR **description** (not title) to auto-close when merged.
```

### 3. Update README.md

- Update "Last updated" date to 2026-01-24
- Verify closed issues list is current

## Files to Modify

**GitHub (via `gh issue edit`):**

- Issue #23 - Add full implementation context
- Issue #25 - Add full implementation context

**Local files:**

1. `issues/issue-06-modern-slang.md` - Add PR note
2. `issues/issue-07-convergent-roots.md` - Add PR note
3. `issues/issue-08-pronunciation-elevenlabs.md` - Add PR note
4. `issues/issue-09-persist-db.md` - Add PR note
5. `issues/issue-23-related-words.md` - Add PR note
6. `issues/issue-25-pos-tags.md` - Add PR note
7. `issues/README.md` - Update date

## Verification

1. `gh issue view 23` - Confirm body updated
2. `gh issue view 25` - Confirm body updated
3. Check each local file has Contributing section
4. `git diff` to review before commit
