# Issue #14: Add meta tags (title, description, Open Graph, Twitter Cards)

**Status:** Open
**Labels:** None
**Created:** 2026-01-07
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/14

---

## Overview

Add comprehensive meta tags to improve search engine display and social media sharing previews.

## Implementation

Add to `<head>` section (or via Next.js Head component, Astro frontmatter, etc.):

### Homepage Meta Tags

```html
<!-- Primary Meta Tags -->
<title>Etymology Explorer - Discover Word Origins</title>
<meta
  name="description"
  content="Explore the fascinating origins and history of English words. Visual etymology trees, linguistic connections, and historical context for thousands of words."
/>
<meta
  name="keywords"
  content="etymology, word origins, linguistic history, word roots, language evolution"
/>

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:url" content="https://etymology.thepushkarp.com/" />
<meta property="og:title" content="Etymology Explorer - Discover Word Origins" />
<meta
  property="og:description"
  content="Visual etymology explorer with word history and linguistic connections"
/>
<meta property="og:image" content="https://etymology.thepushkarp.com/og-image.png" />
<meta property="og:site_name" content="Etymology Explorer" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:url" content="https://etymology.thepushkarp.com/" />
<meta name="twitter:title" content="Etymology Explorer - Discover Word Origins" />
<meta
  name="twitter:description"
  content="Visual etymology explorer with word history and linguistic connections"
/>
<meta name="twitter:image" content="https://etymology.thepushkarp.com/og-image.png" />

<!-- Additional SEO -->
<meta name="robots" content="index, follow" />
<meta name="author" content="Pushkar Patel" />
<link rel="canonical" href="https://etymology.thepushkarp.com/" />
```

### Dynamic Word Page Meta Tags

For individual word pages (e.g., `/word/algorithm`):

```javascript
// Next.js example
export async function generateMetadata({ params }) {
  const word = params.word
  const etymology = await fetchEtymology(word)

  return {
    title: `Etymology of "${word}" - Origin & History | Etymology Explorer`,
    description: `Discover the origin of "${word}". ${etymology.shortDescription}. Explore linguistic roots and historical evolution.`,
    openGraph: {
      title: `Etymology of "${word}"`,
      description: etymology.shortDescription,
      url: `https://etymology.thepushkarp.com/word/${word}`,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `Etymology of "${word}"`,
      description: etymology.shortDescription,
    },
  }
}
```

## Tasks

- [ ] Create OG image (1200x630px recommended) - consider using a template with word + origin
- [ ] Add meta tags to homepage
- [ ] Add dynamic meta tags to word pages
- [ ] Test with [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [ ] Test with [Twitter Card Validator](https://cards-dev.twitter.com/validator)

## Acceptance Criteria

- [ ] All pages have unique, descriptive titles
- [ ] Descriptions are 150-160 characters
- [ ] OG image displays correctly on social shares
- [ ] Twitter cards render properly

---

_Part of SEO + AI Search Optimization initiative_
