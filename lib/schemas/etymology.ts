/**
 * Zod schema for validating cached EtymologyResult data.
 * Used to detect schema mismatches and treat invalid cache as a miss.
 */

import { z } from 'zod'

const BilingualTextSchema = z.object({ en: z.string().min(1), local: z.string().min(1) }).strict()

function createResultSchema<Text extends z.ZodTypeAny>(text: Text, extendedSources = false) {
  const root = z.object({
    root: z.string(),
    origin: z.string(),
    meaning: text,
    relatedWords: z.array(z.string()),
    ancestorRoots: z.array(z.string()).optional(),
    descendantWords: z.array(z.string()).optional(),
  })

  const stage = z.object({
    stage: z.string(),
    form: z.string(),
    note: text.optional(),
    isReconstructed: z.boolean().optional(),
    confidence: z.enum(['high', 'medium', 'low']).optional(),
    evidence: z
      .array(
        z.object({
          source: z.string(),
          snippet: z.string(),
          sourceFamily: z.string().optional(),
        })
      )
      .optional(),
  })

  const ancestryGraph = z.object({
    branches: z.array(z.object({ root: z.string(), stages: z.array(stage) })),
    convergencePoints: z
      .array(
        z.object({
          pieRoot: z.string(),
          meaning: text,
          branchIndices: z.array(z.number()),
        })
      )
      .optional(),
    mergePoint: z.object({ form: z.string(), note: text.optional() }).optional(),
    postMerge: z.array(stage).optional(),
  })

  const sourceBase = {
    name: z.string(),
    url: z.string().optional(),
    word: z.string().optional(),
  }
  const source = z.object(
    extendedSources
      ? {
          ...sourceBase,
          sourceFamily: z.string().optional(),
          license: z.string().optional(),
        }
      : sourceBase
  )

  return z
    .object({
      word: z.string(),
      pronunciation: z.string(),
      definition: text,
      roots: z.array(root),
      lore: text,
      sources: z.array(source),
      ancestryGraph,
      partsOfSpeech: z
        .array(
          z.object({
            pos: z.string(),
            definition: text,
            pronunciation: z.string().optional(),
          })
        )
        .optional(),
      suggestions: WordSuggestionsSchema.optional(),
      modernUsage: z
        .object({
          hasSlangMeaning: z.boolean(),
          slangDefinition: text.optional(),
          popularizedBy: text.optional(),
          contexts: z.array(text).optional(),
          notableReferences: z.array(text).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
}

const WordSuggestionsSchema = z
  .object({
    synonyms: z.array(z.string()).optional(),
    antonyms: z.array(z.string()).optional(),
    homophones: z.array(z.string()).optional(),
    easilyConfusedWith: z.array(z.string()).optional(),
    seeAlso: z.array(z.string()).optional(),
  })
  .passthrough()

const EnglishResultSchema = createResultSchema(z.string())

export const BetaEtymologyResultSchema = createResultSchema(BilingualTextSchema, true).extend({
  language: z.enum(['it', 'es', 'fr', 'pt']),
})

/**
 * Main EtymologyResult schema for cache validation.
 * Uses .passthrough() to allow additional fields for forward compatibility.
 */
export const EtymologyResultSchema = EnglishResultSchema
export const CachedEtymologyResultSchema = z.union([
  BetaEtymologyResultSchema,
  EtymologyResultSchema,
])

export type ValidatedEtymologyResult = z.infer<typeof EtymologyResultSchema>
