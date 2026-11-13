# Source admission and lookup evaluation

## Admitted historical annotations

[Oxford–NINJAL](https://oncoj.ninjal.ac.jp/) supplies Old Japanese lexical and grammatical annotations. The [upstream README](https://github.com/ONCOJ/data/blob/fd34a1b284c5dd1e8008df9d3abcb28cfaf464bf/README) licenses the corpus annotation under CC BY 4.0; this is not blanket permission for underlying editions or translations. Only the lexical annotation database is indexed, not the poem corpus.

`scripts/build-oncoj-index.py` pins revision `fd34a1b284c5dd1e8008df9d3abcb28cfaf464bf` and verifies the XML SHA-256. The generated server index retains each complete superEntry XML record, source IDs, exact transcriptions, and explicit derivation references. A derivation becomes a structured edge only if its target ID and transcription agree with another indexed annotation. Other notes remain independent source text. Matching is restricted to Old Japanese; `pi`/`pwi`, `me`/`mye`, and `ko`/`kwo` remain distinct. The index cannot infer a modern Japanese ancestor from spelling resemblance or an English gloss.

Attribution: National Institute for Japanese Language and Linguistics, Oxford–NINJAL Corpus of Old Japanese, accessed 12 November 2026. Annotation index derived from the pinned XML; [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Wiktionary remains the primary Japanese history source. JMdict remains supplementary lexical evidence. Etymonline contributes English borrowing histories, such as [sayonara](https://www.etymonline.com/word/sayonara), rather than comprehensive Japanese coverage. Exa retrieves admitted publishers and does not create another evidence family.

## Pending sources

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

## Production gate

Production lookup proposals are disabled. Beta requires an explicit feature flag. Before changing that gate, evaluate a fixed sample containing `たたかえ`, `tatakae`, `kodomo`, `sayonara`, `shiro`, `siro`, `kō`, `kou`, `ko`, an unknown word, a misspelling, and representative Hindi, Urdu, and Sanskrit forms. Record language hints, source revisions, cold/warm cache status, verified candidates, automatic selections, proposal success, total latency, added proposal latency, and provider-reported cost. Compare selections against manually reviewed dictionary relationships; require zero incorrect automatic selections. Source outages are unavailable outcomes, not absent words or successful resolutions. Fixture timings cannot substitute for live latency or accuracy measurements.

Focused tests cover reading variants, source-scoped conjugation tables, ambiguity, candidate truncation, proposal verification, singleflight and spend accounting, cancellation, JSON/SSE parity, durable alias proofs, and cache-only page import boundaries. Browser checks cover preserved text, visible language selection, IME confirmation, deliberate submission, and passive page loads. The source and negative cache versions are independent of durable entries; no bulk retrace is performed.
