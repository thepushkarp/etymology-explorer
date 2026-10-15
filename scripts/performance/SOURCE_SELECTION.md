# Source selection and incomplete research

Direct Wiktionary evidence takes priority over a senses-only dictionary fallback.
English research starts Etymonline and Wiktionary alongside optional Wikipedia and
Incel Wiki. Other supported languages retain native and English Wiktionary,
selected-language Wikipedia, Wikidata lexical identity, and Portuguese historical
dictionary evidence. Urban Dictionary and the unavailable dictionaryapi.dev client
are removed.

FreeDictionaryAPI.com runs only after no direct Wiktionary edition provides usable
data for the requested language. Its complete response remains available for
definitions, forms, and pronunciation. It shares Wiktionary's source family and
cannot establish ancestry: a fallback-only history is explicitly unresolved and
validation rejects nonempty roots or ancestry graphs. Word spelling and supplied
language codes are checked before accepting entries.

The shared source ceiling is 32 actual HTTP attempts, including redirects,
Wikidata details, and recovery. Existing enrichment breadth and parallelism remain
bounded. Ancestor and English root Wiktionary lookups retry one transient network,
408, or 5xx failure. They do not retry 404, 429, or caller cancellation; a rate-limit
signal stops further retries. Failed root attempts still count against the ceiling.

Unrecovered root/component lookups, skipped root candidates, and missing primary
etymology sources mark research incomplete. The final result still passes the same
identity, bilingual, scoped-evidence, and schema checks, but Redis retains it for
five minutes instead of approximately thirty days. This keeps singleflight waiters
working while allowing a later lookup to recover missing evidence. Word-page data
also revalidates every five minutes so its cache cannot hold an incomplete result
for the former hourly interval. Complete Redis results retain their thirty-day TTL.
Cache namespaces are English `etymology:v2.6:` and multilingual `etymology:beta:v8:`;
older entries are retained under their previous namespaces.

## Controlled measurements

Three samples per scenario use the real research pipeline and adapters. Source
HTTP takes 20 ms, and the dictionary boundary takes 300 ms total. English primary
and recovered-root pages use saved public MediaWiki responses for `polarize` and
`polar`; the remaining responses are synthetic boundary fixtures. No Redis or
model calls occur in this replay. These are application scheduling measurements,
not production latency estimates.

| Scenario                           |    Before |     After | Source HTTP attempts       |
| ---------------------------------- | --------: | --------: | -------------------------- |
| English, direct evidence available | 350.09 ms |  54.81 ms | 10 → 8                     |
| English, transient `polar` failure | 328.96 ms |  78.44 ms | 10 → 9; root recovered     |
| French, direct evidence available  | 305.86 ms |  21.48 ms | 5 → 4                      |
| French, direct evidence missing    | 302.75 ms | 325.23 ms | 5 → 5; unresolved fallback |

The fallback path pays one additional primary-source round trip because it waits
for direct lookup to finish. A transient-root retry can add another source timeout
when its second attempt also fails. Recovery is bounded and unresolved results use
the shorter TTL.

All complete direct-source texts, parsed chains, lexical graphs, and history
boundaries match before and after in the first three scenarios. The recovered
`polar` source is additional evidence; the fallback-only scenario deliberately
creates an unresolved history instead of pretending dictionary senses establish
an origin.

A live French fallback-only synthesis also passed: both reading editions state
that the available evidence does not establish the origin, with empty ancestry
and roots. It completed in 12.80 s at reported cost $0.0010503. Together, these two
smoke generations cost $0.0034176 and made no production cache or counter writes.

A separate live synthesis over the recovered public source bundle validated in
17.38 s, with reported cost $0.0023673. Its `polar` branch includes Greek _πόλος_,
Latin _polus_, and Late Latin _polāris_, and its verified source list includes the
`polar` page. This is one generation smoke check, not a universal quality eval.
No production cache, lock, spend counter, or existing word entry was modified by
the benchmark. Model selection, routing, reasoning effort, full source retention,
and ancestry validation retain their contracts; grounding instructions describe
the current source policy and restrict the senses-only fallback.

## Reproduce

```sh
bun scripts/performance/source-selection.ts --label source-selection

# Optional complete MediaWiki action=parse JSON recordings:
bun scripts/performance/source-selection.ts --label source-selection-recorded \
  --main-page /path/to/polarize.json --root-page /path/to/polar.json
```

Run the same harness in the baseline and candidate checkouts with distinct labels.
Output contains every sample, complete research contexts, and requested URLs under
ignored `bench-results/research-performance/`. The reported baseline used commit
`5530206`. It is retained as `bench-results/polarize-diagnosis/selection-before.json`;
the candidate is `source-selection-final.json`. The original deployment trace and
public source audit are under ignored `bench-results/polarize-diagnosis/`.

Behavioral checks cover conditional fallback in English and French, unresolved
ancestry, language mismatch, transient recovery, permanent/rate-limit failures,
the shared HTTP budget, cancellation, and the short incomplete-result TTL.

Validation: 395 tests, typecheck, lint, formatting, production build, and browser
checks. Lint reports only the existing `.remember/tmp/last-ndc.ts` warning. The
production browser checks verify cached navigation, language routing, crawler
gating, touch drag/reset, resize, reduced motion, and progressive French content.
