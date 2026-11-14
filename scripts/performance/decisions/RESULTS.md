# Decision-model evaluation — 13 November 2026

Jev is the strongest cost/accuracy candidate for a guarded shadow experiment. Luna is a
useful conservative comparator for source coverage. None should replace deterministic
source admission or evidence validation on the strength of this sample. Application lookup
behavior remains unchanged.

## Method

Protocol `etymex-decisions-v1`: 32 cases, two questions per call, three models, and three
variants (original, identical repeat, reversed answer options). The full run made 288 calls
and returned 576 judgments. All responses passed schema validation; there were no transport
errors or retries. An additional nine-call smoke run is excluded from accuracy statistics.

Ten cases use recorded source text and 22 are authored diagnostics. They cover nine target
languages, but some cases reuse passages, and only Japanese and Romance languages have
recorded-source cases. This is a small diagnostic sample, not a representative multilingual
benchmark. Labels assess the supplied passage against the protocol's rules; they have not
been independently adjudicated. Prompts and expected labels were frozen before the run.

Pinned models:

- `typesafe/jev-1.14-20261014` via TypeSafe
- `openai/gpt-6-luna-decisions-20261006` via OpenAI
- `google/gemini-decision-1-20261111` via Google AI Studio

## Results

Each accuracy denominator includes 32 cases across three variants: 96 judgments per task.
These are repeated cases, not 96 independent samples. Latency is provider round-trip time
for both questions together, excluding Redis checks and accounting.

| Model             | Coverage accuracy | Claim-support accuracy | Median / p95 latency | Full-run cost |
| ----------------- | ----------------- | ---------------------- | -------------------- | ------------- |
| Jev 1.14          | 90/96 (93.8%)     | 93/96 (96.9%)          | 448 / 521 ms         | $0.003260     |
| Luna Decisions    | 93/96 (96.9%)     | 89/96 (92.7%)          | 407 / 668 ms         | $0.005685     |
| Gemini Decision 1 | 90/96 (93.8%)     | 90/96 (93.8%)          | 824 / 1114 ms        | $0.004859     |

On the recorded-source subset, Jev and Luna scored 30/30 for both tasks; Gemini scored
30/30 for coverage and 27/30 for support. The short, curated passages make these results
easier than judging full production research bundles.

### Affirmative decisions at probability ≥ 0.95

| Model  | Coverage approvals / wrong approvals | Claim approvals / wrong approvals |
| ------ | ------------------------------------ | --------------------------------- |
| Jev    | 60 / 3                               | 32 / 0                            |
| Luna   | 36 / 0                               | 14 / 0                            |
| Gemini | 45 / 0                               | 33 / 0                            |

There were 57 expected-positive coverage judgments and 33 expected-positive claim judgments
per model. Jev's three wrong high-probability approvals are the same lexical-source fixture
across three variants, not three independent failures. Zero observed wrong approvals in
the other cells does not establish a production safety rate. Model probabilities are not
calibrated correctness estimates.

### Consistency

All models preserved their labels across the identical repeat. Reversing options changed
two Luna claim-support labels; Jev and Gemini labels remained unchanged.

Threshold decisions were less stable than labels: Jev had one claim gate flip on the
identical repeat and one on the option reversal. Luna had three coverage gate flips and
two claim gate flips on option reversal. Gemini had none. Maximum observed probability
movement was 0.18 for Jev and 0.42 for Luna; Gemini returned identical distributions across
these variants. This run does not establish consistency across model updates, providers,
dates, or longer inputs.

## Failure cases

- **Jev:** treated a Japanese imperative-form note as origin coverage, below the threshold.
  It also accepted Japanese lexical loan metadata as origin coverage at 0.95–0.96. The
  application already has a source-role check; preserving it before any model call blocks
  this known policy violation. The model must never become that check's replacement.
- **Luna:** classified the lexical loan fixture as coverage at 0.51, so the proposed gate
  abstained. It marked a short French `pain` ancestry statement insufficient in two variants,
  and changing option order altered two support labels.
- **Gemini:** missed origin coverage in the short Portuguese `casa` and Urdu `کتاب` passages.
  It treated evidence for Portuguese `manga` meaning fruit as contradicting a claim about the
  sleeve sense; the rubric requires insufficient evidence for a different sense.
- **All three:** treated “origin unknown” as contradicting a proposed Latin derivation.
  The rubric distinguishes lack of support from direct contradiction. This error affects
  label accuracy but did not produce an affirmative approval.

Coverage and support are separate questions in one request. Whether separating them improves
accuracy remains untested. Some diagnostics exercise application-specific policy boundaries;
explicit code checks should enforce those boundaries instead of relying on implicit model
interpretation.

## Pipeline recommendation

1. Keep source role, availability, known language/sense boundaries, licensing, spelling
   identity, caches, and HTTP/spend budgets deterministic. Do not replace dictionary-backed
   language discovery with a single predicted language.
2. First evaluate **Jev in shadow mode before optional Exa discovery**, after those checks,
   only where existing parsing cannot determine semantic coverage. Compare it with Luna
   on held-out complete source bundles. Log proposed skips without suppressing research.
3. Measure useful Exa calls incorrectly suppressed, unnecessary calls avoided, added latency,
   and total research quality/cost against the current CPU path. Use downstream outcomes to
   choose a model and threshold. Keep the existing path on uncertainty or model failure.
4. Keep claim-support judgments observational initially. No model approval may create an
   evidence reference or authorize an alias; no model rejection should silently remove
   source-backed history. Jev is worth testing here because it had the best support accuracy
   and lowest cost in this sample.

A paired decision cost roughly $0.000034 (Jev), $0.000059 (Luna), or $0.000051 (Gemini) on
these short inputs. Those are feasibility figures, not demonstrated savings. Full source
bundles will cost more, and calls that do not avoid downstream work add cost and latency.
This experiment did not measure end-to-end savings or enable production routing.

## Cost and artifacts

Full-run accounted cost: **$0.013804698**. Smoke-run cost: **$0.000457974**.
Combined: **$0.014262672**, below the $0.25 allowance.

Gemini used an existing BYOK route: OpenRouter reported zero gateway charge plus a separate
upstream inference cost. These figures include that upstream amount; they are provider usage
reports, not invoice reconciliation. See [OpenRouter usage accounting](https://github.com/OpenRouterTeam/docs/blob/main/cookbook/administration/usage-accounting.mdx).

The initial running process recorded gateway charges only. Raw outputs are retained; an
offline replay produced `measurements-accounted.jsonl` and `summary-accounted.json` and added
the missing $0.005022 to the existing monthly spend counter. `cost-reconciliation.json`
records each adjustment. The maintained harness includes BYOK upstream costs directly.

Local audit directories (ignored by Git):

- `bench-results/decisions/decisions-v1-2026-11-13/`
- `bench-results/decisions/decisions-smoke-2026-11-13/`

Use `summary-accounted.json` for these two runs. Their manifests preserve exact fixtures,
labels, hashes, catalog prices, and pinned models; raw responses preserve all probability
distributions and usage fields. See [README.md](./README.md) for reproduction and limits.

Validation: four focused tests, project type checking, scoped ESLint, formatting checks,
and the live runs passed. No production build or browser check was needed for this standalone
harness; no application modules were modified for this experiment.
