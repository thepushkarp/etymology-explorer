# Issue #20: Optimize Core Web Vitals (LCP, FID, CLS)

**Status:** Open
**Labels:** None
**Created:** 2026-01-07
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/20

---

## Overview

Optimize Core Web Vitals to improve search rankings and user experience. Fast sites get crawled more frequently and rank better.

## Target Metrics

| Metric                             | Target  | What It Measures    |
| ---------------------------------- | ------- | ------------------- |
| **LCP** (Largest Contentful Paint) | < 2.5s  | Loading performance |
| **FID** (First Input Delay)        | < 100ms | Interactivity       |
| **CLS** (Cumulative Layout Shift)  | < 0.1   | Visual stability    |

## Assessment

Run Lighthouse audit:

```bash
npx lighthouse https://etymology.thepushkarp.com --output=json --output-path=./lighthouse-report.json
```

Or use:

- [PageSpeed Insights](https://pagespeed.web.dev/)
- [web.dev Measure](https://web.dev/measure/)
- Chrome DevTools → Lighthouse tab

## Common Optimizations

### 1. Image Optimization

```javascript
// Next.js - Use Image component
import Image from 'next/image'

;<Image
  src="/etymology-tree.png"
  alt="Etymology visualization"
  width={800}
  height={600}
  loading="lazy"
  placeholder="blur"
/>
```

Convert images to WebP format:

```bash
npx sharp-cli --input ./public/images/*.png --output ./public/images/ --format webp
```

### 2. Font Optimization

```css
/* Use font-display: swap to prevent invisible text */
@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom.woff2') format('woff2');
  font-display: swap;
}
```

Subset fonts to only include needed characters:

```bash
npx glyphhanger --whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" --subset=*.ttf
```

### 3. Code Splitting

```javascript
// Next.js - Dynamic imports
import dynamic from 'next/dynamic'

const EtymologyTree = dynamic(() => import('./EtymologyTree'), {
  loading: () => <TreeSkeleton />,
  ssr: false, // if client-only visualization
})
```

### 4. Prevent Layout Shift (CLS)

```css
/* Reserve space for dynamic content */
.etymology-container {
  min-height: 400px; /* Prevents CLS when content loads */
}

/* Set explicit dimensions for images */
img {
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
}
```

### 5. Reduce JavaScript

- Tree-shake unused code
- Use production builds
- Analyze bundle size:

```bash
npx @next/bundle-analyzer
# or
npx webpack-bundle-analyzer
```

## Vercel-Specific Optimizations

Since you're on Vercel:

- CDN caching is automatic ✓
- Edge functions for faster responses
- Automatic image optimization with `next/image`
- Enable ISR for static performance with dynamic updates

## Tasks

- [ ] Run Lighthouse audit and document baseline scores
- [ ] Optimize images (WebP, lazy loading, explicit dimensions)
- [ ] Optimize fonts (subsetting, font-display: swap)
- [ ] Implement code splitting for heavy components
- [ ] Fix any CLS issues (reserve space, explicit dimensions)
- [ ] Re-run Lighthouse and verify improvements

## Acceptance Criteria

- [ ] LCP < 2.5 seconds
- [ ] FID < 100ms (or INP < 200ms)
- [ ] CLS < 0.1
- [ ] Mobile and desktop both pass Core Web Vitals

---

_Part of SEO + AI Search Optimization initiative_
