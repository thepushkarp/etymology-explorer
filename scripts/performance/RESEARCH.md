# Research and generation measurements

Most sampled uncached lookups spend their time in source HTTP waits and model generation.
Large multilingual Wiktionary pages also exposed a substantial CPU parsing bottleneck;
its measured fix and the latest generation experiments are in [GENERATION.md](./GENERATION.md).
On this Mac, the initial live `quarantine` lookup spent 5.34 s researching and
10.82 s generating; French `fenêtre` spent 3.40 s researching and 18.36 s
generating. Etymonline returned 403 and Free Dictionary reached its existing
5 s timeout in the English sample. These observations describe this network,
not production's network. Source timeouts and source selection remain unchanged.

## Retained changes

| Change                                                                 |   Before |  After | Evidence                                                                                          |
| ---------------------------------------------------------------------- | -------: | -----: | ------------------------------------------------------------------------------------------------- |
| Overlap root-extraction LLM with independent source-defined enrichment |   541 ms | 334 ms | Three-run deterministic replay; 38% faster, identical complete research contexts and request sets |
| Display validated French story and lineage before terminal completion  | 1,550 ms |  20 ms | Real browser, identical sections, terminal event held for 1,500 ms                                |

The research replay uses the real adapters and parsers with HTTP boundaries
controlled at 30 ms for primary sources, 300 ms for root extraction, and
200 ms for ancestor fetches. Every before/after context is deeply equal,
including complete source text, lexical histories, evidence scopes, parsed
chains, roots, usage, and the seven source HTTP attempts. Its percentage is
not an end-to-end live latency prediction. Where primary-source latency already
hides root extraction, this overlap does not shorten the critical path.

The browser check verifies that the complete local-language story and lineage
are visible while the article remains busy, stay consistent at completion,
and do not substitute English prose. Direct loads still start zero traces.
The server already validates the closed histories through the terminal
finalizer before publishing their primary entry fields; its validation and
unsupported-ancestry pruning are unchanged.

In three original-schema live `fenêtre` generations over frozen research,
the median final response arrived at 19.10 s and the validated primary fields
at 13.13 s. The UI change makes the story and lineage available at the latter
event, about 31% earlier in those recordings. The definition in the header
already streamed; this change specifically removes the wait for the body.

## Rejected experiments

Three paired runs per word alternate the original and candidate request
shapes over the same complete research bundle, model, and reasoning effort.

| Experimental compact output           | Original | Candidate |
| ------------------------------------- | -------: | --------: |
| English generation completion         |   8.81 s |    8.17 s |
| English first validated entry content |   5.24 s |    7.07 s |
| English output tokens                 |    1,252 |       788 |
| French generation completion          |  19.10 s |   14.05 s |
| French first validated entry content  |  13.13 s |   13.20 s |
| French output tokens                  |    2,529 |     1,418 |

Generating the primary entry once instead of twice reduced output and total
generation time, but delayed the first readable English entry by 35% in the
paired median. This schema/prompt change was reverted. The production model,
reasoning effort, prompt, strict schemas, evidence validation, and full source
bundle retain their existing contracts. These small stochastic samples are
not a universal linguistic-quality evaluation.

