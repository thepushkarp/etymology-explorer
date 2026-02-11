import { z } from 'zod'
import { INPUT_POLICY } from '@/lib/config/guardrails'

const WORD_REGEX = new RegExp(
  `^[a-zA-Z][a-zA-Z'-]{${INPUT_POLICY.wordMinLength - 1},${INPUT_POLICY.wordMaxLength - 1}}$`
)

export const EtymologyRequestSchema = z
  .object({
    word: z
      .string()
      .trim()
      .min(INPUT_POLICY.wordMinLength, `Word must be at least ${INPUT_POLICY.wordMinLength} characters`)
      .max(INPUT_POLICY.wordMaxLength, `Word must be at most ${INPUT_POLICY.wordMaxLength} characters`)
      .regex(WORD_REGEX, 'Word contains unsupported characters'),
    challengeToken: z.string().trim().min(1).max(INPUT_POLICY.challengeTokenMaxLength).optional(),
  })
  .strict()

export const PronunciationQuerySchema = z
  .object({
    word: z
      .string()
      .trim()
      .min(INPUT_POLICY.wordMinLength, `Word must be at least ${INPUT_POLICY.wordMinLength} characters`)
      .max(INPUT_POLICY.wordMaxLength, `Word must be at most ${INPUT_POLICY.wordMaxLength} characters`)
      .regex(WORD_REGEX, 'Word contains unsupported characters'),
    challengeToken: z.string().trim().min(1).max(INPUT_POLICY.challengeTokenMaxLength).optional(),
  })
  .strict()

export const SuggestionsQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1, 'Query is required')
      .max(
        INPUT_POLICY.suggestionQueryMaxLength,
        `Query must be at most ${INPUT_POLICY.suggestionQueryMaxLength} characters`
      )
      .regex(INPUT_POLICY.suggestionQueryPattern, 'Query contains unsupported characters'),
  })
  .strict()

export type EtymologyRequestInput = z.infer<typeof EtymologyRequestSchema>
export type PronunciationQueryInput = z.infer<typeof PronunciationQuerySchema>
export type SuggestionsQueryInput = z.infer<typeof SuggestionsQuerySchema>
