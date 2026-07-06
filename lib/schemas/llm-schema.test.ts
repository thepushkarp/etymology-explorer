import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { ETYMOLOGY_LLM_SCHEMA, stripNullsDeep } from '@/lib/schemas/llm-schema'
import { EtymologyResultSchema } from '@/lib/schemas/etymology'

/**
 * Mechanical cross-check between the strict-mode JSON schema sent to the LLM
 * and the Zod schema that validates results. Walks both trees in parallel and
 * fails on drift, replacing the old "must stay in sync manually" footgun.
 *
 * Invariants:
 * - every object node: additionalProperties === false, required lists every key
 * - every LLM key exists in the Zod shape (no phantom fields)
 * - every Zod key exists in the LLM schema unless exempted below
 * - Zod-required keys are non-nullable in the LLM schema (a null would be
 *   stripped to absent and fail Zod validation)
 * - nullable LLM keys are optional in Zod (strip → absent must validate)
 * - leaf types are compatible (integer counts as number, enum as string)
 */

/**
 * Zod keys the LLM must NOT generate: enrichment fields assigned by
 * lib/etymologyEnricher.ts post-LLM, and source url/word filled in by
 * attachSources in lib/llm.ts from the actual research context.
 */
const POST_PROCESSING_ONLY_PATHS = new Set([
  'ancestryGraph.branches[].stages[].isReconstructed',
  'ancestryGraph.branches[].stages[].confidence',
  'ancestryGraph.branches[].stages[].evidence',
  'ancestryGraph.postMerge[].isReconstructed',
  'ancestryGraph.postMerge[].confidence',
  'ancestryGraph.postMerge[].evidence',
  'sources[].url',
  'sources[].word',
])

interface JsonSchemaNode {
  type?: string | readonly string[]
  properties?: Readonly<Record<string, JsonSchemaNode>>
  required?: readonly string[]
  items?: JsonSchemaNode
  additionalProperties?: boolean
  enum?: readonly string[]
}

function isNullable(node: JsonSchemaNode): boolean {
  return Array.isArray(node.type) && node.type.includes('null')
}

function baseType(node: JsonSchemaNode): string {
  if (Array.isArray(node.type)) {
    return node.type.filter((entry) => entry !== 'null')[0] ?? 'unknown'
  }
  return typeof node.type === 'string' ? node.type : 'unknown'
}

function unwrapOptional(schema: z.ZodType): { schema: z.ZodType; optional: boolean } {
  let optional = false
  let current = schema
  while (current instanceof z.ZodOptional) {
    optional = true
    current = current.unwrap() as z.ZodType
  }
  return { schema: current, optional }
}

function zodKind(schema: z.ZodType): string {
  if (schema instanceof z.ZodObject) return 'object'
  if (schema instanceof z.ZodArray) return 'array'
  if (schema instanceof z.ZodString) return 'string'
  if (schema instanceof z.ZodEnum) return 'enum'
  if (schema instanceof z.ZodBoolean) return 'boolean'
  if (schema instanceof z.ZodNumber) return 'number'
  return 'unsupported'
}

function leafCompatible(kind: string, llmType: string, llmNode: JsonSchemaNode): boolean {
  if (kind === llmType) return true
  if (kind === 'number' && llmType === 'integer') return true
  if (kind === 'enum' && llmType === 'string') return true
  if (kind === 'string' && llmType === 'string' && llmNode.enum) return true
  return false
}

