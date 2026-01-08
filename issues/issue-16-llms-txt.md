# Issue #16: Create llms.txt file for AI discoverability

**Status:** Open
**Labels:** None
**Created:** 2026-01-07
**Author:** pushkar
**URL:** https://github.com/thepushkarp/etymology-explorer/issues/16

---

## Overview

Create an `llms.txt` file - an emerging standard that helps LLMs understand your site structure. While not universally adopted yet, it's low-effort and forward-looking for AI search optimization.

## Background

`llms.txt` is a markdown file at your site root that provides LLMs with a structured overview of your site's purpose, features, and content organization. Think of it as `robots.txt` but for context rather than permissions.

## Implementation

Create `/public/llms.txt`:

```markdown
# Etymology Explorer

> A visual tool for exploring word origins, etymological trees, and linguistic connections across languages.

## About

Etymology Explorer helps you understand where words come from. Enter any word to see its historical roots, language family connections, and semantic evolution over time.

## Key Features

- **Word Search**: Search etymology for any English word at https://etymology.thepushkarp.com/
- **Etymology Trees**: Visual representation of word derivations showing parent languages and cognates
- **Language Families**: Explore Proto-Indo-European, Latin, Greek, and Germanic roots
- **Historical Context**: See how word meanings evolved across centuries

## How It Works

The tool aggregates data from multiple etymological databases and presents word origins in an interactive visual format. Each word shows:

- Language of origin (Latin, Greek, Old English, etc.)
- Cognates in related languages
- Historical evolution and semantic shifts
- Related words sharing the same root

## Example Queries

- "What is the etymology of 'algorithm'?" → Shows Persian/Arabic origins from al-Khwarizmi
- "Where does 'nice' come from?" → Shows semantic shift from Latin 'nescius' (ignorant)
- "Proto-Indo-European roots" → Explore ancient language connections

## Technical Details

- Free to use, no registration required
- Works in any modern web browser
- Data sourced from etymological databases and linguistic research

## Contact

- Creator: Pushkar Patel
- Website: https://thepushkarp.com
- GitHub: https://github.com/thepushkarp/etymology-explorer
```

## Acceptance Criteria

- [ ] File accessible at `https://etymology.thepushkarp.com/llms.txt`
- [ ] Content accurately describes the site's features
- [ ] Markdown is well-formatted and readable

## Resources

- [llms.txt Proposal](https://llmstxt.org/)
- [Discussion on AI-friendly site metadata](https://news.ycombinator.com/item?id=38134794)

---

_Part of SEO + AI Search Optimization initiative_
