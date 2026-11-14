# Changelog

Notable changes to EtymEx, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The site's changelog dialog is built from this file, so each entry must be a single-line,
plain-text bullet under a `###` group. `Unreleased` appears only in beta builds.

## [Unreleased]

### Added

- Consult licensed NINJAL historical dictionary transcriptions and headword records as dated Japanese context.
- Choose a search language from a theme-matched menu with language codes, keyboard navigation, and stable spacing when switching languages.
- Show dictionary-attested Japanese lookup destinations alongside existing results, including entries whose ancestry is unavailable.
- Resolve verified Japanese romanizations and grammatical forms, with source-backed choices for ambiguous readings and an optional beta lookup assistant.
- Research explicitly attested Old Japanese forms using pinned Oxford–NINJAL lexical annotations with source attribution.
- Keep typed searches when changing language and protect Japanese input-method confirmation from accidental submission.
- Open one Japanese entry through dictionary-confirmed spelling variants, with linked spellings and preserved misspelling labels.
- See unreleased changes in the beta changelog, with the beta build identified in the header.
- Preview the latest main changes at beta.etymex.com while production remains release-only.
- Follow dictionary and Exa retrieval activity as research expands to components, variants, and ancestors, including during retraces.
- Hear a labelled Hindi reading of Sanskrit Devanagari, with female stock voice fallback when the preferred voice is unavailable.
- Follow attested lineage forms, source-listed spelling counterparts, and romanization links across supported languages.
- Explore Japanese words with source-backed histories, word-origin labels, Japanese typography, and credited JMdict lexical context.
- Explore Hindi, Urdu, and Sanskrit words in their native scripts, with source-backed transliterations, language tabs, and curated discovery words.
- Hear Hindi and Urdu pronunciations, with right-to-left Urdu text and fonts for Devanagari and Urdu.

### Changed

- Keep empty reading groups unavailable instead of displaying unrelated saved readings, while retaining direct-word access and return-language tabs.
- Share language and meaning navigation rules across server, saved, and live views, with consistent grammatical labels and dictionary links.
- Keep loaded meanings visible when an additional Japanese lookup times out, with a word-specific inline message and an explicit retry.
- Look up Japanese senses and restricted readings locally from official JMdict XML, preserving original loanword metadata and source attribution.
- Preserve Japanese Wiktionary numbered and nested meaning boundaries, and recognize explicit native-language derivation and shortening statements.
- Preserve the longer source expression before shortening in Japanese etymologies such as sayonara, so valid compound histories can be traced.
- Keep Etym in the accent colour, highlight the full logo on hover or keyboard focus, and use the matching EtymEx wordmark for favicons.
- Rank Japanese lookup alternatives by source evidence without a fixed candidate-count cutoff, automatically check source-linked destinations, and display all saved matching meanings.
- Preserve source-confirmed language tabs in both directions for Japanese entries with a single written form, including on reload and direct navigation.
- Preserve correction suggestions and error types when streaming falls back to a JSON response, and keep Auto searches in Auto when choosing a correction.
- Keep the search language preference independent of result tabs and spelling redirects, retaining explicit choices across navigation and reloads in the same browser tab.
- Recognize conjugated forms listed together in dictionary tables or marked with footnotes, including native-script and rōmaji input.
- Keep additional dictionary-listed meanings available as explicitly unchecked links when a lookup reaches its verification limit.

- Retain independent word meanings when the same spelling is also a grammatical form, with verified dictionary-form destinations kept as choices.

- Preserve Auto for manually started traces and keep non-Japanese written-form destinations free of unsupported lookup context.
- Open cross-word links at the destination entry while preserving scroll for same-entry language and meaning selections.
- Unify language and meaning navigation across saved and live results, render shared selections on reload, and retain failed-language tabs without substituting unrelated readings.

- Open the first listed Japanese meaning by default when selecting its language tab, keeping alternative meanings available in the same selector.
- Use one consistent history selector layout and stable header spacing, keeping Japanese reading groups focused when switching meanings.
- Keep language navigation visible and group ambiguous Japanese lookups by meaning, while direct kanji searches retain their own readings and histories.
- Preserve selected etymological histories and lookup context when sharing, reloading, or navigating Back and Forward.
- Open verified native-script entries from the language tabs, with a spelling or meaning choice when several targets exist.
- Keep language navigation focused on available entries without notices listing unsupported languages.
- Select female default pronunciation voices by language, preferring language labels and verified language support before a multilingual fallback.
- Play the selected language and IPA reading with separate audio clips for distinct pronunciations.
- Restore completed traces when navigating Back and Forward without starting another trace.
- Show source links for the selected etymological history and its forms.
- Accept prefix and suffix searches such as pan- and prioritize dictionary-returned affixes in autocomplete.
- Recover failed synthesis with a bounded corrective retry, retain failed-language tabs with targeted retry actions, and explain unavailable lineage.
- Pronunciation playback follows language changes without stale audio resetting the selected entry.
- Auto discovers supported languages for a spelling and traces their histories together with language tabs.
- Saved entries remain discoverable across pipeline updates, with an explicit retrace action for older research.
- Autocomplete includes Wiktionary headwords beyond the vocabulary list.

- Italian, Spanish, French, and Portuguese entries are written in English, with usage examples in the word's own language and their English translations.
- Italian, Spanish, French, and Portuguese are no longer marked as beta.

## [0.1.0] - 2026-11-07

### First release, with all features consolidated

- Trace the origin of any English word or phrase back through the languages it passed through.
- Follow each word's lineage in an interactive tree.
- See a confidence rating and sources for every stage of a lineage, grounded in dictionary evidence.
- Explore root morphemes and the words that share them.
- Read a short story of each word's history, with two contrasting usage examples.
- Follow words with independent histories through separate stories and lineages.
- Look up words in Italian, Spanish, French, and Portuguese (beta), with paired local and English text.
- Draw on general and specialist dictionaries, including historical ones for Old English, Latin, and Ancient Greek.
- Watch new traces arrive live, section by section.
- Check parts of speech, hear pronunciations, and see usage over time.
- Find synonyms, antonyms, homophones, easily confused words, and see-also links.
- Get autocomplete and typo suggestions while searching.
- Open a random word or revisit recent searches.
- Share a page for every traced word, and browse them all in the index.
- Switch between light and dark themes.
- See the current version and changelog from the site header.