function collectObjectDrift(
  zodSchema: z.ZodObject,
  llmNode: JsonSchemaNode,
  path: string,
  failures: string[]
): void {
  const label = path || '<root>'
  if (llmNode.additionalProperties !== false) {
    failures.push(`${label}: additionalProperties must be false for strict mode`)
  }

  const llmProperties = llmNode.properties ?? {}
  const llmKeys = Object.keys(llmProperties)
  const requiredKeys = new Set(llmNode.required ?? [])

  for (const key of llmKeys) {
    if (!requiredKeys.has(key)) {
      failures.push(`${label}.${key}: strict mode requires every property to be in "required"`)
    }
  }
  for (const key of requiredKeys) {
    if (!llmKeys.includes(key)) {
      failures.push(`${label}: "${key}" is required but has no property definition`)
    }
  }

  const zodShape = zodSchema.shape as Record<string, z.ZodType>
  for (const key of llmKeys) {
    if (!(key in zodShape)) {
      failures.push(`${label}.${key}: llm-schema key does not exist in the Zod schema`)
    }
  }

  for (const [key, zodValue] of Object.entries(zodShape)) {
    const childPath = path ? `${path}.${key}` : key
    const llmChild = llmProperties[key]
    const { schema: innerZod, optional } = unwrapOptional(zodValue)

    if (!llmChild) {
      if (!POST_PROCESSING_ONLY_PATHS.has(childPath)) {
        failures.push(
          `${childPath}: Zod key missing from llm-schema — add it (or exempt it as post-processing-only)`
        )
      }
      continue
    }

    if (POST_PROCESSING_ONLY_PATHS.has(childPath)) {
      failures.push(`${childPath}: post-processing-only field must not be in the llm-schema`)
    }

    if (!optional && isNullable(llmChild)) {
      failures.push(
        `${childPath}: nullable in llm-schema but required by Zod — stripNullsDeep would drop it`
      )
    }

    collectDrift(innerZod, llmChild, childPath, failures)
  }
}

function collectDrift(
  zodSchema: z.ZodType,
  llmNode: JsonSchemaNode,
  path: string,
  failures: string[]
): void {
  const { schema: zod } = unwrapOptional(zodSchema)
  const llmType = baseType(llmNode)
  const kind = zodKind(zod)
  const label = path || '<root>'

  if (kind === 'object') {
    if (llmType !== 'object') {
      failures.push(`${label}: Zod expects an object, llm-schema has "${llmType}"`)
      return
    }
    collectObjectDrift(zod as z.ZodObject, llmNode, path, failures)
    return
  }

  if (kind === 'array') {
    if (llmType !== 'array') {
      failures.push(`${label}: Zod expects an array, llm-schema has "${llmType}"`)
      return
    }
    if (!llmNode.items) {
      failures.push(`${label}: llm-schema array is missing "items"`)
      return
    }
    collectDrift((zod as z.ZodArray).element as z.ZodType, llmNode.items, `${path}[]`, failures)
    return
  }

  if (kind === 'unsupported') {
    failures.push(`${label}: schema-sync walker does not understand this Zod type — extend it`)
    return
  }

  if (!leafCompatible(kind, llmType, llmNode)) {
    failures.push(`${label}: Zod expects ${kind}, llm-schema has "${llmType}"`)
  }
}

function driftFailures(llmSchema: JsonSchemaNode): string[] {
  const failures: string[] = []
  collectDrift(EtymologyResultSchema as unknown as z.ZodType, llmSchema, '', failures)
  return failures
}

describe('ETYMOLOGY_LLM_SCHEMA sync with Zod schema', () => {
  test('llm-schema matches the Zod cache schema (no drift)', () => {
    expect(driftFailures(ETYMOLOGY_LLM_SCHEMA as JsonSchemaNode)).toEqual([])
  })

  test('top-level properties are declared in render order', () => {
    expect(Object.keys(ETYMOLOGY_LLM_SCHEMA.properties)).toEqual([
      'word',
      'pronunciation',
      'definition',
      'ancestryGraph',
      'roots',
      'lore',
      'partsOfSpeech',
      'suggestions',
      'modernUsage',
      'sources',
    ])
  })

  test('walker catches a dropped required property', () => {
    const mutated = structuredClone(ETYMOLOGY_LLM_SCHEMA) as unknown as {
      properties: Record<string, unknown>
      required: string[]
    }
    delete mutated.properties.lore
    mutated.required = mutated.required.filter((key) => key !== 'lore')

    const failures = driftFailures(mutated as JsonSchemaNode)
    expect(failures.some((failure) => failure.includes('lore'))).toBe(true)
  })

  test('walker catches a Zod-required field becoming nullable', () => {
    const mutated = structuredClone(ETYMOLOGY_LLM_SCHEMA) as unknown as {
      properties: { lore: { type: string | string[] } }
    }
    mutated.properties.lore.type = ['string', 'null']

    const failures = driftFailures(mutated as JsonSchemaNode)
    expect(failures.some((failure) => failure.includes('lore'))).toBe(true)
  })

  test('walker catches a phantom llm-schema key', () => {
    const mutated = structuredClone(ETYMOLOGY_LLM_SCHEMA) as unknown as {
      properties: Record<string, unknown>
      required: string[]
    }
    mutated.properties.hallucinated = { type: 'string' }
    mutated.required = [...mutated.required, 'hallucinated']

    const failures = driftFailures(mutated as JsonSchemaNode)
    expect(failures.some((failure) => failure.includes('hallucinated'))).toBe(true)
  })

  test('walker catches a post-processing field leaking into the llm-schema', () => {
    const mutated = structuredClone(ETYMOLOGY_LLM_SCHEMA) as unknown as {
      properties: {
        sources: { items: { properties: Record<string, unknown>; required: string[] } }
      }
    }
    mutated.properties.sources.items.properties.url = { type: ['string', 'null'] }
    mutated.properties.sources.items.required = ['name', 'url']

    const failures = driftFailures(mutated as JsonSchemaNode)
    expect(failures.some((failure) => failure.includes('sources[].url'))).toBe(true)
  })
})

