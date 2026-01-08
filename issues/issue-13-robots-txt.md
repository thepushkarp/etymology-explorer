# Issue #13: Add robots.txt allowing AI crawlers

**Status:** Open
**Labels:** None
**Created:** 2026-01-07
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/13

---

## Overview

Create a `robots.txt` file that explicitly allows AI crawlers access to the site. Many sites inadvertently block AI crawlers through default or wildcard rules.

## Why This Matters

AI-powered search tools (ChatGPT, Claude, Perplexity) use dedicated crawlers. If blocked, your site won't appear in AI search results - an increasingly important discovery channel.

## Implementation

Create `/public/robots.txt`:

```text
# Default: allow all
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

# ——— OPENAI ———
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

# ——— ANTHROPIC (Claude) ———
User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

# ——— PERPLEXITY ———
User-agent: PerplexityBot
Allow: /

# ——— GOOGLE AI ———
User-agent: Google-Extended
Allow: /

# ——— OTHER AI CRAWLERS ———
User-agent: Amazonbot
Allow: /

User-agent: YouBot
Allow: /

User-agent: PhindBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: Bytespider
Allow: /

# Sitemap
Sitemap: https://etymology.thepushkarp.com/sitemap.xml
```

## Acceptance Criteria

- [ ] `robots.txt` accessible at `https://etymology.thepushkarp.com/robots.txt`
- [ ] AI crawlers explicitly allowed
- [ ] Sensitive routes (api, admin) blocked
- [ ] Sitemap URL included

## Testing

```bash
curl https://etymology.thepushkarp.com/robots.txt
```

---

_Part of SEO + AI Search Optimization initiative_
