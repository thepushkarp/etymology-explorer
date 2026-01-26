# Etymology Explorer - Local Issue Tracker

This folder contains local copies of all open GitHub issues for the Etymology Explorer project. These files allow tracking and referencing issues alongside the codebase.

## Issue Summary

| #                                   | Title                                                       | Labels        | Priority |
| ----------------------------------- | ----------------------------------------------------------- | ------------- | -------- |
| [25](./issue-25-pos-tags.md)        | Add POS (Part of Speech) tag words                          | `enhancement` | Feature  |
| [23](./issue-23-related-words.md)   | Add suggestions for related words, synonyms, antonyms, etc  | `enhancement` | Feature  |
| [7](./issue-07-convergent-roots.md) | Improve linking of common roots and remove irrelevant roots | `bug`         | Bug      |
| [6](./issue-06-modern-slang.md)     | Add support for modern slangs                               | `enhancement` | Feature  |

## Categories

### Bugs

- **#7** - Convergent etymology roots - multiple morphemes sharing same PIE ancestor

### Feature Enhancements

- **#6** - Modern slang support (Wikipedia + Urban Dictionary integration)
- **#23** - Related words suggestions (synonyms, antonyms, homophones)
- **#25** - Part of speech (POS) tags for words

**Note:** Schema/backend for #6, #7, #23, #25 completed in PR #31. UI work pending.

## Recently Closed

The following issues were completed in PR #31:

- ~~#8~~ - ElevenLabs pronunciation audio
- ~~#9~~ - Database caching (Upstash Redis)

Earlier closed:

- ~~#17~~ - FAQ schema (closed: implemented in PR #30)
- ~~#21~~ - Educational content pages (closed: implemented in PR #30)
- ~~#12~~ - SSR/SSG (closed: architectural constraint - user API keys stored client-side)
- ~~#20~~ - Core Web Vitals (closed: code splitting implemented, images/fonts already optimized)

The following issues were completed in PR #27:

- ~~#14~~ - Meta tags (OG, Twitter Cards)
- ~~#15~~ - JSON-LD structured data
- ~~#16~~ - llms.txt for AI discoverability
- ~~#19~~ - Canonical URLs
- ~~#24~~ - Filter models for structured outputs

## Workflow

1. Pick an issue from the list above
2. Read the full issue file for implementation details
3. Reference the GitHub issue URL for discussion
4. Update the issue file as progress is made

## Syncing with GitHub

To refresh local issues from GitHub:

```bash
gh issue list --state open --json number,title,labels,state --limit 100
```

---

_Last updated: 2026-01-26_
