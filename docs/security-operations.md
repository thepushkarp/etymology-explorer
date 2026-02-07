# Security & Cost Operations Runbook

## Single Tuning Surface

All security/cost knobs are centralized in:

- `lib/config/guardrails.ts`

Do not tune limits by editing route handlers directly.

## Guardrail Groups

- `LLM_POLICY`: provider lock, allowed model family, token budgets, pricing constants
- `RATE_LIMIT_POLICY`: per-route short-window/day quotas plus in-memory fallback bounds/cleanup
- `RISK_POLICY`: challenge trigger thresholds and suspicious traffic heuristics
- `COST_POLICY`: daily/monthly caps and degrade/cache-only thresholds
- `CACHE_POLICY`: TTLs, negative-cache TTL, singleflight lock and polling windows, memory fallback bounds
- `TIMEOUT_POLICY`: external fetch and LLM timeout budgets
- `INPUT_POLICY`: payload and input length limits
- `RESEARCH_POLICY`: source fan-out and root exploration limits
- `IDENTITY_POLICY`: signed cookie names used for authenticated-tier verification
- `FEATURE_FLAGS`: operator toggles (`publicSearchEnabled`, `forceCacheOnly`, `disablePronunciation`, `cspReportOnly`)

## Environment Validation

Runtime env parsing is in:

- `lib/server/env.ts`

Key expectations:

- `ANTHROPIC_API_KEY` must be present for etymology generation
- `ANTHROPIC_MODEL` must remain in `claude-haiku-4-5*` family
- `REQUEST_IDENTITY_SIGNING_SECRET` enables verified authenticated quota tier
- Redis is optional but strongly recommended for real guardrail effectiveness

## Incident Procedures

### API spend rising too quickly

1. Set `FORCE_CACHE_ONLY=true`
2. If needed, set `PUBLIC_SEARCH_ENABLED=false`
3. Lower `COST_POLICY` thresholds only if a temporary stricter ceiling is needed
4. Re-enable gradually after traffic stabilizes

### Bot burst or abuse wave

1. Tighten `RATE_LIMIT_POLICY` for anonymous tier
2. Lower `RISK_POLICY.challengeScoreThreshold`
3. Lower `RISK_POLICY.challengeUsageThreshold`
4. Confirm `/api/challenge/verify` is healthy and `TURNSTILE_SECRET_KEY` is configured

### Third-party source instability

1. Reduce `TIMEOUT_POLICY.externalFetchMs`
2. Increase reliance on cached responses (`CACHE_POLICY` TTLs)
3. Temporarily force degraded mode by lowering cost thresholds if expensive retries spike

## Verification Checklist

After guardrail changes, verify:

- Rate-limited requests return `429` with `Retry-After`
- Suspicious traffic receives challenge-required responses
- Cost modes transition correctly (`normal` → `degraded` → `cache_only`/`blocked`)
- Security headers are present in responses
- No API credentials appear in browser storage/network payloads

## Logging Hygiene

Use redaction helpers from `lib/security/redact.ts` for error logging paths.
Never log full headers or raw provider error payloads.
