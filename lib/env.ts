/**
 * Centralized environment variable validation.
 * Lazy-validated on first access (build time doesn't have env vars).
 */

import { z } from 'zod'

// Treat empty strings as undefined so copying .env.example with blank
// optional vars doesn't fail validation (process.env gives "" not undefined).
const emptyToUndefined = z.preprocess((val) => (val === '' ? undefined : val), z.string())

const ServerEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  ADMIN_SECRET: emptyToUndefined.pipe(z.string().min(16)).optional(),
  ETYMOLOGY_KV_REST_API_URL: emptyToUndefined.pipe(z.string().url()).optional(),
  ETYMOLOGY_KV_REST_API_TOKEN: emptyToUndefined.pipe(z.string().min(1)).optional(),
  ELEVENLABS_API_KEY: emptyToUndefined.optional(),
  ELEVENLABS_VOICE_ID: emptyToUndefined.optional(),
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