describe('stripNullsDeep', () => {
  test('removes null object properties recursively', () => {
    const input = {
      word: 'telephone',
      ancestryGraph: {
        branches: [{ root: 'tele', stages: [] }],
        convergencePoints: null,
        mergePoint: null,
        postMerge: null,
      },
      modernUsage: {
        hasSlangMeaning: false,
        slangDefinition: null,
        popularizedBy: null,
        contexts: null,
        notableReferences: null,
      },
    }

    expect(stripNullsDeep(input)).toEqual({
      word: 'telephone',
      ancestryGraph: { branches: [{ root: 'tele', stages: [] }] },
      modernUsage: { hasSlangMeaning: false },
    } as unknown as typeof input)
  })

  test('recurses into arrays and strips nulls inside their objects', () => {
    const input = {
      roots: [
        { root: 'tele', ancestorRoots: null, descendantWords: ['télé'] },
        { root: 'phone', ancestorRoots: ['*bʰeh₂-'], descendantWords: null },
      ],
    }

    expect(stripNullsDeep(input)).toEqual({
      roots: [
        { root: 'tele', descendantWords: ['télé'] },
        { root: 'phone', ancestorRoots: ['*bʰeh₂-'] },
      ],
    } as unknown as typeof input)
  })

  test('leaves null array elements alone so Zod can reject real malformations', () => {
    expect(stripNullsDeep({ list: ['a', null, 'b'] })).toEqual({ list: ['a', null, 'b'] })
  })

  test('preserves primitives, empty containers, and falsy non-null values', () => {
    expect(stripNullsDeep('text')).toBe('text')
    expect(stripNullsDeep(0)).toBe(0)
    expect(stripNullsDeep(false)).toBe(false)
    expect(stripNullsDeep({ a: '', b: 0, c: false, d: [], e: {} })).toEqual({
      a: '',
      b: 0,
      c: false,
      d: [],
      e: {},
    })
  })

  test('a strict-mode shaped result validates against the Zod schema after stripping', () => {
    const llmShaped = {
      word: 'bread',
      pronunciation: '/brɛd/',
      definition: 'staple baked food',
      ancestryGraph: {
        branches: [
          {
            root: 'bread',
            stages: [{ stage: 'Old English', form: 'brēad', note: 'morsel, crumb' }],
          },
        ],
        convergencePoints: null,
        mergePoint: null,
        postMerge: null,
      },
      roots: [
        {
          root: 'bread',
          origin: 'Old English',
          meaning: 'piece of food',
          relatedWords: ['breadth'],
          ancestorRoots: null,
          descendantWords: null,
        },
      ],
      lore: 'A fixture lore line.',
      partsOfSpeech: [{ pos: 'noun', definition: 'baked food', pronunciation: null }],
      suggestions: {
        synonyms: ['loaf'],
        antonyms: [],
        homophones: ['bred'],
        easilyConfusedWith: [],
        seeAlso: ['dough'],
      },
      modernUsage: {
        hasSlangMeaning: false,
        slangDefinition: null,
        popularizedBy: null,
        contexts: null,
        notableReferences: null,
      },
      sources: [{ name: 'etymonline' }],
    }

    const stripped = stripNullsDeep(llmShaped)
    const parsed = EtymologyResultSchema.safeParse(stripped)
    expect(parsed.success).toBe(true)
  })
})
