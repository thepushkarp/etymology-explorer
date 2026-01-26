# Educational Content SEO Implementation Plan

## 1. Overview

Add two static educational pages (`/faq` and `/learn/what-is-etymology`) optimized for AI citation and Google rich results. Includes FAQPage JSON-LD schema, shared header navigation, and sitemap updates.

**Design doc:** [`docs/brainstorms/educational-content-seo.md`](../brainstorms/educational-content-seo.md)

---

## 2. Prerequisites

### Tools & Versions

- Node.js 18+ (check with `node -v`)
- Yarn package manager (project uses yarn, not npm)
- This project uses Next.js 16.1.1, React 19, Tailwind CSS v4

### Environment Setup

```bash
cd /Users/pupa/projects/etymology-explorer
yarn install
yarn dev  # Verify dev server runs on localhost:3000
```

### No Additional Dependencies Required

The implementation uses only native HTML elements (`<details>`, `<summary>`) and existing project dependencies. No new packages needed.

---

## 3. Codebase Orientation

### Key Files to Understand First

| File                    | Purpose                                               | Read Before Task |
| ----------------------- | ----------------------------------------------------- | ---------------- |
| `app/layout.tsx`        | Root layout with metadata, fonts, JsonLd              | Task 1           |
| `app/page.tsx`          | Main page structure, header pattern, state management | Task 2           |
| `components/JsonLd.tsx` | Existing JSON-LD implementation pattern               | Task 3           |
| `app/globals.css`       | Tailwind v4 theme config, custom colors               | All tasks        |
| `app/sitemap.ts`        | Existing sitemap structure                            | Task 7           |
| `lib/types.ts`          | TypeScript patterns used in project                   | Task 3           |

### Existing Patterns to Follow

**Component Pattern** (`components/*.tsx`):

- All components use `'use client'` directive when needed (client-side interactivity)
- Server components are default (no directive) for static content
- JSDoc comments above exports
- Tailwind classes with multi-line formatting for readability

**Styling Pattern** (`app/globals.css:10-16`):

- Custom colors via CSS variables: `--cream`, `--cream-dark`, `--charcoal`, `--charcoal-light`
- Tailwind theme references: `bg-cream`, `text-charcoal`, etc.
- Font: `font-serif` maps to Libre Baskerville

**JSON-LD Pattern** (`components/JsonLd.tsx:40-47`):

- The existing codebase uses `JSON.stringify(schema).replace(/</g, '\\u003c')` for XSS sanitization
- This pattern is safe ONLY because schema data is hardcoded/static, not user input
- Follow this same pattern for FAQ schema (static data from `data/faq.ts`)

### React Best Practices to Apply

1. **Server Components by Default**: New pages (`/faq`, `/learn/what-is-etymology`) should be server components (no `'use client'`) since they're static content
2. **Colocation**: Keep page-specific components in the same directory or import from `components/`
3. **Metadata API**: Use Next.js `metadata` export (not `<Head>`) for SEO
4. **Avoid Prop Drilling**: Use composition over deep prop passing
5. **Semantic HTML**: Use `<article>`, `<section>`, `<nav>` appropriately

---

## 4. Implementation Tasks

### Task 1: Create FAQ Data File

**Goal:** Single source of truth for FAQ content that drives both UI and schema

**Files to create:**

- `data/faq.ts` - FAQ content and TypeScript interface

**Implementation steps:**

1. Create `data/` directory if it doesn't exist
2. Create `data/faq.ts` with the following structure:

