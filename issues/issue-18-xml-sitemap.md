# Issue #18: Create and submit XML sitemap

**Status:** Open
**Labels:** None
**Created:** 2026-01-07
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/18

---

## Overview

Generate and submit an XML sitemap to help search engines discover and index all pages efficiently.

## Implementation

### 1. Generate Sitemap

For static sites, create `/public/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://etymology.thepushkarp.com/</loc>
    <lastmod>2025-01-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://etymology.thepushkarp.com/about</loc>
    <lastmod>2025-01-07</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- Add all word pages dynamically -->
</urlset>
```

### 2. Dynamic Sitemap Generation (Recommended)

For Next.js, create `app/sitemap.ts`:

```typescript
import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://etymology.thepushkarp.com'

  // Get all words from your database/API
  const words = await getAllWords()

  const wordPages = words.map((word) => ({
    url: `${baseUrl}/word/${word.slug}`,
    lastModified: word.updatedAt || new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...wordPages,
  ]
}
```

### 3. For Large Sites - Sitemap Index

If you have thousands of word pages, use a sitemap index:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://etymology.thepushkarp.com/sitemap-main.xml</loc>
    <lastmod>2025-01-07</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://etymology.thepushkarp.com/sitemap-words-a.xml</loc>
    <lastmod>2025-01-07</lastmod>
  </sitemap>
  <!-- More sitemaps by letter -->
</sitemapindex>
```

## Submission Checklist

### Google Search Console

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add and verify property for `etymology.thepushkarp.com`
3. Navigate to Sitemaps → Add new sitemap
4. Enter `sitemap.xml` and submit

### Bing Webmaster Tools

1. Go to [Bing Webmaster Tools](https://www.bing.com/webmasters)
2. Add and verify site
3. Submit sitemap URL

### IndexNow (Instant Indexing)

For faster indexing of new/updated content:

```bash
curl "https://api.indexnow.org/indexnow?url=https://etymology.thepushkarp.com/word/new-word&key=YOUR_KEY"
```

## Tasks

- [ ] Generate sitemap (static or dynamic)
- [ ] Reference sitemap in robots.txt
- [ ] Submit to Google Search Console
- [ ] Submit to Bing Webmaster Tools
- [ ] (Optional) Set up IndexNow for real-time updates

## Acceptance Criteria

- [ ] Sitemap accessible at `https://etymology.thepushkarp.com/sitemap.xml`
- [ ] All indexable pages included
- [ ] Valid XML format (test with [XML Sitemap Validator](https://www.xml-sitemaps.com/validate-xml-sitemap.html))
- [ ] Sitemap submitted and accepted by Google/Bing

---

_Part of SEO + AI Search Optimization initiative_
