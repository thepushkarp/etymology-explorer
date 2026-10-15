# Pronunciation performance

The browser already plays directly from an audio URL and reuses the decoded
element for repeat playback. The server delayed the first response by awaiting
cache persistence and two lock-release round trips after generating the entire
clip. Its cost check also waited for lock acquisition, and concurrent listeners
inherited the etymology pipeline's two-second polling interval.

The retained changes defer cache persistence and lock cleanup with Next's
`after()`, overlap the cost check with lock acquisition, and use a 250 ms audio
polling interval. Persistence still precedes lock release. The ten-second
waiter window is unchanged; shorter polling trades extra Redis reads for less
waiting without generating duplicate clips.

## Measurements, 2026-10-15

These are production-build measurements on a local Node server. Three cold-audio
samples use separate desktop Chrome contexts, followed by replay of the same
audio element. Redis round trips take 100 ms. The provider fixture sends the
same previously generated 21,359-byte MP3 after 300 ms, in 4,096-byte chunks
150 ms apart. The clip is 1.28 s, 44.1 kHz, 128 kb/s MP3. There is no browser CPU
or network throttling. These timings isolate application waits; they are not
production-provider latency promises.

| Retained change                                          |   Before |    After |
| -------------------------------------------------------- | -------: | -------: |
| First playback: defer cache persistence and lock cleanup | 1,807 ms | 1,457 ms |
| First playback: parallel cost check and lock acquisition | 1,457 ms | 1,356 ms |
| Concurrent listener: audio-specific polling interval     | 2,328 ms | 1,636 ms |

The final isolated pass measured first playback at **1,369 ms**, versus the
original 1,807 ms: about **24% earlier**. A concurrent listener received the
complete clip in **1,630 ms**, versus 2,327 ms: about **30% sooner**. Replay
measured 50 ms versus 47 ms originally; that path remains effectively unchanged.
The differences between 1,356 and 1,369 ms are run-to-run variation: the final
polling change only affects listeners joining an existing generation.

Raw results are under ignored `bench-results/audio-performance/`:
`audio-before.json`, `audio-deferred.json`, `audio-parallel.json`,
`audio-final-isolated.json`, `concurrent-before.json`,
`concurrent-parallel.json`, and `concurrent-final-isolated.json`.

## Quality and reliability

The production ElevenLabs client retains its existing voice, `eleven_v4` model,
language selection, stability, similarity, speaker boost, output format, and
generation endpoint. Complete generation still succeeds before the response
starts. HTTP and Redis cache lifetimes and language-qualified cache keys retain
their existing behavior. OpenRouter routing and model fallbacks are untouched.

The integration check verifies complete output against the exact fixture bytes,
separate language caches, provider errors, interrupted-body rejection and retry,
cache completion after a client disconnect, released failure locks, input
validation, and the budget guard. Cache hits remain available under budget
pressure while an uncached clip is rejected. Concurrent owner/waiter responses
have identical SHA-256 hashes and MISS/HIT roles.

## Rejected streaming experiment

Two live three-pair probes compared ElevenLabs' ordinary and streaming endpoints
using the same generation settings. Streaming sometimes delivered bytes sooner,
but completion gains varied: one French phrase completed at 787 ms ordinarily
versus 875 ms through the streaming endpoint.

In the controlled Chrome playback comparison, streaming plus deferred cleanup
played at 1,446 ms versus 1,457 ms for deferred cleanup alone. The earlier HTTP
headers did not produce a useful playback gain for these short MP3 clips, so the
streaming client, response tee, and background-body collection were reverted.
No latency/quality trade-off parameters or faster speech models were introduced.

The [ElevenLabs streaming API](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)
documents the transport and the quality trade-off in its deprecated latency
optimization option. Neither that option nor a streaming transport is used by
the retained production change.

## Reproduce

Use any local MP3 fixture. To generate the live comparison clips with the
configured ElevenLabs voice, run the following command; it makes six billable
provider requests, records no credentials or voice ID, and never uses Redis:

```sh
bun scripts/performance/audio-provider.ts --label provider-pairs
```

Start `bun run bench:fixtures`, then build with the local Redis URL/token and
dummy provider keys. Clear or move aside the generated `.next/cache/fetch-cache`
when switching Redis backends, as described in [README.md](./README.md).

```sh
export ETYMOLOGY_KV_REST_API_URL=http://127.0.0.1:4198
export ETYMOLOGY_KV_REST_API_TOKEN=benchmark
export OPENROUTER_API_KEY=benchmark-no-provider
export ELEVENLABS_API_KEY=benchmark
export ELEVENLABS_VOICE_ID=benchmark
export RATE_LIMIT_ENABLED=false
export FORCE_CACHE_ONLY=false
export AUDIO_PERF_FIXTURE=bench-results/audio-performance/provider-pairs/0-buffered.mp3
bun run build
node --import ./scripts/performance/audio-fixture.mjs \
  node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4199
```

Run the following from another terminal, with `AUDIO_PERF_FIXTURE` pointing to
the same file. Set `PLAYWRIGHT_EXECUTABLE_PATH` for an existing Chrome install.

```sh
node scripts/performance/audio-browser.mjs audio-before
node scripts/performance/audio-concurrent.mjs concurrent-before
node scripts/performance/audio-verify.mjs
```

Restart the fixture server and app between before/after runs to clear generated
clips and fault-injection counts. The fixture implements cache/lock commands and
REST response encoding; it does not emulate TTL eviction. Run the verification
script after timing finishes: its budget-limit scenario temporarily changes the
local fixture budget. This script must not run concurrently with playback timing.
The browser and concurrency timing scripts use disjoint clip keys.

The fixture binds only to localhost. The preload intercepts ElevenLabs calls;
dummy keys prevent accidental real generation. Stop both servers, clear the
generated fixture cache, and rebuild with the normal environment afterward.

Validation: 389 Bun tests, production builds, typecheck, changed-file formatting,
audio browser/concurrency/reliability checks, and the existing browser regression
check pass. Full lint has no errors and one existing warning in ignored local
`.remember/tmp/last-ndc.ts`. Benchmark servers are stopped and the normal build
is restored after clearing the generated fixture cache.