```typescript
/**
 * FAQ content for etymology educational pages
 * This data drives both the visible UI and FAQPage JSON-LD schema
 */

export interface FaqItem {
  /** The question text */
  question: string
  /** Answer text - plain text only, no HTML/markdown */
  answer: string
  /** Optional link to demonstrate with search */
  searchExample?: string
}

export const faqs: FaqItem[] = [
  {
    question: 'What is etymology?',
    answer:
      'Etymology is the study of the origin of words and how their meanings have evolved over time. It traces words back through history, often across multiple languages, to uncover their earliest known forms and the cultural contexts that shaped them.',
  },
  {
    question: 'Where does the word "etymology" come from?',
    answer:
      'The word "etymology" comes from the Greek "etymologia," combining "etymon" (true sense of a word) and "logia" (study of). It entered English in the 14th century via Latin. So etymology is, quite literally, the study of the true meaning of words.',
  },
  {
    question: 'What percentage of English words come from Latin?',
    answer:
      'Approximately 29% of English words derive directly from Latin, with another 29% coming from French (which itself largely derives from Latin). About 26% come from Germanic languages, and the remaining 16% from Greek and other sources.',
  },
  {
    question: 'How do words change meaning over time?',
    answer:
      'Words evolve through several processes: semantic shift (where "nice" originally meant "ignorant" in Latin), borrowing from other languages (like "algorithm" from Arabic), compounding existing words (like "smartphone"), and back-formation (where "edit" was derived from "editor").',
    searchExample: 'nice',
  },
  {
    question: 'What is Proto-Indo-European?',
    answer:
      "Proto-Indo-European (PIE) is the reconstructed common ancestor of the Indo-European language family, believed to have been spoken approximately 4500-2500 BCE. It is the root of languages including English, Spanish, Hindi, Russian, and Greek—connecting roughly half of the world's population through linguistic heritage.",
  },
  {
    question: 'How can I use Etymology Explorer?',
    answer:
      'Simply type any English word into the search bar and press Enter. The app will trace its origins, show you its root components, visualize its ancestry through different languages, and reveal fascinating stories about how the word evolved to its current meaning.',
  },
]
```

**Code patterns to follow:**

- TypeScript interface before data (see `lib/types.ts:1-12` for pattern)
- JSDoc comments on interface properties
- Export both interface and data for reuse

**Testing:**

- Import in a test file or via `yarn dev` console to verify no syntax errors
- Check that all answers are 50-150 words (AI optimization guideline)

**Verification:**

- Run `yarn lint` - should pass with no errors
- Run `yarn build` - should compile without type errors

**Commit:** `feat(data): add FAQ content data with TypeScript interface`

---

### Task 2: Create FAQ Schema Component

**Goal:** Generate FAQPage JSON-LD schema from FAQ data

**Files to create:**

- `components/FaqSchema.tsx` - Schema generator component

**Implementation steps:**

1. Create `components/FaqSchema.tsx`:

```tsx
/**
 * FAQPage JSON-LD Schema Generator
 *
 * Generates structured data for Google rich results from FAQ content.
 * Uses the same data source as the visible FAQ UI to ensure sync.
 *
 * SECURITY NOTE: This component uses innerHTML for JSON-LD injection.
 * This is safe ONLY because `faqs` data is hardcoded in `data/faq.ts`,
 * not user-provided. Never pass user input to this component.
 */

import { FaqItem } from '@/data/faq'

interface FaqSchemaProps {
  faqs: FaqItem[]
}

/**
 * Strips any potential HTML/markdown from answer text for schema
 * (Currently answers are plain text, but this future-proofs)
 */
function stripMarkup(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

export function FaqSchema({ faqs }: FaqSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: stripMarkup(faq.answer),
      },
    })),
  }

  // Safe: schema is derived from static data in data/faq.ts, not user input
  // XSS sanitization: replace < with unicode equivalent per Next.js docs
  // See existing pattern: components/JsonLd.tsx:40-47
  const jsonString = JSON.stringify(schema).replace(/</g, '\\u003c')

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonString }} />
}
```

**Code patterns to follow:**

- Reference `components/JsonLd.tsx:40-47` for the innerHTML pattern
- JSDoc comment block at top of file explaining security considerations
- Named export (not default) for components

**Testing:**

