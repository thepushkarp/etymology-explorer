# Uncached research and generation benchmarks

These recordings precede the current source-selection policy. See [SOURCE_SELECTION.md](./SOURCE_SELECTION.md) for fallback, recovery, and cache measurements.

Measured on 2026-10-15 on the development Mac. Retained changes preserve the
production model, provider routing, fallback models, reasoning effort, strict
schema, prompts, complete source text, source budget, and evidence validators.
Historical-source caching is measured separately in [RESEARCH.md](./RESEARCH.md).

## Wiktionary parsing

The live English `bank` lookup took 36.13 s to research even though its primary
Wiktionary response headers arrived after 1.58 s. Its 1.29 MB multilingual page
exposed repeated whole-page anchor searches inside every definition-block pass.
Heading offsets are invariant, so the parser resolves each offset once and
uses those positions for the same block-local heading selection.

| Measurement                             |       Before |       After | Scope                                                                |
| --------------------------------------- | -----------: | ----------: | -------------------------------------------------------------------- |
| `bank` CPU extraction                   | 33,420.70 ms |    58.74 ms | Median of three runs per revision over identical saved HTML          |
| `bank` live research                    | 36,132.74 ms | 5,131.20 ms | One uncached live observation per revision; ten source attempts each |
| French `fenêtre`, native edition        |    239.79 ms |    22.90 ms | One CPU coverage run per revision                                    |
| Italian `sale`, English edition         |    396.80 ms |    13.07 ms | One CPU coverage run per revision                                    |
| Spanish `banco`, English edition        |    124.21 ms |     5.58 ms | One CPU coverage run per revision                                    |
| Portuguese `manga`, English edition     |  1,293.70 ms |    36.22 ms | One CPU coverage run per revision                                    |
| French `porte-monnaie`, English edition |      3.61 ms |     2.06 ms | One CPU coverage run per revision                                    |

Complete extracted text, history groups, and spelling variants are deeply equal
before and after on all six saved pages. The `bank` CPU median is about 570 times
faster. The live timing includes variable network waits and is not a general
sevenfold end-to-end prediction. Its remaining wait was the existing five-second
dictionary timeout; the parser no longer blocks the event loop for thirty seconds.

## Time to readable history

The synthesis stream emits the primary history as soon as its complete object
passes the existing finalizer, rather than waiting for the entire histories
array. Only the expected history list narrows for this projection; all source
contexts and parsed chains remain available to reject foreign-history ancestry.
Word, language, primary identity, bilingual shape, and evidence checks still apply.
The complete history collection waits for the existing full-set identity check.

The following comparison replays identical recorded production-prompt response
bytes and their original arrival times through baseline and candidate synthesis:

| Unmodified model input | Before first content | After first content | Samples                                  |
| ---------------------- | -------------------: | ------------------: | ---------------------------------------- |
| English `quarantine`   |              5.144 s |             5.138 s | Median of three responses; one history   |
| French `fenêtre`       |             12.249 s |             9.236 s | Median of three responses; two histories |
| English `bank`         |             18.135 s |             8.600 s | One response; four histories             |
| Italian `sale`         |             12.468 s |             8.537 s | One response; three histories            |
| French `porte-monnaie` |              7.476 s |             7.456 s | One response; one history                |
| Portuguese `janela`    |             11.069 s |            11.048 s | One response; one history                |

French first content is about 25% earlier. Single-history entries gain little
because their history object and enclosing array finish almost together. Total
provider generation time does not change: the improvement is earlier validated
reading. A real-time replay of the first French baseline response reproduced
10.136 s versus 8.256 s, matching its virtual-clock replay within one millisecond.

## Rejected input deduplication

A benchmark-only transformation replaces exact repeated main-source text with
references to unchanged scoped history text. It never deletes scope identifiers,
partial overlaps, ambiguous repeats, or text shared across unrelated providers.
Re-expanding every reference must reproduce the original prompt byte for byte.
Production prompt construction does not use this transformation.

Three paired runs per word alternate baseline/candidate order over frozen research
and the same production request configuration. Medians below measure the existing
full-histories projection, isolating input changes from earlier primary display.

