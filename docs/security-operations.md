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
- `SECURITY_POLICY`: request trust model defaults
- `ADMIN_POLICY`: operator endpoint authentication header names
- `IDENTITY_POLICY`: signed cookie names used for authenticated-tier verification
- `FEATURE_FLAGS`: operator toggles (`publicSearchEnabled`, `forceCacheOnly`, `disablePronunciation`, `cspReportOnly`)

## Environment Validation

Runtime env parsing is in:

- `lib/server/env.ts`

Key expectations:

- `ANTHROPIC_API_KEY` must be present for etymology generation
- `ANTHROPIC_MODEL` must remain in `claude-haiku-4-5*` family
- Turnstile challenge mode requires both `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `REQUEST_IDENTITY_SIGNING_SECRET` enables verified authenticated quota tier
- `TRUST_PROXY_HEADERS=false` is safest by default; set to `true` only behind a trusted edge/proxy that overwrites client-IP headers
- `ADMIN_SECRET` enables authenticated access to `GET /api/admin/stats`
- Redis is optional but strongly recommended for real guardrail effectiveness

## Trust Model

- Default behavior (`TRUST_PROXY_HEADERS=false`): treat upstream IP headers as untrusted and do not use them for identity/risk decisions.
- When no direct runtime IP is available in that mode, anonymous traffic is intentionally grouped into a single conservative session bucket (`anon:untrusted-network`) to prevent spoofable header rotation bypasses.
- Trusted-edge behavior (`TRUST_PROXY_HEADERS=true`): accept canonical proxy headers (`cf-connecting-ip`, `x-forwarded-for`) for request identity.
- Only enable trusted-edge behavior when every hop before app runtime is controlled and strips/spoofs client-provided forwarding headers.

## Admin Stats Endpoint

- Endpoint: `GET /api/admin/stats`
- Auth header name: `x-admin-secret` (from `ADMIN_POLICY.headerName`)
- Secret source: `ADMIN_SECRET`
- Auth check uses timing-safe comparison and returns `401` on mismatch.
- Returns read-only operational stats:
  - Current cost mode and spend (`dayUsd`, `monthUsd`)
  - Cost guard thresholds (`degrade`, `cache_only`, hard limits)
  - Daily request budget limits and usage/remaining when a budget usage reader is available
  - If a usage reader is unavailable, `usage`/`remaining` fields are `null`

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
4. Confirm `/api/challenge/verify` is healthy and both Turnstile keys are configured

### Third-party source instability

1. Reduce `TIMEOUT_POLICY.externalFetchMs`
2. Increase reliance on cached responses (`CACHE_POLICY` TTLs)
3. Temporarily force degraded mode by lowering cost thresholds if expensive retries spike

## Verification Checklist

After guardrail changes, verify:

- Rate-limited requests return `429` with `Retry-After`
- Suspicious traffic receives challenge-required responses
- Cost modes transition correctly (`normal` → `degraded` → `cache_only`/`blocked`)
- Admin stats endpoint returns `401` without valid `x-admin-secret`
- Admin stats endpoint returns spend/mode data with valid `x-admin-secret`
- Security headers are present in responses
- No API credentials appear in browser storage/network payloads

## Logging Hygiene

Use redaction helpers from `lib/security/redact.ts` for error logging paths.
Never log full headers or raw provider error payloads.