- Validate output JSON at [Google Rich Results Test](https://search.google.com/test/rich-results) after Task 4

**Verification:**

- `yarn lint` passes
- `yarn build` compiles

**Commit:** `feat(components): add FaqSchema JSON-LD generator`

---

### Task 3: Create FAQ Accordion Component

**Goal:** Accessible, CSS-only expandable FAQ items

**Files to create:**

- `components/FaqAccordion.tsx` - Accordion UI component

**Implementation steps:**

1. Create `components/FaqAccordion.tsx`:

```tsx
/**
 * FAQ Accordion Component
 *
 * Renders FAQ items as expandable/collapsible sections.
 * Uses native <details>/<summary> for accessibility (works without JS).
 */

import { FaqItem } from '@/data/faq'
import Link from 'next/link'

interface FaqAccordionProps {
  faqs: FaqItem[]
}

interface FaqItemProps {
  faq: FaqItem
}

function FaqAccordionItem({ faq }: FaqItemProps) {
  return (
    <details className="group border-b border-charcoal/10 last:border-b-0">
      <summary
        className="
          flex cursor-pointer items-center justify-between
          py-5 pr-2
          font-serif text-lg text-charcoal
          list-none
          hover:text-charcoal-light
          transition-colors
          [&::-webkit-details-marker]:hidden
        "
      >
        <span>{faq.question}</span>
        <span
          className="
            ml-4 text-xl text-charcoal/40
            transition-transform duration-200
            group-open:rotate-45
          "
        >
          +
        </span>
      </summary>
      <div
        className="
          pb-5 pr-8
          font-serif text-base text-charcoal-light
          leading-relaxed
        "
      >
        <p>{faq.answer}</p>
        {faq.searchExample && (
          <p className="mt-3 text-sm">
            <Link
              href={`/?q=${encodeURIComponent(faq.searchExample)}`}
              className="text-charcoal underline hover:text-charcoal-light"
            >
              Try searching for &ldquo;{faq.searchExample}&rdquo; →
            </Link>
          </p>
        )}
      </div>
    </details>
  )
}

export function FaqAccordion({ faqs }: FaqAccordionProps) {
  return (
    <div className="divide-y divide-charcoal/10 border-t border-charcoal/10">
      {faqs.map((faq) => (
        <FaqAccordionItem key={faq.question} faq={faq} />
      ))}
    </div>
  )
}
```

**Code patterns to follow:**

- Tailwind multi-line class formatting (see `app/page.tsx:161-166`)
- Color variables: `text-charcoal`, `text-charcoal-light`, `border-charcoal/10`
- `font-serif` for typography consistency

**React best practices applied:**

- Server component (no `'use client'`) - static content
- Composition: `FaqAccordionItem` as internal component
- `key` prop uses question text (unique within FAQ set)
- `Link` from `next/link` for internal navigation

**Testing:**

- Manual test: verify accordion opens/closes
- Keyboard test: Tab to summary, Enter/Space to toggle
- Screen reader test: VoiceOver should announce expanded/collapsed state

**Verification:**

- Accordion animates smoothly (CSS transition on rotation)
- Links navigate correctly to search

**Commit:** `feat(components): add accessible FAQ accordion`

---

### Task 4: Create FAQ Page

**Goal:** Complete FAQ page with metadata, schema, and content

**Files to create:**

- `app/faq/page.tsx` - FAQ page route

**Implementation steps:**

1. Create `app/faq/` directory
2. Create `app/faq/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { faqs } from '@/data/faq'
import { FaqSchema } from '@/components/FaqSchema'
import { FaqAccordion } from '@/components/FaqAccordion'

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description:
    'Common questions about etymology, word origins, and how to use Etymology Explorer. Learn what etymology is, how words change over time, and more.',
  alternates: {
    canonical: '/faq',
  },
  openGraph: {
    title: 'FAQ - Etymology Explorer',
    description:
      'Common questions about etymology, word origins, and how to use Etymology Explorer.',
    url: '/faq',
  },
}

export default function FaqPage() {
  return (
    <>
      <FaqSchema faqs={faqs} />

      <main className="min-h-screen bg-cream py-12 md:py-20 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Back link */}
          <Link
            href="/"
            className="
              inline-flex items-center gap-2
              text-sm font-serif text-charcoal-light
              hover:text-charcoal
              transition-colors
              mb-8
            "
          >
            ← Back to Explorer
          </Link>

          {/* Header */}
          <header className="mb-12">
            <h1
              className="
                font-serif text-3xl md:text-4xl
                text-charcoal
                mb-4
                tracking-tight
              "
            >
              Frequently Asked Questions
            </h1>
            <p className="font-serif text-lg text-charcoal-light">
              Common questions about etymology and word origins.
            </p>
          </header>

          {/* FAQ Accordion */}
          <section aria-label="Frequently asked questions">
            <FaqAccordion faqs={faqs} />
          </section>

          {/* CTA */}
          <div className="mt-12 pt-8 border-t border-charcoal/10 text-center">
            <p className="font-serif text-charcoal-light mb-4">Ready to explore word origins?</p>
            <Link
              href="/"
              className="
                inline-block
                px-6 py-3
                bg-charcoal text-cream
                font-serif
                rounded
                hover:bg-charcoal-light
                transition-colors
              "
            >
              Start Exploring
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
```

**Code patterns to follow:**

- Metadata export pattern from `app/layout.tsx:14-70`
- Main container padding: `py-12 md:py-20 px-4`
- Max width container: `max-w-2xl mx-auto`
- Server component (no `'use client'`)

**React best practices applied:**

- Metadata API for SEO (not manual `<head>`)
- Semantic HTML: `<main>`, `<header>`, `<section>` with aria-label
- Fragment `<>` to wrap schema + main content

**Testing:**

- Visit `http://localhost:3000/faq`
- Verify all accordions expand/collapse
- Verify schema in page source (search for `application/ld+json`)
- Test with [Google Rich Results Test](https://search.google.com/test/rich-results)

**Verification:**

- Page renders without errors
- Back link navigates to home
- Schema validates without errors

**Commit:** `feat(pages): add FAQ page with FAQPage schema`

---

### Task 5: Create "What is Etymology?" Educational Page

**Goal:** Long-form educational content optimized for AI citation

**Files to create:**

- `app/learn/what-is-etymology/page.tsx` - Educational guide

**Implementation steps:**

1. Create `app/learn/` directory
2. Create `app/learn/what-is-etymology/` directory
3. Create `app/learn/what-is-etymology/page.tsx` with:
   - Next.js metadata export for SEO
   - Long-form article content (~1200 words)
   - Definition in first paragraph (AI citation optimization)
   - Statistics section with specific numbers (29%, 170,000, etc.)
   - Expert quote with proper attribution (blockquote + cite)
   - Clear H2 hierarchy for sections
   - Bulleted/numbered lists for processes
   - Internal links to search (e.g., `/?q=nice`)
   - Source citations at bottom

**Content structure:**

1. Definition paragraph (AI-optimized first paragraph)
2. "The Origins of English Words" - statistics with specific numbers
3. Expert quote with attribution
4. "How Words Change Over Time" - semantic shift, borrowing, compounding, back-formation
5. "Proto-Indo-European" section
6. Sources section
7. CTA to main search

**AI citation optimization applied:**

- Definition in first paragraph
- Specific statistics with numbers (29%, 170,000, 4500-2500 BCE)
- Expert quote with attribution
- Clear H2 hierarchy
- Bulleted/numbered lists
- Source citations

**React best practices applied:**

- Server component (static educational content)
- Semantic HTML: `<article>`, `<section>`, `<blockquote>`, `<cite>`
- Proper heading hierarchy (h1 → h2)
- `rel="noopener noreferrer"` on external links

**Testing:**

- Visit `http://localhost:3000/learn/what-is-etymology`
- Verify all internal links work
- Check heading hierarchy with browser dev tools

**Verification:**

- Content is ~1200 words (target: 1000-1500)
- All statistics have specific numbers
- Quote has proper attribution

**Commit:** `feat(pages): add educational etymology guide`

---

### Task 6: Add Navigation Header to Main Page

**Goal:** Add FAQ and Learn links to home page

**Files to modify:**

- `app/page.tsx` - Add navigation links to header

**Implementation steps:**

1. In `app/page.tsx`, locate the `<header>` element (lines 190-210)
2. Add `Link` import at top of file:
   ```tsx
   import Link from 'next/link'
   ```
3. Add navigation links above the title in the header section:

```tsx
{/* Header */}
<header className="text-center mb-12 md:mb-16">
  {/* Navigation links */}
  <nav className="flex justify-center gap-6 mb-8 text-sm font-serif">
    <Link
      href="/faq"
      className="text-charcoal-light hover:text-charcoal transition-colors"
    >
      FAQ
    </Link>
    <Link
      href="/learn/what-is-etymology"
      className="text-charcoal-light hover:text-charcoal transition-colors"
    >
      Learn
    </Link>
  </nav>

  <h1 ...>
```

**Code patterns to follow:**

- Existing header styling from `app/page.tsx:190-210`
- Link styling consistent with new pages

**Testing:**

- Click FAQ link → navigates to `/faq`
- Click Learn link → navigates to `/learn/what-is-etymology`
- Both pages' "Back to Explorer" links return to home

**Verification:**

- Navigation is visible and accessible
- Links don't break existing functionality

**Commit:** `feat(nav): add FAQ and Learn links to home page header`

---

### Task 7: Update Sitemap

**Goal:** Add new pages to sitemap for search engine discovery

**Files to modify:**

- `app/sitemap.ts` - Add FAQ and Learn routes

**Implementation steps:**

1. Modify `app/sitemap.ts`:

```typescript
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://etymology.thepushkarp.com'

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/learn/what-is-etymology`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]
}
```

**Code patterns to follow:**

- Existing sitemap structure at `app/sitemap.ts:1-14`

**Testing:**

- Visit `http://localhost:3000/sitemap.xml`
- Verify all three URLs are present
- Verify XML is valid

