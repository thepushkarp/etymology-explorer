/**
 * Zod schema for validating cached EtymologyResult data.
 * Used to detect schema mismatches and treat invalid cache as a miss.
 */

import { z } from 'zod'

// Root object schema
const RootSchema = z.object({
  root: z.string(),
  origin: z.string(),
  meaning: z.string(),
  relatedWords: z.array(z.string()),
  ancestorRoots: z.array(z.string()).optional(),
  descendantWords: z.array(z.string()).optional(),
})

// Ancestry stage schema
const AncestryStageSchema = z.object({
  stage: z.string(),
  form: z.string(),
  note: z.string().optional(),
})

// Ancestry branch schema
const AncestryBranchSchema = z.object({
  root: z.string(),
  stages: z.array(AncestryStageSchema),
})

// Convergence point schema (for shared PIE roots)
const ConvergencePointSchema = z.object({
  pieRoot: z.string(),
  meaning: z.string(),
  branchIndices: z.array(z.number()),
})

// Ancestry graph schema
const AncestryGraphSchema = z.object({
  branches: z.array(AncestryBranchSchema),
  convergencePoints: z.array(ConvergencePointSchema).optional(),
  mergePoint: z
    .object({
      form: z.string(),
      note: z.string().optional(),
    })
    .optional(),
  postMerge: z.array(AncestryStageSchema).optional(),
})

// Source reference schema
const SourceReferenceSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  word: z.string().optional(),
})

const POSDefinitionSchema = z.object({
  pos: z.string(),
  definition: z.string(),
  pronunciation: z.string().optional(),
})

const WordSuggestionsSchema = z
  .object({
    synonyms: z.array(z.string()).optional(),
    antonyms: z.array(z.string()).optional(),
    homophones: z.array(z.string()).optional(),
    easilyConfusedWith: z.array(z.string()).optional(),
    seeAlso: z.array(z.string()).optional(),
  })
  .passthrough()

const ModernUsageSchema = z
  .object({
    hasSlangMeaning: z.boolean(),
    slangDefinition: z.string().optional(),
    popularizedBy: z.string().optional(),
    contexts: z.array(z.string()).optional(),
    notableReferences: z.array(z.string()).optional(),
  })
  .passthrough()

/**
 * Main EtymologyResult schema for cache validation.
 * Uses .passthrough() to allow additional fields for forward compatibility.
 */
export const EtymologyResultSchema = z
  .object({
    // Required core fields
    word: z.string(),
    pronunciation: z.string(),
    definition: z.string(),
    roots: z.array(RootSchema),
    lore: z.string(),
    sources: z.array(SourceReferenceSchema),

    // Optional fields
    ancestryGraph: AncestryGraphSchema.optional(),

    partsOfSpeech: z.array(POSDefinitionSchema).optional(),
    suggestions: WordSuggestionsSchema.optional(),
    modernUsage: ModernUsageSchema.optional(),
  })
  .passthrough() // Allow additional unknown fields for forward compatibility

export type ValidatedEtymologyResult = z.infer<typeof EtymologyResultSchema>
