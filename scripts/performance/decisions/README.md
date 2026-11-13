# Decision-model evaluation

This standalone experiment compares Jev, Luna Decisions, and Gemini Decision 1 on two
source-grounding questions. Nothing in the application imports this directory; running it
does not change lookup, synthesis, source admission, aliases, or language selection.

## Run

```bash
# Fetch the public model catalog and save a manifest; no paid calls.
bun scripts/performance/decisions/run.ts --label my-dry-run

# Nine paid smoke calls (one fixture, three models, three variants).
bun scripts/performance/decisions/run.ts --label my-smoke --live --limit 1

# 288 paid calls: 32 fixtures × three models × three variants.
bun scripts/performance/decisions/run.ts --label my-full-run --live

bun --no-env-file test scripts/performance/decisions/evaluation.test.ts
```

Live runs require the existing OpenRouter and Redis environment configuration. Labels must
be unique; outputs go to the ignored `bench-results/decisions/<label>/` directory.
Do not run concurrent copies: the local run allowance is not a distributed reservation.

The harness pins each model to its catalog canonical slug, checks the existing monthly
spend guard before each call, and caps its run allowance at $0.25. It conservatively reserves
UTF-8 request bytes plus formatting overhead at catalog input pricing before dispatch.
Each request has a 15-second timeout and no retry. Missing cost information retains the
reserve and stops that model. Provider-reported costs, including unusable responses, enter
the existing monthly spend counter. BYOK adds the separately reported upstream inference
cost to OpenRouter's charge; managed inference is not counted twice. This is accounting
from API usage reports, not a reconciled provider invoice. Other application traffic shares
the monthly guard, whose existing accounting is best effort.

## Protocol

Each request asks both questions against the same supplied source:

- **Coverage:** `present`, `absent`, or `unclear`. Is there an origin account for the exact
  target word, language, and sense? Definitions, grammatical forms, and unspecified related
  words are not origin accounts. A disputed account qualifies; “origin unknown” alone does not.
- **Claim support:** `supported`, `contradicted`, or `insufficient`. Does the source support
  the entire claim, including direction, scope, and uncertainty? This includes diagnostic
  claims about readings and grammatical forms, not only ancestry claims.

`fixtures.json` contains 10 cases drawn from saved source records and 22 authored diagnostic
cases across nine languages. Some cases share a source passage; they are not independent
dictionary samples. Recorded text is an excerpt or lexical response, not an entire research
bundle. The fixture provenance retains attribution and URLs. Wiktionary excerpts are by
Wiktionary contributors under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/);
markup removal and whitespace normalization are noted in the fixture. Authored passages are
test data, not dictionary evidence. Expected labels describe support in the supplied passage,
not a new scholarly judgment about the word's actual history.

Expected answers and provenance never enter the model request. The manifest freezes their
hash before dispatch. Variant 0 is the baseline; variant 1 repeats it exactly; variant 2
reverses the answer-option order. Model order rotates across cases. Questions and labels must
not be tuned on this run and then presented as held-out results.

The hypothetical affirmative gate requires the selected option's probability to be at least
0.95. Missing probabilities never qualify. This number is an experimental threshold, not
a calibrated 95% correctness guarantee. The provider's separate `confidence` field is not
used for gating. Wrong affirmative decisions are counted separately because they could
suppress useful research or allow an unsupported claim.

## Output and interpretation

- `manifest.json`: pinned catalog entries, fixture hash, labels, limits, and protocol.
- `measurements.jsonl`: each attempt's answers, request hash, latency, cost, and errors.
- `responses.jsonl`: redacted provider JSON for audit and billing inspection.
- `summary.json`: per-task correctness, confusion matrices, recorded/synthetic breakdown,
  affirmative-gate errors, repeat/order changes, latency, and cost.

Accuracy denominators contain valid responses; errors are reported separately and must not
be treated as correct decisions. Repeats measure local consistency, not independent sample
accuracy. Network latency is measured around the provider call, excluding Redis checks and
accounting. Full application overhead will be higher.

This is a feasibility experiment. It does not compare end-to-end research quality or cost
against the CPU baseline, evaluate long source bundles, calibrate probabilities, or establish
production false-positive rates. A deployment decision needs held-out real source bundles,
CPU comparisons, and measured downstream search savings. Unknown answers and model failures
must preserve the existing research path. A model judgment cannot create evidence, establish
spelling identity, override source licensing, or eliminate valid language alternatives.

API references: [Decisions endpoint](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request),
[usage accounting](https://github.com/OpenRouterTeam/docs/blob/main/cookbook/administration/usage-accounting.mdx),
[TypeSafe confidence](https://docs.typesafe.ai/confidence).
