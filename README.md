# Etymology Explorer

A web app for exploring word origins through source-backed etymology research and Claude-structured synthesis.

## What Changed For Public Launch

This project is now configured for public usage with server-managed AI costs:

- Fixed provider/model: **Anthropic Claude Haiku 4.5**
- No browser API keys and no model selector
- Layered abuse controls (validation, rate limits, risk scoring, challenge gates)
- Cost guardrails with degrade/cache-only/blocked modes
- Centralized tunables in one file: `lib/config/guardrails.ts`

## Core Features

- Etymology lookup with source aggregation (Etymonline + Wiktionary + optional contextual sources)
- Structured output synthesis into typed JSON responses
- Related roots and ancestry graph rendering
- Pronunciation audio via ElevenLabs (optional)
- Cached responses to reduce cost and latency

## Security and Cost Controls

### Centralized Policy
All thresholds and operator controls live in:

- `lib/config/guardrails.ts`

This module defines:

- `LLM_POLICY`
- `RATE_LIMIT_POLICY`
- `RISK_POLICY`
- `COST_POLICY`
- `CACHE_POLICY`
- `TIMEOUT_POLICY`
- `INPUT_POLICY`
- `RESEARCH_POLICY`
- `FEATURE_FLAGS`

### Runtime Enforcement

- Input schema validation on API routes
- Query schema validation for `/api/suggestions` (`SuggestionsQuerySchema`)
- Legacy `llmConfig` request payloads rejected
- Per-route rate limiting for anonymous/authenticated tiers
- Authenticated tier only when signed identity cookies are verified server-side
- Proxy-derived client IPs are used only when `TRUST_PROXY_HEADERS=true`
- If no trusted IP source exists, anonymous traffic is pooled under one conservative key (`anon:untrusted-network`) to prevent header-spoof bypasses
- Risk scoring and challenge verification for suspicious traffic
- Cost mode enforcement (`normal` / `degraded` / `cache_only` / `blocked`)
- Cache stampede control via singleflight locks
- Security headers from `middleware.ts`
- Read-only operator stats endpoint gated by timing-safe admin secret comparison

## API Endpoints

- `POST /api/etymology`
  - Request: `{ "word": "example", "challengeToken"?: "..." }`
- `GET /api/pronunciation?word=example&challengeToken=...`
- `GET /api/random-word`
- `GET /api/suggestions?q=...`
- `POST /api/challenge/verify`
- `GET /api/admin/stats`
  - Requires header: `x-admin-secret: <ADMIN_SECRET>`
  - Returns read-only spend/cost-mode and daily request budget stats

## Local Development

```bash
yarn install
yarn dev
```

Then open `http://localhost:3000`.

## Environment Variables

Copy `.env.example` and fill values:

- `ANTHROPIC_API_KEY` (required for `/api/etymology`)
- `ANTHROPIC_MODEL` (optional override, must be Haiku 4.5 family)
- `ETYMOLOGY_KV_REST_API_URL` / `ETYMOLOGY_KV_REST_API_TOKEN` (recommended)
- `TURNSTILE_SECRET_KEY` (optional, enables challenge verification)
- `REQUEST_IDENTITY_SIGNING_SECRET` (optional, enables verified authenticated tier)
- `TRUST_PROXY_HEADERS` (default `false`; set `true` only behind trusted proxy headers)
- `ADMIN_SECRET` (optional; if set, enables authenticated `/api/admin/stats`)
- `ELEVENLABS_API_KEY` (optional pronunciation)
- feature flags: `PUBLIC_SEARCH_ENABLED`, `FORCE_CACHE_ONLY`, `DISABLE_PRONUNCIATION`, `CSP_REPORT_ONLY`

## Architecture Notes

- Server-only env parsing and validation: `lib/server/env.ts`
- Redis client abstraction: `lib/server/redis.ts`
- Guardrails and thresholds: `lib/config/guardrails.ts`
- Abuse controls:
  - `lib/security/rate-limit.ts`
  - `lib/security/risk.ts`
  - `lib/security/cost-guard.ts`
  - `lib/security/challenge.ts`

## License

MIT
