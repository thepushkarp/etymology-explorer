# Etymology Explorer - Local Issue Tracker

This folder contains local copies of all open GitHub issues for the Etymology Explorer project. These files allow tracking and referencing issues alongside the codebase.

## Issue Summary

| #                                             | Title                                                                | Labels                       | Priority |
| --------------------------------------------- | -------------------------------------------------------------------- | ---------------------------- | -------- |
| [12](./issue-12-ssr-ssg.md)                   | **[URGENT] Fix Client-Side Rendering - Implement SSR/SSG**           | -                            | Critical |
| [25](./issue-25-pos-tags.md)                  | Add POS (Part of Speech) tag words                                   | `enhancement`                | Feature  |
| [24](./issue-24-structured-outputs-models.md) | Limit Anthropic models to only those that support Structured Outputs | `bug`                        | Bug      |
| [23](./issue-23-related-words.md)             | Add suggestions for related words, synonyms, antonyms, etc           | `enhancement`                | Feature  |
| [21](./issue-21-educational-content.md)       | Add educational content pages for AI citation optimization           | -                            | SEO      |
| [20](./issue-20-core-web-vitals.md)           | Optimize Core Web Vitals (LCP, FID, CLS)                             | -                            | SEO      |
| [19](./issue-19-canonical-urls.md)            | Add canonical URLs to prevent duplicate content                      | -                            | SEO      |
| [17](./issue-17-faq-schema.md)                | Add FAQ schema for common etymology questions                        | -                            | SEO      |
| [16](./issue-16-llms-txt.md)                  | Create llms.txt file for AI discoverability                          | -                            | SEO      |
| [15](./issue-15-json-ld-structured-data.md)   | Add JSON-LD structured data (Schema.org)                             | -                            | SEO      |
| [14](./issue-14-meta-tags.md)                 | Add meta tags (title, description, Open Graph, Twitter Cards)        | -                            | SEO      |
| [9](./issue-09-persist-db.md)                 | Persist results in a DB                                              | `enhancement`, `help wanted` | Feature  |
| [8](./issue-08-pronunciation-elevenlabs.md)   | Add pronunciation examples using ElevenLabs                          | `enhancement`, `help wanted` | Feature  |
| [7](./issue-07-convergent-roots.md)           | Improve linking of common roots and remove irrelevant roots          | `bug`                        | Bug      |
| [6](./issue-06-modern-slang.md)               | Add support for modern slangs                                        | `enhancement`                | Feature  |

## Categories

### Critical (Blocking SEO)

- **#12** - SSR/SSG implementation - crawlers see blank page

### SEO + AI Search Optimization

Issues #14-21 are part of a comprehensive SEO initiative:

- #19 canonical URLs (foundational)
- #14 meta tags -> #15 JSON-LD -> #17 FAQ schema (structured data)
- #16 llms.txt -> #21 educational content (AI-focused)
- #20 Core Web Vitals (performance)

### Bugs

- **#7** - Convergent etymology roots - multiple morphemes sharing same PIE ancestor
- **#24** - Model selection shows unsupported models for structured outputs

### Feature Enhancements

- **#6** - Modern slang support (Wikipedia + Urban Dictionary integration)
- **#8** - ElevenLabs pronunciation audio
- **#9** - Database caching for etymology results
- **#23** - Related words suggestions (synonyms, antonyms, homophones)
- **#25** - Part of speech (POS) tags for words

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

_Last updated: 2026-01-12_