Latency-sorted provider routing was also rejected: three paired compact-output
generations completed at 7.37 s with default routing versus 8.45 s with latency
sorting, with first content at 6.51 s versus 7.46 s. It did not improve this
workload. Routing experiments use the same model and require strict-schema
support; [OpenRouter documents the provider sorting options](https://openrouter.ai/docs/guides/routing/provider-selection).

## Reproduce

All results, public source bodies, complete contexts, and generated entries
are written under ignored `bench-results/research-performance/`. Labels must
be path-safe; use a new label for each run to retain earlier evidence.
Live commands use the configured OpenRouter key and incur provider charges.
They disable Redis within the benchmark process, so they never replace
production caches, acquire production locks, or write production spend counters.
Provider-reported usage and spend are recorded locally. No headers or keys
are recorded.

```sh
# Real uncached source research and streaming generation
bun scripts/performance/pipeline.ts --label live-en --word quarantine
bun scripts/performance/pipeline.ts --label live-fr --word fenêtre --language fr

# Six sequential provider calls: alternating original/compact pairs, three each
bun scripts/performance/generation-compare.ts \
  --context bench-results/research-performance/live-en/context.json \
  --label output-pairs --runs 3

# Repeat the rejected routing experiment on the compact output shape
bun scripts/performance/generation-compare.ts \
  --context bench-results/research-performance/live-en/context.json \
  --label routing-pairs --compare-routing --runs 3

# No network calls: run in baseline and candidate checkouts, then compare
# complete contexts and sorted request sets, as well as the median durations.
bun scripts/performance/research-replay.ts scheduling
```

For the browser check, use the fixture server and app environment described in
[README.md](./README.md). It mocks the SSE and Ngram boundaries and never calls
a provider. Run `node scripts/performance/streaming.mjs --label streaming`
against the candidate, or add `--held` against the original UI. Set
`PLAYWRIGHT_EXECUTABLE_PATH` to use an existing Chrome installation.
The reported 20/1,550 ms comparison used a local development server; startup
and compilation are excluded from the section-to-display timing.

Raw evidence for this run: `scheduling-before.json`, `scheduling-final.json`,
`streaming-before.json`, `streaming-after.json`, `quarantine-paired.json`,
`french-paired.json`, and `routing-paired.json` in the results directory.

## Historical ancestor source cache

Selected-language ancestor lookups share the seven-day raw source cache.
Historical selections are keyed by the exact encoded Wiktionary language
heading and canonical word; English selections keep the existing `wiktionary`
namespace. Complete selected-language text, history groups, explicit variants,
redirect identity, and revision provenance survive the round trip. Misses and
errors are not cached. The final result can be uncached while an ancestor page
is already available from another word's research.

A three-run replay uses the saved live French `fenêtre` HTTP bodies with the
real source adapters, parsers, and Upstash client. Network boundaries are local:
Redis takes 100 ms, primary source HTTP 30 ms, and ancestor HTTP 700 ms.
Neither phase reads or writes a finished etymology result or calls a model.

| Research state                                 |   Before |    After |
| ---------------------------------------------- | -------: | -------: |
| Uncached result, raw sources already available |   895 ms |   206 ms |
| Uncached result, all source caches empty       | 1,209 ms | 1,319 ms |

The warm-source research phase is 77% faster in this controlled replay; this
is not an end-to-end generation improvement. A fully cold lookup pays one extra
100 ms Redis round trip. Warm ancestor hits make zero source HTTP attempts
and do not consume the 16-request HTTP budget. All six before/after contexts
are deeply equal apart from the actual HTTP count, and all complete synthesis
prompts have the same SHA-256 hash. The model, prompt, schema, reasoning effort,
evidence checks, routing, and source coverage retain their existing contracts.

```sh
bun scripts/performance/ancestor-cache.ts \
  --recording bench-results/research-performance/before-french-correct \
  --label ancestors-final
```

Use a pipeline recording containing successful public source bodies and no
root-extraction call. Run the same harness in the baseline and candidate
checkouts, using distinct labels. `ancestors-before.json` and
`ancestors-final.json` retain every sample and full context locally.

Ancestor-cache validation: 390 Bun tests, typecheck, focused lint, formatting,
the production build, and replay context/prompt parity checks pass.

## Follow-up measurements

The saved measurements still place synthesis ahead of research on the critical
path. The English prompt contains 106,646 characters and the French prompt
95,316 characters before the system prompt and strict schema. Both contain
substantial overlapping text between the complete Wiktionary source and scoped
history excerpts. The English scoped excerpt alone repeats 23,099 characters
from the complete source. Paired benchmarks of exact text references reduced
English input tokens but delayed both first content and completion. That prompt
experiment is rejected. Publishing the first complete validated primary history
did improve time to content with identical terminal results. See
[GENERATION.md](./GENERATION.md) for the full measurements and quality checks.

Research also retains a primary-source barrier before enrichment. Overlapping
it with ancestor requests requires preserving primary, variant, component, and
ancestor HTTP priority under the shared 16-attempt limit. In beta research,
Wikidata identity affects history boundaries, so parsing an early native page
as the final history set would change the evidence contract. Neither the
barrier nor the prompt representation is changed by the cache optimization.

Validation: 389 Bun tests, typecheck, changed-file formatting, production build,
and both browser checks pass. The production streaming smoke displayed the
French body 18 ms after the section events while the final result remained
held for 1,500 ms. Full lint has no errors and one existing warning in
`.remember/tmp/last-ndc.ts`. Benchmark servers are stopped and the normal
production build is restored after clearing the generated fixture cache.
