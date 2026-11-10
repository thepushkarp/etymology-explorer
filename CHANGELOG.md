# Changelog

Notable changes to EtymEx, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The site's changelog dialog is built from this file, so each entry must be a single-line,
plain-text bullet under a `###` group. `Unreleased` appears only in beta builds.

## [Unreleased]

### Added

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
