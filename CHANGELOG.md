# Changelog

Notable changes to EtymEx, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The site's changelog dialog is built from this file, so each entry must be a single-line,
plain-text bullet under a `###` group. `Unreleased` appears only in beta builds.

## [Unreleased]

## [0.2.1] - 2026-11-28

### Changed

- Show all meaning tabs immediately without a Change meaning toggle and open the first matching meaning by default instead of asking you to pick one.
- Tell clearer, forward-flowing etymology stories with a one-line summary that includes the word's meaning and doubles as the homepage Recently explored byline.
- Display each ancestry stage's meaning directly inside its lineage block by default, keeping source quotes and links one click away.
- Show quiet shimmers while the homepage recent list and word pages load instead of flashing fallback states.
- Smooth out lineage tree dragging, chart scrubbing, live trace updates, autocomplete, and page navigation with lower Redis and client-bundle overhead.

### Fixed

- Correct the homepage 3D dice face layout to a standard Western six-sided die with opposite faces summing to seven and 1 on top, 2 in front, and 3 on the right.

## [0.2.0] - 2026-11-25

### Added

- Explore Hindi, Urdu, and Sanskrit words in their native scripts, with source-backed transliterations, right-to-left Urdu text, and fonts for Devanagari and Urdu.
- Explore Japanese words with source-backed histories, word-origin labels, Japanese typography, and credited JMdict, NINJAL, and Old Japanese sources.
- Search Japanese in kana, kanji, or rōmaji, with verified romanizations, spelling variants, and grammatical forms opening their dictionary entries.
- Search in Auto to find every supported language for a spelling, or pick one from the search language menu.
- Choose between distinct histories of one spelling, including capitalized names and lowercase words such as the Spanish name Macarena and its adjective.
- Follow attested lineage forms, spelling counterparts, and romanization links across supported languages.
- Read an origin summary for the selected meaning below the headword, with source links for that history and its forms.
- Search prefixes and suffixes such as pan- and -ness, and find Wiktionary headwords in autocomplete.
- Watch dictionary and Exa retrieval activity as research expands to components, variants, and ancestors.
- Hear Hindi and Urdu pronunciations and a labelled Hindi reading of Sanskrit.
- Preview upcoming changes at beta.etymex.com, with unreleased entries in its changelog.

### Changed

- Read Italian, Spanish, French, and Portuguese entries in English, with usage examples in the word's own language and English translations; these languages are no longer in beta.
- Switch languages and meanings with the same tabs on saved and live entries, keeping your selection when sharing, reloading, or going Back and Forward.
- Keep tracing related meanings while switching tabs, with each matching history opening as it becomes ready.
- Retry a failed language on its own while other languages stay available, and see why when no lineage is available.
- See saved entries refresh in the background when you search for them, or retrace older research on demand.
- Hear the selected language and reading, with female default voices chosen by language.
- Keep your search language and typed search when navigating or changing language.
- See the full EtymEx logo highlight on hover or keyboard focus, with a matching wordmark favicon.

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