**Verification:**

- Sitemap includes home, FAQ, and learn page
- Priorities reflect content hierarchy (1.0 > 0.8 > 0.7)

**Commit:** `feat(seo): add FAQ and learn pages to sitemap`

---

### Task 8: Final Lint and Build Verification

**Goal:** Ensure all code passes linting and builds successfully

**Files:** All modified files

**Implementation steps:**

1. Run linting:

```bash
yarn lint
```

2. Fix any lint errors (likely formatting issues):

```bash
yarn lint:fix
```

3. Run build:

```bash
yarn build
```

4. Test production build:

```bash
yarn start
# Visit http://localhost:3000, /faq, /learn/what-is-etymology
```

**Verification:**

- `yarn lint` passes with no errors
- `yarn build` completes successfully
- All pages render correctly in production mode

**Commit:** `chore: fix lint issues` (if needed)

---

## 5. Testing Strategy

### Manual Testing Checklist

| Test                                                                           | Expected Result                    |
| ------------------------------------------------------------------------------ | ---------------------------------- |
| Visit `/faq`                                                                   | Page renders with accordion        |
| Expand/collapse FAQ items                                                      | Smooth animation, content visible  |
| Tab through FAQ items                                                          | Keyboard navigation works          |
| View page source on `/faq`                                                     | FAQPage JSON-LD present            |
| Visit `/learn/what-is-etymology`                                               | Educational content renders        |
| Click internal search links                                                    | Navigate to home with search query |
| Click "Back to Explorer"                                                       | Return to home page                |
| Visit `/sitemap.xml`                                                           | All 3 URLs present                 |
| Run [Rich Results Test](https://search.google.com/test/rich-results) on `/faq` | FAQPage schema validates           |

### Accessibility Testing

| Test                | Tool                                       |
| ------------------- | ------------------------------------------ |
| Keyboard navigation | Manual (Tab, Enter, Space)                 |
| Screen reader       | VoiceOver (macOS) or NVDA (Windows)        |
| Heading hierarchy   | Browser dev tools or HeadingsMap extension |

### No Automated Tests Required

This feature consists of:

- Static content pages (no business logic)
- Native HTML elements (`<details>`, `<summary>`)
- Next.js built-in features (metadata, sitemap)

The project doesn't have a testing framework configured, and manual testing is sufficient for static content.

---

## 6. Documentation Updates

### No README Changes Required

The feature is self-explanatory and discoverable through the UI.

### CLAUDE.md Updates (Optional)

Consider adding to `CLAUDE.md` under "Key Directories":

```markdown
- **`data/`** - Static content data (FAQ content)
- **`app/faq/`** - FAQ page with FAQPage schema
- **`app/learn/`** - Educational content pages
```

---

## 7. Definition of Done

- [ ] `data/faq.ts` created with FAQ content and types
- [ ] `components/FaqSchema.tsx` generates valid FAQPage JSON-LD
- [ ] `components/FaqAccordion.tsx` renders accessible accordion
- [ ] `app/faq/page.tsx` complete with metadata and schema
- [ ] `app/learn/what-is-etymology/page.tsx` complete with AI-optimized content
- [ ] Home page has navigation links to FAQ and Learn
- [ ] Sitemap includes all new pages
- [ ] `yarn lint` passes
- [ ] `yarn build` passes
- [ ] Manual testing complete
- [ ] Rich Results Test validates FAQPage schema

---

## 8. Suggested Commit Sequence

1. `feat(data): add FAQ content data with TypeScript interface`
2. `feat(components): add FaqSchema JSON-LD generator`
3. `feat(components): add accessible FAQ accordion`
4. `feat(pages): add FAQ page with FAQPage schema`
5. `feat(pages): add educational etymology guide`
6. `feat(nav): add FAQ and Learn links to home page header`
7. `feat(seo): add FAQ and learn pages to sitemap`
8. `chore: fix lint issues` (if needed)

Or squash into single commit:
`feat: add FAQ and educational content pages with SEO optimization (#17, #21)`

---

_Generated via /brainstorm-plan on 2026-01-17_
