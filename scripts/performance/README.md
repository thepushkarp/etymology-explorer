# Browser performance benchmarks

The browser harness measures production pages at a 390×844 viewport, 4× CPU
slowdown, 150 ms network latency, and 200 KB/s download speed. Each load and
navigation scenario has five samples; scroll and drag scenarios have three.
JSON output includes individual samples and medians in `bench-results/performance/`.

The fixture server emulates Redis with 100 ms latency, cached English and French
entry shapes, and a 1,000-word index. Audio-cache and lock writes stay in local
memory. The expanded
word list and French fixture are synthetic UI data, not a linguistic quality
benchmark. Browser requests for Ngram data use fixed responses; EventSource is
replaced with a counter. These benchmarks never start provider research.

## Run

Install dependencies with `bun install --frozen-lockfile`, then install a test
browser with `bunx playwright install chromium`. An existing Chrome installation
can be selected using `PLAYWRIGHT_EXECUTABLE_PATH`.

Start the fixture server in one terminal:

```sh
bun run bench:fixtures
```

In another terminal, use the local fixture and disable provider work during both
the build and the production run:

Use a separate checkout, or move the generated `.next/cache/fetch-cache` directory
aside before switching between fixture and normal Redis configurations. Next's
cached index can otherwise carry entries from the previous backend into the build.
After the benchmark, clear that generated fixture cache and rebuild with the
normal environment.

```sh
export ETYMOLOGY_KV_REST_API_URL=http://127.0.0.1:4198
export ETYMOLOGY_KV_REST_API_TOKEN=benchmark
export OPENROUTER_API_KEY=benchmark-no-provider
export RATE_LIMIT_ENABLED=false
export FORCE_CACHE_ONLY=true
bun run build
bun run start --hostname 127.0.0.1 --port 4199
```

Run checks against that server from a third terminal:

```sh
bun run bench:browser before
bun run bench:verify
node scripts/performance/server.mjs server-before 200
```

After an implementation change, rebuild/restart the production server and run
the same scenarios with a different label. `PERF_ONLY=cold`, `navigation`,
`scroll`, or `drag` limits the browser scenarios. `PERF_PREFETCH=false` skips
focusing a word link before clicking it; the default focuses it for one second.
`PERF_BASE_URL` selects a different local production-server URL.

For a controlled prefetch comparison, alternate focused and unfocused samples
on the same build. Compare medians, with no builds or other checks running at
the same time. For cold server checks, use a fresh fixture offset such as 400
instead of 200 so Next's existing page cache cannot bypass the Redis read. Run
these alone: their counter delta includes every request to the fixture server.

## Measured changes, 2026-10-15

| Change                                                    |   Before |  After | Interpretation                                           |
| --------------------------------------------------------- | -------: | -----: | -------------------------------------------------------- |
| Focus-prefetched cached entry, click to displayed heading |   609 ms | 143 ms | 77% faster in alternating samples                        |
| Reopen the same entry after Back                          |   254 ms |  52 ms | 79% faster in alternating samples                        |
| Home largest-contentful paint                             |   996 ms | 784 ms | 21% faster with the 180 ms entrance animation            |
| FAQ largest-contentful paint                              | 1,024 ms | 764 ms | 25% faster with the 180 ms entrance animation            |
| Index largest-contentful paint                            | 1,028 ms | 796 ms | 23% faster with the 180 ms entrance animation            |
| Layout reads during a 60-frame lineage drag               |    1,821 |    602 | 67% less layout work; all eight edges retained           |
| Blocking touchmove listeners on the idle lineage canvas   |        1 |      0 | Normal touch scrolling can proceed without this listener |
| Redis entry reads per cold word-page request              |        2 |      1 | Metadata and rendering share the same request promise    |

The entrance-animation comparison kept the original index implementation.
The drag comparison starts after animations settle. Idle/during-drag/after-drag
touch listener counts and edge positions after resize are verified with real
browser input by `bench:verify`.

An index rewrite replacing per-word Next links with shared handlers was rejected.
Its heap use dropped from 5.73 MB to 4.33 MB, but page paint stayed about 0.8 s
and scrolling work stayed about 80 ms. The extra implementation did not produce
a useful loading or scrolling gain.

Background load on the development Mac varied substantially. Absolute CPU
duration comparisons from the first broad pass are therefore not used as speed
claims. Both original scroll scenarios already had zero frames over 50 ms;
there is no measured general scrolling FPS improvement. Request counts and layout
read counts are deterministic measures of the work removed.

Server startup was already about 80–110 ms locally. Fresh research still depends
on external sources and the LLM; source text, model selection, HTTP budgets,
cache expiry, and synthesis behavior are unchanged. Provider latency is not
measured by this browser harness.

The prefetch behavior follows [Next.js prefetching](https://nextjs.org/docs/app/guides/prefetching):
word destinations are fetched on user interest instead of on viewport entry.

The final full pass reproduced these results: home/FAQ/index paint at
788/772/776 ms, focus-prefetched navigation at 144 ms, and 602 layout reads per
drag. All seven fresh fixture word-page requests made exactly one Redis entry
read, with 112 ms median time to response headers. Before the shared request
promise, the cold-page sample made two reads and had a 128 ms median; that small
timing difference is less reliable than the repeatable request-count reduction.
The final page checks started zero research requests on every direct load.

Validation: 389 Bun tests pass; production build, typecheck, changed-file
formatting, and browser verification pass. Full lint has zero errors and one
existing warning in `.remember/tmp/last-ndc.ts`.

Research, generation, quality constraints, and rejected provider experiments
are measured separately in [RESEARCH.md](./RESEARCH.md).
Pronunciation generation and playback are measured in [AUDIO.md](./AUDIO.md).
