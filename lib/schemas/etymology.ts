/**
 * Zod schema for validating cached EtymologyResult data.
 * Used to detect schema mismatches and treat invalid cache as a miss.
 */

import { z } from 'zod'

const BilingualTextSchema = z.object({ en: z.string().min(1), local: z.string().min(1) }).strict()

function createEntryFields<Text extends z.ZodTypeAny>(text: Text) {
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

  return {
    pronunciation: z.string(),
    definition: text,
    roots: z.array(root),
    lore: text,
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
  }
}

function createResultSchema<Text extends z.ZodTypeAny>(text: Text, extendedSources = false) {
  const entry = createEntryFields(text)
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
          licenseUrl: z.string().optional(),
        }
      : sourceBase
  )

  return z
    .object({
      word: z.string(),
      ...entry,
      sources: z.array(source),
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

export const BetaEtymologyResultSchema = createResultSchema(BilingualTextSchema, true)
  .extend({
    language: z.enum(['it', 'es', 'fr', 'pt']),
    primaryHistoryId: z.string().min(1),
    histories: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: BilingualTextSchema,
            entryKind: z.enum(['lemma', 'form', 'unresolved']),
            queryNodeId: z.string().min(1),
            lemmaNodeId: z.string().min(1),
            formOf: z.object({ word: z.string().min(1), language: z.string().min(1) }).optional(),
            evidenceScopeIds: z.array(z.string().min(1)).min(1),
            ...createEntryFields(BilingualTextSchema),
          })
          .strict()
      )
      .min(1)
      .max(4),
  })
  .superRefine((result, context) => {
    const ids = result.histories.map((history) => history.id)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['histories'],
        message: 'History IDs must be unique',
      })
    }
    if (!ids.includes(result.primaryHistoryId)) {
      context.addIssue({
        code: 'custom',
        path: ['primaryHistoryId'],
        message: 'Primary history must reference an existing history',
      })
    }
  })

const JapaneseFormationPartSchema = z
  .object({
    form: z.string().min(1),
    reading: z.string().min(1).optional(),
    meaning: z.string().min(1),
    role: z.enum(['component', 'source', 'adaptation', 'suffix', 'whole']),
  })
  .strict()

export const LearnerEtymologyResultSchema = createResultSchema(z.string(), true).extend({
  language: z.literal('ja'),
  entryId: z.string().regex(/^\d+$/),
  reading: z.string().min(1),
  romaji: z.string().min(1),
  alternateForms: z.array(z.string()),
  lexicalStratum: z.enum(['native', 'sino-japanese', 'loanword', 'hybrid', 'wasei', 'uncertain']),
  evidenceState: z.enum(['grounded', 'lexical_only']),
  formation: z
    .object({
      kind: z.enum(['compound', 'derivation', 'borrowing', 'historical-development', 'opaque']),
      parts: z.array(JapaneseFormationPartSchema),
      result: z.string().min(1),
      note: z.string().min(1),
    })
    .strict(),
  originSummary: z.string().min(1),
})

/**
 * Main EtymologyResult schema for cache validation.
 * Uses .passthrough() to allow additional fields for forward compatibility.
 */
export const EtymologyResultSchema = EnglishResultSchema
export const CachedEtymologyResultSchema = z.union([
  LearnerEtymologyResultSchema,
  BetaEtymologyResultSchema,
  EtymologyResultSchema,
])

export type ValidatedEtymologyResult = z.infer<typeof EtymologyResultSchema>
