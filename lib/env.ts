/**
 * Centralized environment variable validation.
 * Lazy-validated on first access (build time doesn't have env vars).
 */

import { z } from 'zod'

// Treat empty strings as undefined so copying .env.example with blank
// optional vars doesn't fail validation (process.env gives "" not undefined).
const optionalString = (schema = z.string()) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

const ServerEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  ADMIN_SECRET: optionalString(z.string().min(16)),
  KV_REST_API_URL: optionalString(z.string().url()),
  KV_REST_API_TOKEN: optionalString(z.string().min(1)),
  ELEVENLABS_API_KEY: optionalString(),
  EXA_API_KEY: optionalString(),
  EXA_ENABLED: z.enum(['true', 'false']).optional(),
})

type ServerEnv = z.infer<typeof ServerEnvSchema>

let validated: ServerEnv | null = null

/**
 * Lazy-validate env vars on first call.
 * Throws with a descriptive message on validation failure.
 */
export function getEnv(): ServerEnv {
  if (validated) return validated

  const result = ServerEnvSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Environment validation failed:\n${issues}`)
  }

  validated = result.data
  return validated
}
