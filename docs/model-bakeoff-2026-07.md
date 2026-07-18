# Synthesis Model Bakeoff - July 7, 2026

> **July 18 follow-up:** Production now uses `openai/gpt-5.6-luna` for both
> synthesis and the root-extraction fallback. A fresh paired 15-word run showed
> materially lower synthesis latency at a modest cost increase. The July 7
> results and decision below are retained as the historical baseline.

This note records the OpenRouter model reruns from branch `feat/model-bakeoff`,
after PR #71 (`feat/structured-synthesis`) added strict Responses schema mode,
model-specific reasoning profiles, and source clipping that preserves tail
evidence.

## July 18 Follow-up: Luna Re-evaluation

### Candidate screen

The follow-up focused on models that could plausibly replace GPT-5.4 Mini without
changing the synthesis transport contract. A synthesis candidate must work
through OpenRouter's Responses endpoint, advertise strict JSON Schema support
for `provider.require_parameters = true`, and remain fast enough for an
interactive public endpoint. Root extraction has a separate, lighter gate
described below.

- [`openai/gpt-5.6-luna`](https://openrouter.ai/openai/gpt-5.6-luna-20260709)
  advertised `response_format` and `structured_outputs`, with list pricing of
  $1/M input tokens and $6/M output tokens. It advanced to the full benchmark.
- [`thinkingmachines/inkling`](https://openrouter.ai/thinkingmachines/inkling)
  was also reviewed. Its $1/M input and $4.05/M output pricing was attractive,
  but the OpenRouter model metadata on July 18 did not advertise
  `response_format` or `structured_outputs`. Because strict schema support is a
  hard synthesis gate, Inkling did not pass the metadata eligibility screen and
  was not sent through the paid 15-word run. Its strict Responses compatibility
  was not live-tested; reconsider it if its OpenRouter capabilities change.

The screen intentionally did not treat a lower list price as sufficient. This
pipeline depends on schema correctness, predictable latency, and evidence-aware
output. A model that does not advertise the strict Responses capabilities is
not eligible for a paid synthesis benchmark without a separate compatibility
probe.

### Follow-up method

Two full-pipeline runs were started together against the fixed 15-word set:

```bash
bun scripts/benchmark.ts --label bench-2026-07-18-gpt54-control \
  --model openai/gpt-5.4-mini
bun scripts/benchmark.ts --label bench-2026-07-18-gpt56-luna \
  --model openai/gpt-5.6-luna
```

Running the pair concurrently reduced time-of-day and upstream-service drift.
Both used the same code, word set, schemas, prompt budgets, and low synthesis
reasoning profile. The `--model` override applied only to synthesis, so the
root-extraction fallback remained GPT-5.4 Mini during both benchmark runs.

This is a paired full-pipeline comparison, not a frozen-prompt laboratory test.
Each run fetched and expanded its own research context, so source latency,
network variance, and nondeterministic root extraction can affect total latency,
input tokens, and the evidence available to synthesis. Synthesis latency and
schema validity are the strongest signals; small confidence differences should
not be interpreted as a controlled model-quality score.

### Follow-up results

| model                 | valid | p50 total | p50 synth | total cost | cost/word | synth under 10s | confidence high/med/low/unscored | total tokens in/out |
| --------------------- | ----: | --------: | --------: | ---------: | --------: | --------------: | -------------------------------- | ------------------- |
| `openai/gpt-5.4-mini` | 15/15 |    11.26s |     9.57s |    $0.1281 |  $0.00854 |           10/15 | 22/23/13/28                      | 60371/18410         |
| `openai/gpt-5.6-luna` | 15/15 |    10.10s |     6.29s |    $0.1564 |  $0.01043 |           14/15 | 11/29/19/26                      | 58665/14171         |

Costs include OpenRouter-reported synthesis and root-extraction spend. Because
the benchmark's root fallback still used GPT-5.4 Mini in both runs, the cost
difference primarily reflects synthesis. The control reported $0.12465 for
synthesis and $0.00347 for six extraction calls; the Luna run reported $0.15324
for synthesis and $0.00315 for six GPT-5.4 Mini extraction calls.

Relative to the control, Luna:

- reduced p50 synthesis latency by 34.3 percent (9.57s to 6.29s);
- reduced p50 end-to-end latency by 10.3 percent (11.26s to 10.10s);
- produced the faster synthesis result for 13 of 15 words and the faster total
  result for 11 of 15;
- reduced total output tokens by 23.0 percent (18,410 to 14,171);
- increased reported cost per attempted word by 22.1 percent ($0.00854 to
  $0.01043); and
- remained schema-valid for all 15 words, with zero ungrounded reconstructed
  stages in both runs.

Here, `valid` means the final post-processed result passed
`EtymologyResultSchema`. The unary synthesis path can retry malformed output
once, but this benchmark version did not record attempt or retry counts.
Therefore, 15/15 is final schema validity, not evidence that every first model
response passed without a retry.

The confidence distribution moved away from `high` toward `medium` and `low`.
That is a real caution signal, but confidence is assigned after synthesis by
matching stages against the independently gathered source evidence; it is not a
blinded human quality judgment. No separate blinded preference evaluation was
recorded in this session, so the result supports an operational latency/cost
decision rather than a claim that Luna is categorically better at etymology.

### Root-extraction smoke test

After changing the production default, the exact Luna root-extraction request
was probed separately because the full benchmark had kept that call on GPT-5.4
Mini. The probe used `bread` with the production prompt, strict root schema,
100-token output cap, and `reasoning = { effort: "none" }`. It returned
`{"roots":["bread"]}` in about 1.5 seconds at a reported cost of $0.000149.

`provider.require_parameters` remains synthesis-only. Prior live testing showed
that adding it to this tiny extraction request changed routing from roughly one
second to 15 seconds or more, consuming the entire extraction timeout. The root
request still asks for strict JSON Schema; application code then parses and
normalizes a `roots` array, caps it at four entries, and safely returns no roots
when output is unusable.

This single call verifies route compatibility, valid shape, latency, and billing
on one representative single-root input. It is not an extraction-quality or
reliability benchmark. A stronger follow-up would compare Luna and GPT-5.4 Mini
over single-root, multi-root, affix-heavy, no-source, malformed-output, and
timeout cases.

### July 18 decision and implementation

Switch every application LLM request to `openai/gpt-5.6-luna`:

- synthesis uses low reasoning;
- root extraction uses no reasoning;
- there is no application-level fallback to GPT-5.4 Mini or another model; and
- the $1/M input and $6/M output values in `CONFIG.costTracking` are accounting
  fallbacks only, used when OpenRouter omits `usage.cost`. They do not select a
  fallback model.

In this non-frozen full-pipeline run, the change cost roughly $0.0019 more per
uncached benchmark word and coincided with a 3.28-second improvement in p50
synthesis latency. The existing $10 monthly budget, cache-only threshold,
30-day result cache, and singleflight request deduplication continue to bound
the production impact.

The three uses of “fallback” are distinct:

| fallback type | current behavior                                                                       |
| ------------- | -------------------------------------------------------------------------------------- |
| model         | none; every LLM request names Luna                                                     |
| algorithmic   | CPU root extraction runs first; Luna is called only when CPU extraction finds no roots |
| accounting    | configured Luna prices estimate spend only when OpenRouter omits `usage.cost`          |

The change is implemented in draft PR
[#79](https://github.com/thepushkarp/etymology-explorer/pull/79) alongside the
orthogonal valid-word admission fix. Verification for the combined change
included 216 passing tests, a successful production build, ESLint with zero
errors, changed-file Prettier validation, and the live Luna extraction smoke test
above.

## July 7 Historical Baseline

## Method

- Command: `bun scripts/benchmark.ts --label <label> --model <openrouter-slug>`.
- Scope: full in-process research + synthesis pipeline for the 15-word
  benchmark set. `--model` overrides the synthesis model only; the root
  extraction fallback stays on the production default path.
- Required gate: schema-valid Zod result for all 15 benchmark words.
- Operational gate: latency must be suitable for a public search endpoint.
- Cost source: OpenRouter `usage.cost` when present, summed from per-word
  artifacts in `bench-results/<label>/`.

## Request Profiles

The app uses `POST /api/v1/responses` with:

- `text.format = { type: "json_schema", strict: true, ... }`
- `provider.require_parameters = true` for synthesis
- no `temperature`
- model-specific `reasoning` profiles from `lib/openrouterResponses.ts`

Live probes showed these production-safe profiles:

| model                        | reasoning profile                      |
| ---------------------------- | -------------------------------------- |
| `openai/gpt-5.4-mini`        | `{ effort: "low" }`                    |
| `google/gemini-3.5-flash`    | `{ effort: "minimal", exclude: true }` |
| `deepseek/deepseek-v4-flash` | omitted                                |
| `deepseek/deepseek-v4-pro`   | omitted                                |
| `xiaomi/mimo-v2.5`           | `{ effort: "none", exclude: true }`    |
| `xiaomi/mimo-v2.5-pro`       | `{ enabled: false, exclude: true }`    |
| `moonshotai/kimi-k2.6`       | `{ enabled: false, exclude: true }`    |
| `z-ai/glm-5.2`               | `{ enabled: false, exclude: true }`    |
| `minimax/minimax-m3`         | `{ enabled: false, exclude: true }`    |
| `tencent/hy3`                | `{ effort: "none", exclude: true }`    |

`tencent/hy3` was also probed directly with a tiny strict JSON schema request
using the Responses endpoint, `require_parameters`, and `reasoning.effort =
"none"`. It timed out after 70 seconds without returning output, so it is not a
current production candidate.

## Full-Run Results

| model                        | valid | p50 total | p50 synth |    cost | cost/ok | confidence high/med/low/unscored | tokens in/out | verdict                                     |
| ---------------------------- | ----: | --------: | --------: | ------: | ------: | -------------------------------- | ------------- | ------------------------------------------- |
| `openai/gpt-5.4-mini`        | 15/15 |     11.1s |      9.8s | $0.1447 | $0.0096 | 28/22/14/29                      | 56052/22807   | keep default                                |
| `google/gemini-3.5-flash`    | 15/15 |      8.2s |      7.2s | $0.1886 | $0.0126 | 18/23/9/30                       | 68191/14065   | fastest, but pricier and weaker confidence  |
| `deepseek/deepseek-v4-flash` | 15/15 |     45.9s |     43.4s | $0.0195 | $0.0013 | 26/21/8/20                       | 49793/37516   | cheap but too slow                          |
| `z-ai/glm-5.2`               | 14/15 |     24.1s |     23.3s | $0.1002 | $0.0072 | 20/23/12/24                      | 42545/16823   | failed schema on `word`                     |
| `minimax/minimax-m3`         | 15/15 |     36.6s |     33.5s | $0.0337 | $0.0022 | 38/25/19/31                      | 44135/16948   | best cheap quality challenger, but too slow |

## Partial/Rejected Runs

| model                      | evidence                                                                        | rejection reason                              |
| -------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| `deepseek/deepseek-v4-pro` | 3 valid words; `telephone` 99.2s, `autobiography` 255.8s and 7908 output tokens | operationally too slow/verbose                |
| `xiaomi/mimo-v2.5`         | `perfidious` valid in 125.1s                                                    | too slow                                      |
| `xiaomi/mimo-v2.5-pro`     | 2 valid words; 16.4s then 44.7s, next word stalled                              | unstable latency                              |
| `moonshotai/kimi-k2.6`     | first word produced no artifact before manual stop                              | stalled with reasoning disabled               |
| `tencent/hy3`              | tiny strict-schema probe timed out after 70s                                    | unsuitable for Responses structured synthesis |

## July 7 Decision (Historical)

Keep `openai/gpt-5.4-mini` as the production synthesis model.

Rationale: it is the only candidate that balanced strict-schema reliability,
usable latency, cost, and confidence quality. Gemini is faster but more
expensive and lower-confidence on this benchmark. Minimax M3 is the most
interesting challenger because it is much cheaper and higher-confidence, but its
33.5s p50 synthesis latency (36.6s total) is too slow for the current public UX.
DeepSeek Flash is cheaper but slower still. GLM failed the 15/15 schema-valid
gate.

MiniMax M3's 33.5s p50 synth was measured reasoning-disabled
(`{ enabled: false, exclude: true }`), so its slowness is inherent to model /
provider throughput, not reasoning overhead — there is no faster no-thinking
mode left to unlock on this route. A dedicated (non-OpenRouter) MiniMax endpoint
is the only untested speed lever, relevant only for a future non-interactive /
background synthesis path where M3's ~4x lower cost and higher confidence would
pay off.

## July 7 Root Extraction Position (Historical)

The `--model` flag overrides the synthesis model only; the root extraction
fallback (`extractRootsQuick` in `lib/research.ts`, request built by
`buildRootExtractionRequest` in `lib/openrouterResponses.ts`) stays on the
production default `openai/gpt-5.4-mini`. It is deliberately left there rather
than pointed at a cheaper model:

- **Never benchmarked.** This bakeoff measured synthesis only. Swapping the
  extraction model would ship an unmeasured production change, which is the
  opposite of this branch's "no production model change" conclusion.
- **Tight timeout + strict schema.** The extraction call uses strict
  `json_schema` mode with `reasoning.effort = "none"` under a hard 15s timeout
  (`CONFIG.timeouts.rootExtraction`). The cheap challengers here were slow:
  DeepSeek V4 Flash ran 43.4s p50 synthesis. Even on the smaller extraction
  schema and truncated input, a model that slow risks blowing the 15s timeout,
  which makes the fallback silently return no roots and degrades breadth.
  `openai/gpt-5.4-nano` is entirely unmeasured for strict-schema reliability on
  this path.
- **Negligible cost upside.** Extraction is capped at 100 output tokens
  (`CONFIG.rootExtractionMaxTokens`) and only fires when CPU root extraction
  finds nothing, so its cost is a small fraction of synthesis (now recorded
  separately by the benchmark harness). A cheaper extraction model would save
  little while risking timeout and schema failures.

If a cheaper extraction model is wanted later, benchmark it on the extraction
path specifically (strict schema, 15s budget) before switching.

## Source Clipping State

After PR #71 follow-up commit `55e64b7`, synthesis source blocks no longer
silently head-truncate long text. The current behavior:

- source text is sanitized for tags, control characters, and directional marks;
- over-budget source blocks keep roughly 70 percent head plus 30 percent tail
  with an explicit clipped marker;
- parsed etymology-chain evidence is appended separately;
- Etymonline raw extraction no longer has a hidden 2000-character cap;
- root-extraction fallback uses the same head+tail clipping strategy.

The prompt still uses fixed per-block character budgets from `CONFIG.promptBudget`.
The next quality improvement, if needed, is evidence-first extraction: preserve
sentences containing derivation formulas, cognates, first-attestation dates,
and parsed chain snippets before allocating remaining budget to general prose.
