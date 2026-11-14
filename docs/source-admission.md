# Source admission and lookup evaluation

## Admitted historical annotations

[Oxford–NINJAL](https://oncoj.ninjal.ac.jp/) supplies Old Japanese lexical and grammatical annotations. The [upstream README](https://github.com/ONCOJ/data/blob/fd34a1b284c5dd1e8008df9d3abcb28cfaf464bf/README) licenses the corpus annotation under CC BY 4.0; this is not blanket permission for underlying editions or translations. Only the lexical annotation database is indexed, not the poem corpus.

`scripts/build-oncoj-index.py` pins revision `fd34a1b284c5dd1e8008df9d3abcb28cfaf464bf` and verifies the XML SHA-256. The generated server index retains each complete superEntry XML record, source IDs, exact transcriptions, and explicit derivation references. A derivation becomes a structured edge only if its target ID and transcription agree with another indexed annotation. Other notes remain independent source text. Matching is restricted to Old Japanese; `pi`/`pwi`, `me`/`mye`, and `ko`/`kwo` remain distinct. The index cannot infer a modern Japanese ancestor from spelling resemblance or an English gloss.

Attribution: National Institute for Japanese Language and Linguistics, Oxford–NINJAL Corpus of Old Japanese, accessed 12 November 2026. Annotation index derived from the pinned XML; [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Wiktionary remains the primary Japanese history source. JMdict remains supplementary lexical evidence. Etymonline contributes English borrowing histories, such as [sayonara](https://www.etymonline.com/word/sayonara), rather than comprehensive Japanese coverage. Exa retrieves admitted publishers and does not create another evidence family.

## Japanese local indexes

JMdict uses the official [English XML download](https://www.edrdg.org/pub/Nihongo/JMdict_e.gz) under [EDRDG's CC BY-SA 4.0 terms](https://www.edrdg.org/edrdg/licence.html). `data/jmdict/manifest.json` records the source checksum, creation date, record count and shard checksums. Generated data remains CC BY-SA 4.0; application code licensing does not cover dictionary data. Complete matched entries and sense XML retain source IDs, spelling/reading restrictions, annotations and loan-source attributes. The XML defaults English loan-source language and full extent only when those original attributes are omitted. A wasei marker describes Japanese construction from foreign material, not whole-phrase borrowing. JMdict remains lexical evidence, not an independently inferred ancestry chain.

Rebuild with `python3 scripts/build-jmdict-index.py --source /path/to/JMdict_e.gz --sha256 <reviewed-sha256>`. Omitting these arguments verifies the downloaded bytes against the existing manifest. The rolling upstream URL is not an immutable archive; retain the reviewed download if byte-for-byte regeneration is needed after upstream changes. Refresh the snapshot at least monthly. The runtime reports snapshots older than 31 days as unavailable; durable synthesized entries remain readable and require deliberate retracing. Local indexes bypass Redis source caching, so a deployed snapshot is not hidden by an earlier source-cache value.

The [NINJAL text dataset collection](https://www2.ninjal.ac.jp/textdb_dataset/en/) supplies individually licensed CC BY 4.0 transcriptions/headword data:

| Dataset                                                               | Indexed material                                                                 | Evidence scope                                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Wamyō ruijushō](https://www2.ninjal.ac.jp/textdb_dataset/en/kwrs/)   | Complete matched rows from the twenty-volume 1617 edition transcription          | Historical lexicographical context; Chinese glyph explanations cannot establish Japanese word origins. |
| [Tetsugaku jii](https://www2.ninjal.ac.jp/textdb_dataset/en/tgzi/)    | Complete matched entries in the 1881 terminology transcription                   | Dated translation terminology, not first coinage or borrowing direction.                               |
| [Genkai](https://www2.ninjal.ac.jp/textdb_dataset/en/genk/index.html) | Released 202510 headword rows, including source locations and metadata           | Historical spellings and classifications; not full dictionary definitions or etymologies.              |
| [Nippojisho](https://www2.ninjal.ac.jp/textdb_dataset/en/nipp/)       | Released 202510 headword rows with original romanizations and editorial katakana | Exact transcription matches only. Modernized verb forms and inferred inflections are not lookup keys.  |

Attribution: Wamyō, Genkai and Nippojisho data — NINJAL; Wamyō transcription produced in the NIHU historical corpus project. Tetsugaku jii transcription — Prof. Okajima Akihiro, Osaka University, published by NINJAL. The compressed index is an adapted arrangement of these released datasets under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source manifests retain exact download URLs and SHA-256 checksums. `python3 scripts/build-japanese-historical-index.py` regenerates the index, failing on any changed upstream bytes. The optional `--cache` directory provides previously downloaded files for reproducibility. Linked NDL/BnF scans, publisher dictionary entries and other unreleased material are outside this admission.

Historical matches have the `context` evidence role. They cannot independently admit a modern word, supply an alias proof, define its histories, or ground ancestry edges. Historical spelling and transcription distinctions are not silently modernized.

## Structured Wiktionary evaluation

[Raw Wiktextract dumps](https://kaikki.org/dictionary/rawdata.html) retain the Wiktionary evidence family and licences. Japanese-edition data uses `etymology_texts` and `etymology_links`; English-edition field assumptions do not apply. The Japanese raw extract sampled on 13 November 2026 has SHA-256 `cf8d3f8e35b87d9c94fe61baa0dd9bf5abbe84a2bc4b656c9465a15538c3394d` and contains 19 Japanese records across `ありがとう`, `さようなら`, `はし`, `しろ`, `生物`, `電話`, and `まむし`.

The sample preserves useful readings and etymology prose, but both `まむし` records carry the eel-dish etymology although the native page scopes it to 名詞:鰻丼. These extracts cannot replace source-page history boundaries without additional validation. There is no runtime Kaikki adapter. A future adapter must preserve source-defined sense boundaries, edition/revision provenance and original text, and must not count a dump as independent corroboration. Post-processed Kaikki downloads are deprecated upstream; evaluate raw extracts only.

## Pending publishers

These sources are research references, not runtime adapters or Exa discovery domains. Public access alone does not establish permission for automated ingestion and public synthesis.

| Language     | Reference                                                                                                                       | Admission constraint                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Japanese     | [Kotobank 戦う](https://kotobank.jp/word/戦う-560684)                                                                           | Competing derivations and dated attestations are useful; [publisher terms](https://kotobank.jp/rule/) do not establish permission for this workflow. |
| Italian      | [LEI](https://lei-digitale.it/)                                                                                                 | Scholarly historical etymology; automated access and reuse remain unverified.                                                                        |
| French       | [DEAF](https://www.hadw-bw.de/en/deaf)                                                                                          | Distinguish completed DEAFplus articles from provisional DEAFpré material; verify exact dataset reuse terms.                                         |
| Spanish      | [DHLE](https://www.rae.es/dhle/)                                                                                                | Historical, morphological, and semantic relationships; reuse clearance pending. Any admission retains the RAE/ASALE evidence family.                 |
| Portuguese   | [USP DELPo](https://delpo.prp.usp.br/~delpo/conteudo/delpo_sobre.php)                                                           | Attestation and dating evidence; public coverage and reuse remain insufficiently established.                                                        |
| Hindi / Urdu | [Turner](https://dsal.uchicago.edu/dictionaries/soas/), [Hindi Śabdasāgara](https://dsal.uchicago.edu/dictionaries/dasa-hindi/) | Host terms require permission for relevant reuse.                                                                                                    |
| Sanskrit     | [KoshaSHRI copyright policy](https://koshashri-dc.ac.in/policies/copyRight)                                                     | Relevant reuse requires permission.                                                                                                                  |

## Japanese coverage priorities

- [日本国語大辞典 via JapanKnowledge](https://japanknowledge.com/contents/nikkoku/index.html) provides historical usage, dated examples, word histories, and competing etymological accounts. It is the strongest broad coverage candidate in this survey. Its [copyright policy](https://japanknowledge.com/about/copyright.html) identifies publisher-owned content; a subscription does not establish automated ingestion or public synthesis rights. Runtime admission requires an appropriate publisher agreement.
- [NINJAL's 語誌情報ポータル](https://goshidb.ninjal.ac.jp/goshidb/) combines historical corpus statistics, old dictionaries, language articles, and research bibliographies. It is useful for evidence discovery and attestations, but each linked resource needs its own scope and reuse check. The [site policy](https://www.ninjal.ac.jp/utility/policy/) does not provide blanket open-data permission. ONCOJ's admitted annotation license does not extend to this portal.
- The [National Diet Library's etymology research guide](https://ndlsearch.ndl.go.jp/rnavi/humanities/etymology-origin) identifies further specialist dictionaries, including 小学館日本語源大辞典 and 新明解語源辞典. Publisher pages and print availability alone are insufficient for a runtime adapter.

Existing Wiktionary coverage includes the longer expression and subsequent shortening for [さようなら](https://en.wiktionary.org/wiki/さようなら), with an independent [native-edition account](https://ja.wiktionary.org/wiki/さようなら). A parsed compound must retain the longer expression as its subject and the shortening as a separate relationship; additional sources cannot compensate for incorrect source identity.

## Production gate

Production lookup proposals are disabled. Beta requires an explicit feature flag. Before changing that gate, evaluate a fixed sample containing `たたかえ`, `tatakae`, `kodomo`, `sayonara`, `shiro`, `siro`, `kō`, `kou`, `ko`, an unknown word, a misspelling, and representative Hindi, Urdu, and Sanskrit forms. Record language hints, source revisions, cold/warm cache status, verified candidates, automatic selections, proposal success, total latency, added proposal latency, and provider-reported cost. Compare selections against manually reviewed dictionary relationships; require zero incorrect automatic selections. Source outages are unavailable outcomes, not absent words or successful resolutions. Fixture timings cannot substitute for live latency or accuracy measurements.

Focused tests cover reading variants, source-scoped conjugation tables, ambiguity, evidence-ranked candidates and budget exhaustion, proposal verification, singleflight and spend accounting, cancellation, JSON/SSE parity, durable alias proofs, and cache-only page import boundaries. Browser checks cover preserved text, visible language selection, IME confirmation, deliberate submission, and passive page loads. The source and negative cache versions are independent of durable entries; no bulk retrace is performed.
