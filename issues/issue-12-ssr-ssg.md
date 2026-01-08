# Issue #12: [URGENT] Fix Client-Side Rendering - Implement SSR/SSG

**Status:** Open
**Labels:** None
**Created:** 2026-01-07
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/12

---

## Problem

The etymology site is currently client-side rendered. When search engines and AI crawlers visit the site, they see a blank "Loading..." page instead of actual content. This is the **#1 blocker** for all SEO efforts.

**Evidence**: Fetching the site returns "Loading..." - crawlers see the same blank page.

## Impact

- Google cannot index your content properly
- AI crawlers (GPTBot, ClaudeBot, PerplexityBot) cannot read your etymology data
- Zero visibility in both traditional search and AI-powered search tools

## Proposed Solutions (ranked by effort/impact)

### Option A: Static Site Generation (SSG) - RECOMMENDED

If etymology data doesn't change frequently, pre-render everything at build time:

**Next.js approach:**

```javascript
// pages/word/[word].js
export async function getStaticProps({ params }) {
  const etymology = await fetchEtymology(params.word)
  return {
    props: { etymology },
    revalidate: 86400, // Regenerate daily if needed
  }
}

export async function getStaticPaths() {
  const words = await getAllWords()
  return {
    paths: words.map((word) => ({ params: { word } })),
    fallback: 'blocking', // Generate new pages on-demand
  }
}
```

**Astro approach:**

```javascript
// src/pages/word/[word].astro
---
export async function getStaticPaths() {
  const words = await getAllWords();
  return words.map(word => ({
    params: { word },
    props: { etymology: await fetchEtymology(word) }
  }));
}
const { etymology } = Astro.props;
---
```

### Option B: Server-Side Rendering (SSR)

For dynamic content rendered on each request:

```javascript
// Next.js
export async function getServerSideProps(context) {
  const etymology = await fetchEtymology(context.params.word)
  return { props: { etymology } }
}
```

### Option C: Pre-rendering Service (Quick Fix)

If refactoring is not immediately feasible, use a pre-rendering service:

- **Prerender.io** - Intercepts crawler requests, serves static HTML snapshots
- **Rendertron** - Google's headless Chrome rendering solution
- Zero code changes to your app

**Nginx config for Prerender.io:**

```nginx
location / {
  try_files $uri @prerender;
}

location @prerender {
  set $prerender 0;
  if ($http_user_agent ~* "googlebot|bingbot|GPTBot|ClaudeBot|PerplexityBot") {
    set $prerender 1;
  }
  if ($prerender = 1) {
    rewrite .* /render?url=$scheme://$host$request_uri break;
    proxy_pass https://service.prerender.io;
  }
  # ... normal app serving
}
```

## Acceptance Criteria

- [ ] Crawlers receive fully-rendered HTML with etymology content
- [ ] Test with `curl -A "Googlebot" https://etymology.thepushkarp.com/` returns actual content
- [ ] Google Search Console shows pages as indexed (after implementation)
- [ ] Meta tags and structured data are present in initial HTML response

## Resources

- [Next.js SSG Documentation](https://nextjs.org/docs/basic-features/pages#static-generation)
- [Vercel ISR (Incremental Static Regeneration)](https://vercel.com/docs/concepts/incremental-static-regeneration)
- [Google's JavaScript SEO Guide](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)

---

_Part of SEO + AI Search Optimization initiative_
