/**
 * Zod schema for validating cached EtymologyResult data.
 * Used to detect schema mismatches and treat invalid cache as a miss.
 */

import { z } from 'zod'
import { candidateLanguages, ETYMOLOGY_STRATA, SUPPORTED_LANGUAGE_CODES } from '../languages'
import { SOURCE_FAMILY_IDS, SOURCE_PROVIDER_IDS } from '../sourceProviders'
import { canonicalizeWord, isValidWord } from '../validation'

const scriptTarget = z
  .object({
    word: z.string().refine((word) => isValidWord(word) && canonicalizeWord(word) === word),
    language: z.enum(SUPPORTED_LANGUAGE_CODES),
  })
  .refine((target) => candidateLanguages(target.word).includes(target.language))

const root = z.object({
  root: z.string(),
  origin: z.string(),
  meaning: z.string(),
  relatedWords: z.array(z.string()),
  ancestorRoots: z.array(z.string()).optional(),
  descendantWords: z.array(z.string()).optional(),
})

const stage = z.object({
  transliteration: z.string().optional(),
  stage: z.string(),
  form: z.string(),
  note: z.string().optional(),
  isReconstructed: z.boolean().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  evidence: z
    .array(
      z.object({
        source: z.string(),
        snippet: z.string(),
        sourceFamily: z.string().optional(),
        sourceUrl: z.string().optional(),
        evidenceScopeId: z.string().optional(),
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
        meaning: z.string(),
        branchIndices: z.array(z.number()),
      })
    )
    .optional(),
  mergePoint: z.object({ form: z.string(), note: z.string().optional() }).optional(),
  postMerge: z.array(stage).optional(),
})

const example = z.object({
  text: z.string().min(1),
  translation: z.string().min(1).optional(),
})

const entryFields = {
  counterparts: z.array(scriptTarget).optional(),
  stratum: z.enum(ETYMOLOGY_STRATA).optional(),
  transliteration: z.string().optional(),
  pronunciation: z.string(),
  definition: z.string(),
  roots: z.array(root),
  lore: z.string(),
  // Optional: entries cached before usage examples existed stay valid.
  examples: z.array(example).max(2).optional(),
  ancestryGraph,
  partsOfSpeech: z
    .array(
      z.object({
        pos: z.string(),
        definition: z.string(),
        pronunciation: z.string().optional(),
      })
    )
    .optional(),
}

const history = z
  .object({
    id: z.string().min(1),
    label: z.string(),
    entryKind: z.enum(['lemma', 'form', 'unresolved']),
    queryNodeId: z.string().min(1),
    lemmaNodeId: z.string().min(1),
    formOf: z.object({ word: z.string().min(1), language: z.string().min(1) }).optional(),
    evidenceScopeIds: z.array(z.string().min(1)).min(1),
    ...entryFields,
  })
  .strict()

const source = z.object({
  name: z.enum([...SOURCE_PROVIDER_IDS, 'synthesized']),
  url: z.string().optional(),
  word: z.string().optional(),
  sourceFamily: z.enum(SOURCE_FAMILY_IDS).optional(),
  license: z.string().optional(),
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

/**
 * The single EtymologyResult schema, for every language. Uses .passthrough()
 * to allow additional fields for forward compatibility. Prose is plain
 * English text, so an entry cached with paired `{ en, local }` prose fails
 * validation and is read as a miss.
 */
export const EtymologyResultSchema = z
  .object({
    language: z.enum(SUPPORTED_LANGUAGE_CODES),
    word: z.string(),
    primaryHistoryId: z.string().min(1),
    histories: z.array(history).min(1),
    ...entryFields,
    sources: z.array(source),
    suggestions: WordSuggestionsSchema.optional(),
    modernUsage: z
      .object({
        hasSlangMeaning: z.boolean(),
        slangDefinition: z.string().optional(),
        popularizedBy: z.string().optional(),
        contexts: z.array(z.string()).optional(),
        notableReferences: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .superRefine((result, context) => {
    const ids = result.histories.map((entry) => entry.id)
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
    if (
      result.language !== 'ja' &&
      (result.stratum || result.histories.some((entry) => entry.stratum))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['stratum'],
        message: 'Stratum applies only to Japanese',
      })
    }
    // An English sentence needs no gloss; any other sentence must carry one.
    const english = result.language === 'en'
    const entries = [
      { path: [] as Array<string | number>, examples: result.examples },
      ...result.histories.map((entry, index) => ({
        path: ['histories', index] as Array<string | number>,
        examples: entry.examples,
      })),
    ]
    for (const { path, examples } of entries) {
      examples?.forEach((entry, index) => {
        if (english === (entry.translation === undefined)) return
        context.addIssue({
          code: 'custom',
          path: [...path, 'examples', index, 'translation'],
          message: english
            ? 'English examples must not carry a translation'
            : 'Examples in another language need an English translation',
        })
      })
    }
  })

/** Stored wrapper; never sent to the per-language synthesis model. */
export const WordEntrySchema = z
  .object({
    word: z.string(),
    languages: z.array(z.enum(SUPPORTED_LANGUAGE_CODES)).min(1),
    entries: z.partialRecord(z.enum(SUPPORTED_LANGUAGE_CODES), EtymologyResultSchema),
    otherLanguages: z.array(z.string()),
    otherScripts: z.array(scriptTarget).optional(),
    spellings: z
      .array(
        scriptTarget.and(
          z.object({
            kind: z.enum(['spelling', 'misspelling']),
            sourceUrl: z.url(),
            revisionId: z.union([z.number(), z.string()]).optional(),
            verifiedAt: z.iso.datetime(),
          })
        )
      )
      .optional(),
    tracedAt: z.iso.datetime(),
    freshnessAt: z.iso.datetime().optional(),
    revision: z.number().int().nonnegative(),
    attemptedLanguages: z.array(z.enum(SUPPORTED_LANGUAGE_CODES)).optional(),
    failedLanguages: z
      .partialRecord(
        z.enum(SUPPORTED_LANGUAGE_CODES),
        z.object({
          kind: z.enum(['validation', 'transient', 'unavailable']),
          message: z.string(),
          retryAt: z.iso.datetime(),
        })
      )
      .optional(),
    researchIncomplete: z.boolean().optional(),
    incomplete: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((entry, context) => {
    if (
      new Set(entry.languages).size !== entry.languages.length ||
      entry.languages.some(
        (language) =>
          entry.entries[language]?.language !== language ||
          entry.entries[language]?.word !== entry.word
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Each unique language must identify an entry for this word',
      })
    }
  })