| Measurement                        | Baseline | Deduplicated input |
| ---------------------------------- | -------: | -----------------: |
| English `quarantine` first content |  5.145 s |            8.625 s |
| English completion                 |  8.048 s |           12.392 s |
| English input tokens               |   30,132 |             23,113 |
| English output tokens              |    1,303 |              1,722 |
| French `fenêtre` first content     | 12.251 s |           11.456 s |
| French completion                  | 17.179 s |           16.305 s |
| French input tokens                |   32,859 |             32,575 |
| French output tokens               |    2,634 |              2,471 |

English input shrank about 23%, but both latency measures regressed. The small
French gain does not justify that regression. Additional one-pair cases are
coverage checks, not sufficient evidence to override the repeated English result.
Prompt caching, reasoning, and generated text vary between live responses; all
provider usage details and response deltas are retained locally for inspection.

## Quality and failure checks

There were 24 real provider responses across English, French, Italian, Spanish,
and Portuguese, all resolved to `openai/gpt-6-luna`. Reported cost was $0.058800.
The corpus includes homographs, inflections, a hyphenated phrase, sparse evidence,
multiple source-local histories, native-edition evidence, and English-edition
fallbacks. Source research and replay do not write production caches or counters.

Replaying all 24 responses through old and new production synthesis gives:

- 21 accepted results with deeply equal final objects, including histories,
  source attributions, ancestry pruning, confidence, and evidence.
- Three identical identity rejections: Spanish `banco` baseline and both Portuguese
  `manga` responses added a `formOf` identity absent from the supplied immutable
  history. The replay preserves the beta retry request and failed usage accounting.
- Identical provider request bodies and validation outcomes for every replay.
  Every emitted entry field in accepted results equals its terminal value and
  publishes once.

These counts describe raw provider responses, not production user failure rates;
beta production can retry an invalid response. A valid primary history may appear
before a later sibling fails; the request still errors and no invalid collection
or finished result is published. Tests cover this path, foreign-history ancestry,
wrong primary scope, missing local prose, provider history reordering, and billing.

Manual inspection of accepted stories and lineages against frozen evidence checked
the forty-day origin of `quarantine`, the four independent `bank` histories, noun
versus inflection histories for `fenêtre`, `sale`, and `banco`, Portuguese `janela`,
and the explicitly unresolved origin of `porte-monnaie`. Existing generated prose
still has variability: a French candidate contains an editorial self-correction,
and English graph detail varies between responses. This small corpus is not a
universal linguistic-quality certification. The retained changes establish quality
preservation by identical evidence and same-response output parity; the changed
prompt experiment is rejected.

## Reproduce and inspect

All public source recordings, contexts, prompts, exact deltas, complete results,
usage, hashes, and logs are under ignored `bench-results/research-performance/`.
Keys and authorization headers are never recorded. Use fresh labels for live
generation runs; they incur provider charges, with a local $0.50 invocation bound.

```sh
# No model call: collect source research only.
bun scripts/performance/pipeline.ts --label source-bank --word bank --research-only

# CPU-only extraction; compare full result objects between revisions.
bun scripts/performance/wiktionary-parse.ts \
  --recording bench-results/research-performance/source-bank --label parse-bank --runs 3

# Six live calls: three alternating baseline/deduplicated pairs.
bun scripts/performance/generation-benchmark.ts \
  --context bench-results/research-performance/source-bank/context.json \
  --label input-bank --runs 3

# No network: baseline-module must be a frozen baseline llm.ts with its relative
# imports resolved and sectionScanner import pointing to its baseline scanner.
bun scripts/performance/history-replay.ts \
  --recording bench-results/research-performance/input-bank \
  --baseline-module bench-results/research-performance/llm-before.ts
# Add --sample 0-baseline --realtime to honor wall-clock arrival timing.
```

The baseline modules were frozen from commit `80b4b56`. Original live pairs are
`input-en-pairs` and `input-fr-pairs`; stress cases are `generation-quality-*`.
Parser recordings are `bank-parse-before/after.json` and `parse-*-before/after.json`.
Each generation directory contains `history-replay.json`; the French directory
also contains `history-replay-realtime.json`.

Verification: 393 Bun tests, typecheck, focused lint, formatting, production build,
and the production-browser streaming smoke. The browser uses synthetic local
Redis, SSE, and Ngram boundaries to check early French body/tree rendering, final
consistency, and zero automatic traces on direct load; it is not a language eval.
