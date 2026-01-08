# Issue #19: Add canonical URLs to prevent duplicate content

**Status:** Open
**Labels:** None
**Created:** 2026-01-07
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/19

---

## Overview

Add canonical URL tags to all pages to prevent duplicate content issues and consolidate SEO signals.

## Why Canonical URLs Matter

Without canonical tags, search engines may:

- Index multiple versions of the same page (with/without trailing slash, query params, etc.)
- Split ranking signals between duplicate URLs
- Penalize for perceived duplicate content

## Implementation

### 1. Add Canonical Link Tag

Add to every page's `<head>`:

```html
<link rel="canonical" href="https://etymology.thepushkarp.com/word/algorithm" />
```

### 2. Next.js Implementation

```typescript
// app/word/[word]/page.tsx
import { Metadata } from 'next'

export async function generateMetadata({ params }): Promise<Metadata> {
  return {
    alternates: {
      canonical: `https://etymology.thepushkarp.com/word/${params.word}`,
    },
  }
}
```

Or in `next.config.js` for trailing slash normalization:

```javascript
module.exports = {
  trailingSlash: false, // or true, just be consistent
}
```

### 3. Handle Common Duplicate Scenarios

| Scenario                                | Canonical Should Be           |
| --------------------------------------- | ----------------------------- |
| `/word/Algorithm` vs `/word/algorithm`  | `/word/algorithm` (lowercase) |
| `/word/algorithm/` vs `/word/algorithm` | Pick one, be consistent       |
| `?ref=twitter` query params             | Base URL without params       |
| `http://` vs `https://`                 | `https://` version            |
| `www.` vs non-www                       | Pick one, redirect the other  |

### 4. Self-Referencing Canonicals

Even pages without duplicates should have self-referencing canonicals:

```html
<!-- On https://etymology.thepushkarp.com/about -->
<link rel="canonical" href="https://etymology.thepushkarp.com/about" />
```

## Tasks

- [ ] Add canonical tags to all page templates
- [ ] Ensure URL case normalization (lowercase preferred)
- [ ] Configure trailing slash handling consistently
- [ ] Set up redirects for non-canonical versions
- [ ] Verify canonicals in Google Search Console

## Acceptance Criteria

- [ ] Every page has exactly one canonical URL
- [ ] Canonical URLs use HTTPS
- [ ] Canonical URLs are absolute (not relative)
- [ ] Google Search Console shows no canonical issues

---

_Part of SEO + AI Search Optimization initiative_
