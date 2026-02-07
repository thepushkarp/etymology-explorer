# Public Open Hardening Implementation Plan

## Goal

Make the app publicly accessible while the server owns AI costs and secrets.

## Implemented Scope

- Removed browser model/API-key configuration flow
- Removed OpenRouter path and `/api/models`
- Pinned server-side Anthropic model to Claude Haiku 4.5 family
- Added centralized guardrails in `lib/config/guardrails.ts`
- Added server env validation in `lib/server/env.ts`
- Added abuse controls:
  - rate limiting
  - risk scoring
  - challenge verification
  - cost mode enforcement
- Added cache improvements:
  - model-scoped keys
  - negative cache
  - singleflight locking
  - source-data caching
- Added security headers middleware
- Updated docs and `.env.example`

## Centralized Tunables

All thresholds and similar controls are defined in:

- `lib/config/guardrails.ts`

## Public API Changes

- `POST /api/etymology` now accepts `{ word, challengeToken? }`
- Legacy payloads including `llmConfig` are rejected
- `/api/models` removed

## Operational Notes

- Redis is strongly recommended for production enforcement fidelity
- Turnstile secret is optional but required for real challenge verification
- Feature flags can quickly disable search or force cache-only mode
