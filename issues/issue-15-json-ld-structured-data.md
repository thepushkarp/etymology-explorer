# Issue #15: Add JSON-LD structured data (Schema.org)

**Status:** Open
**Labels:** None
**Created:** 2026-01-07
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/15

---

## Overview

Add JSON-LD structured data to help search engines and AI understand the site's content structure. This improves rich snippet display and AI citation accuracy.

## Implementation

### 1. WebApplication Schema (Homepage)

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Etymology Explorer",
    "description": "Interactive tool for exploring word origins, etymological trees, and linguistic connections",
    "url": "https://etymology.thepushkarp.com",
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "author": {
      "@type": "Person",
      "name": "Pushkar Patel",
      "url": "https://thepushkarp.com"
    },
    "datePublished": "2024-01-01",
    "dateModified": "2025-01-07",
    "inLanguage": "en",
    "keywords": ["etymology", "word origins", "linguistics", "language history"],
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://etymology.thepushkarp.com/search?word={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  }
</script>
```

### 2. Article Schema (Individual Word Pages)

For pages like `/word/algorithm`:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Etymology of 'Algorithm'",
    "description": "The word algorithm derives from the name of Persian mathematician al-Khwarizmi...",
    "author": {
      "@type": "Person",
      "name": "Pushkar Patel"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Etymology Explorer",
      "url": "https://etymology.thepushkarp.com"
    },
    "datePublished": "2024-06-15",
    "dateModified": "2025-01-07",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "https://etymology.thepushkarp.com/word/algorithm"
    },
    "about": {
      "@type": "DefinedTerm",
      "name": "algorithm",
      "description": "A process or set of rules to be followed in calculations"
    }
  }
</script>
```

### 3. BreadcrumbList Schema

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://etymology.thepushkarp.com"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Algorithm",
        "item": "https://etymology.thepushkarp.com/word/algorithm"
      }
    ]
  }
</script>
```

## Tasks

- [ ] Add WebApplication schema to homepage
- [ ] Add Article + DefinedTerm schema to word pages (dynamic generation)
- [ ] Add BreadcrumbList schema for navigation context
- [ ] Validate with [Google Rich Results Test](https://search.google.com/test/rich-results)
- [ ] Validate with [Schema.org Validator](https://validator.schema.org/)

## Acceptance Criteria

- [ ] All pages have valid JSON-LD
- [ ] No errors in Google Rich Results Test
- [ ] SearchAction enables sitelinks search box in Google

---

_Part of SEO + AI Search Optimization initiative_
