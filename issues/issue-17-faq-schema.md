# Issue #17: Add FAQ schema for common etymology questions

**Status:** Open
**Labels:** None
**Created:** 2026-01-07
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/17

---

## Overview

Add FAQ structured data for common etymology questions. FAQs are heavily cited by both Google AI Overviews and LLMs, making this high-impact for AI search visibility.

## Why FAQs Matter for AI Search

Princeton's GEO (Generative Engine Optimization) research found that FAQ-formatted content with clear Q&A structure significantly increases AI citation rates. The structured format makes it easy for LLMs to extract and cite.

## Implementation

### 1. Create FAQ Content Page

Create a dedicated FAQ or "About Etymology" page with common questions:

```markdown
## Frequently Asked Questions

### What is etymology?

Etymology is the study of the origin of words and the way in which their meanings have changed throughout history. It traces words back to their earliest known sources and documents how they evolved across languages and time periods.

### Where does the word 'etymology' come from?

The word 'etymology' comes from Greek 'etymologia', combining 'etymon' (true sense of a word) and 'logia' (study of). It entered English in the 14th century via Latin.

### What percentage of English words come from Latin?

Approximately 29% of English words derive from Latin, with another 29% from French (which itself derives largely from Latin). About 26% come from Germanic languages, and the remaining 16% from Greek and other sources.

### How do words change meaning over time?

Words evolve through several processes:

- **Semantic shift**: "Nice" originally meant "ignorant" in Latin
- **Borrowing**: "Algorithm" comes from Arabic mathematician al-Khwārizmī
- **Compounding**: "Smartphone" = "smart" + "phone"
- **Back-formation**: "Edit" was derived from "editor"

### What is Proto-Indo-European?

Proto-Indo-European (PIE) is the reconstructed common ancestor of the Indo-European language family, believed to have been spoken approximately 4500-2500 BCE. It's the root of languages including English, Spanish, Hindi, Russian, and Greek.
```

### 2. Add FAQPage Schema

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is etymology?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Etymology is the study of the origin of words and the way in which their meanings have changed throughout history. It traces words back to their earliest known sources and documents how they evolved across languages and time periods."
        }
      },
      {
        "@type": "Question",
        "name": "Where does the word 'etymology' come from?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "The word 'etymology' comes from Greek 'etymologia', combining 'etymon' (true sense of a word) and 'logia' (study of). It entered English in the 14th century via Latin."
        }
      },
      {
        "@type": "Question",
        "name": "What percentage of English words come from Latin?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Approximately 29% of English words derive from Latin, with another 29% from French (which itself derives largely from Latin). About 26% come from Germanic languages, and the remaining 16% from Greek and other sources."
        }
      },
      {
        "@type": "Question",
        "name": "How do words change meaning over time?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Words evolve through semantic shift (e.g., 'nice' originally meant 'ignorant'), borrowing from other languages, compounding existing words, and back-formation (deriving new words from existing ones)."
        }
      },
      {
        "@type": "Question",
        "name": "What is Proto-Indo-European?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Proto-Indo-European (PIE) is the reconstructed common ancestor of the Indo-European language family, believed to have been spoken approximately 4500-2500 BCE. It's the root of languages including English, Spanish, Hindi, Russian, and Greek."
        }
      }
    ]
  }
</script>
```

## Tasks

- [ ] Create FAQ content page with 5-10 common questions
- [ ] Add FAQPage schema markup
- [ ] Include statistics and expert citations where possible
- [ ] Validate with [Google Rich Results Test](https://search.google.com/test/rich-results)

## Acceptance Criteria

- [ ] FAQ page exists and is linked from main navigation
- [ ] FAQPage schema validates without errors
- [ ] Answers are concise but complete (50-150 words each)

---

_Part of SEO + AI Search Optimization initiative_
