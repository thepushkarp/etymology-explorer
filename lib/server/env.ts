import 'server-only'

import { z } from 'zod'
import { FEATURE_FLAGS, LLM_POLICY, SECURITY_POLICY } from '@/lib/config/guardrails'

const envSchema = z
  .object({
    ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
    ANTHROPIC_MODEL: z.string().trim().optional(),

    ETYMOLOGY_KV_REST_API_URL: z.string().url().optional(),
    ETYMOLOGY_KV_REST_API_TOKEN: z.string().trim().optional(),

    TURNSTILE_SECRET_KEY: z.string().trim().optional(),
    REQUEST_IDENTITY_SIGNING_SECRET: z.string().trim().min(16).optional(),
    TRUST_PROXY_HEADERS: z.enum(['true', 'false']).optional(),
    ADMIN_SECRET: z.string().trim().min(16).optional(),

    PUBLIC_SEARCH_ENABLED: z.enum(['true', 'false']).optional(),
    FORCE_CACHE_ONLY: z.enum(['true', 'false']).optional(),
    DISABLE_PRONUNCIATION: z.enum(['true', 'false']).optional(),
    CSP_REPORT_ONLY: z.enum(['true', 'false']).optional(),
  })
  .transform((raw) => {
    const model = raw.ANTHROPIC_MODEL?.trim() || LLM_POLICY.defaultModel

    if (!model.startsWith(LLM_POLICY.allowedModelPrefix)) {
      throw new Error(
        `ANTHROPIC_MODEL must start with "${LLM_POLICY.allowedModelPrefix}"; received "${model}"`
      )
    }

    const hasRedis = !!(raw.ETYMOLOGY_KV_REST_API_URL && raw.ETYMOLOGY_KV_REST_API_TOKEN)

    return {
      anthropicApiKey: raw.ANTHROPIC_API_KEY ?? '',
      anthropicModel: model,

      redisUrl: raw.ETYMOLOGY_KV_REST_API_URL,
      redisToken: raw.ETYMOLOGY_KV_REST_API_TOKEN,
      hasRedis,

      turnstileSecretKey: raw.TURNSTILE_SECRET_KEY,
      requestIdentitySigningSecret: raw.REQUEST_IDENTITY_SIGNING_SECRET,
      adminSecret: raw.ADMIN_SECRET,
      securityPolicy: {
        trustProxyHeaders: raw.TRUST_PROXY_HEADERS
          ? raw.TRUST_PROXY_HEADERS === 'true'
          : SECURITY_POLICY.trustProxyHeaders,
      },

      featureFlags: {
        publicSearchEnabled:
          raw.PUBLIC_SEARCH_ENABLED
            ? raw.PUBLIC_SEARCH_ENABLED === 'true'
            : FEATURE_FLAGS.publicSearchEnabled,
        forceCacheOnly:
          raw.FORCE_CACHE_ONLY ? raw.FORCE_CACHE_ONLY === 'true' : FEATURE_FLAGS.forceCacheOnly,
        disablePronunciation:
          raw.DISABLE_PRONUNCIATION
            ? raw.DISABLE_PRONUNCIATION === 'true'
            : FEATURE_FLAGS.disablePronunciation,
        cspReportOnly:
          raw.CSP_REPORT_ONLY ? raw.CSP_REPORT_ONLY === 'true' : FEATURE_FLAGS.cspReportOnly,
      },
    }
  })

export type ServerEnv = z.infer<typeof envSchema>

let cachedEnv: ServerEnv | null = null

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv

  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`)
  }

  cachedEnv = parsed.data
  return parsed.data
}

export function ensureAnthropicConfigured(): ServerEnv {
  const env = getServerEnv()
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for the etymology service')
  }
  return env
}
