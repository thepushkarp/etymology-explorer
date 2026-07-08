# Synthesis Model Bakeoff - July 7, 2026

This note records the OpenRouter model reruns from branch `feat/model-bakeoff`,
after PR #71 (`feat/structured-synthesis`) added strict Responses schema mode,
model-specific reasoning profiles, and source clipping that preserves tail
evidence.

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

## Decision

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

## Root Extraction Fallback Model

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
