/**
 * JSON Schema for the etymology synthesis LLM call, sent to OpenRouter's
 * Responses API as `text.format = { type: 'json_schema', strict: true }`.
 *
 * Strict-mode structure rules:
 * - every property is listed in `required`; optionality is expressed as a
 *   union with null (stripNullsDeep converts nulls back to absent fields
 *   before Zod validation)
 * - `additionalProperties: false` on every object node
 * - top-level properties are declared in RENDER ORDER (word → sources):
 *   strict structured outputs emit keys in schema order, which the streaming
 *   section scanner and progressive rendering rely on
 *
 * Kept in sync with the Zod cache schema (lib/schemas/etymology.ts) by a
 * mechanical cross-check in lib/schemas/llm-schema.test.ts — key sets,
 * required lists, and null-unions fail the suite on drift.
 *
 * The schema is billed as input tokens on every synthesis call, so
 * descriptions are deliberately terse and only cover what the system
 * prompt's content rules (lib/prompts.ts) don't already say.
 */

const ANCESTRY_STAGE_SCHEMA = {
  type: 'object',
  properties: {
    stage: {
      type: 'string',
      description: 'Language/period, e.g. "Ancient Greek"',
    },
    form: {
      type: 'string',
      description: 'Form at this stage, native script when it exists, e.g. "tēle (τῆλε)"',
    },
    note: {
      type: 'string',
      description: 'Brief meaning/context note',
    },
  },
  required: ['stage', 'form', 'note'],
  additionalProperties: false,
} as const

export const ETYMOLOGY_LLM_SCHEMA = {
  type: 'object',
  properties: {
    word: { type: 'string' },
    pronunciation: { type: 'string', description: 'IPA, e.g. /pərˈfɪdiəs/' },
    definition: { type: 'string', description: 'Brief 5-10 word definition' },
    ancestryGraph: {
      type: 'object',
      properties: {
        branches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              root: { type: 'string' },
              stages: {
                type: 'array',
                items: ANCESTRY_STAGE_SCHEMA,
                description: 'Oldest first',
              },
            },
            required: ['root', 'stages'],
            additionalProperties: false,
          },
        },
        convergencePoints: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            properties: {
              pieRoot: { type: 'string' },
              meaning: { type: 'string' },
              branchIndices: {
                type: 'array',
                items: { type: 'integer' },
                description: 'Indices of branches sharing this ancestor',
              },
            },
            required: ['pieRoot', 'meaning', 'branchIndices'],
            additionalProperties: false,
          },
        },
        mergePoint: {
          type: ['object', 'null'],
          description: 'Compound words only; null for single-root words',
          properties: {
            form: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['form', 'note'],
          additionalProperties: false,
        },
        postMerge: {
          type: ['array', 'null'],
          items: ANCESTRY_STAGE_SCHEMA,
        },
      },
      required: ['branches', 'convergencePoints', 'mergePoint', 'postMerge'],
      additionalProperties: false,
    },
    roots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          root: { type: 'string' },
          origin: { type: 'string', description: 'Language of origin' },
          meaning: { type: 'string' },
          relatedWords: { type: 'array', items: { type: 'string' } },
          ancestorRoots: {
            type: ['array', 'null'],
            items: { type: 'string' },
            description: 'Older forms (PIE roots); null when unknown',
          },
          descendantWords: {
            type: ['array', 'null'],
            items: { type: 'string' },
            description: 'Modern derivatives in other languages; null when not notable',
          },
        },
        required: ['root', 'origin', 'meaning', 'relatedWords', 'ancestorRoots', 'descendantWords'],
        additionalProperties: false,
      },
    },
    lore: { type: 'string' },
    partsOfSpeech: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pos: {
            type: 'string',
            enum: [
              'noun',
              'verb',
              'adjective',
              'adverb',
              'preposition',
              'conjunction',
              'pronoun',
              'interjection',
              'determiner',
            ],
          },
          definition: { type: 'string' },
          pronunciation: {
            type: ['string', 'null'],
            description: 'IPA only when it differs per POS; else null',
          },
        },
        required: ['pos', 'definition', 'pronunciation'],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: 'object',
      properties: {
        synonyms: { type: 'array', items: { type: 'string' }, description: '2-4 words' },
        antonyms: { type: 'array', items: { type: 'string' }, description: '1-3 words' },
        homophones: { type: 'array', items: { type: 'string' } },
        easilyConfusedWith: { type: 'array', items: { type: 'string' } },
        seeAlso: { type: 'array', items: { type: 'string' }, description: '2-4 words' },
      },
      required: ['synonyms', 'antonyms', 'homophones', 'easilyConfusedWith', 'seeAlso'],
      additionalProperties: false,
    },
    modernUsage: {
      type: 'object',
      properties: {
        hasSlangMeaning: { type: 'boolean' },
        slangDefinition: { type: ['string', 'null'] },
        popularizedBy: { type: ['string', 'null'] },
        contexts: {
          type: ['array', 'null'],
          items: { type: 'string' },
          description: 'e.g. "gaming", "Gen Z slang"',
        },
        notableReferences: { type: ['array', 'null'], items: { type: 'string' } },
      },
      required: [
        'hasSlangMeaning',
        'slangDefinition',
        'popularizedBy',
        'contexts',
        'notableReferences',
      ],
      additionalProperties: false,
    },
    sources: {
      type: 'array',
      description: 'Source databases that contributed evidence',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: [
              'etymonline',
              'wiktionary',
              'freeDictionary',
              'urbanDictionary',
              'incelsWiki',
              'synthesized',
            ],
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  required: [
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
  ],
  additionalProperties: false,
} as const

const TRANSLATABLE_TEXT_KEYS = new Set([
  'label',
  'definition',
  'meaning',
  'note',
  'lore',
  'slangDefinition',
  'popularizedBy',
])
const TRANSLATABLE_TEXT_ARRAY_KEYS = new Set(['contexts', 'notableReferences'])

function bilingualTextSchema(nullable: boolean) {
  return {
    type: nullable ? (['object', 'null'] as const) : 'object',
    properties: {
      en: { type: 'string' },
      local: { type: 'string' },
    },
    required: ['en', 'local'],
    additionalProperties: false,
  }
}

function betaNode(value: unknown, key?: string): unknown {
  if (!value || typeof value !== 'object') return value

  const node = value as Record<string, unknown>
  if (key && TRANSLATABLE_TEXT_KEYS.has(key)) {
    const type = node.type
    const nullable = Array.isArray(type) && type.includes('null')
    return bilingualTextSchema(nullable)
  }

  if (key && TRANSLATABLE_TEXT_ARRAY_KEYS.has(key)) {
    const type = node.type
    const nullable = Array.isArray(type) && type.includes('null')
    return {
      ...node,
      type: nullable ? ['array', 'null'] : 'array',
      items: bilingualTextSchema(false),
    }
  }

  if (Array.isArray(value)) return value.map((entry) => betaNode(entry))

  const mapped: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(node)) {
    if (childKey === 'properties' && childValue && typeof childValue === 'object') {
      mapped[childKey] = Object.fromEntries(
        Object.entries(childValue as Record<string, unknown>).map(([property, schema]) => [
          property,
          betaNode(schema, property),
        ])
      )
    } else {
      mapped[childKey] = betaNode(childValue)
    }
  }
  return mapped
}

/** Strict bilingual schema. Facts stay scalar; every prose leaf is an en/local pair. */
export const BETA_ETYMOLOGY_LLM_SCHEMA = (() => {
  const schema = betaNode(ETYMOLOGY_LLM_SCHEMA) as Record<string, unknown>
  const properties = schema.properties as Record<string, unknown>
  const sources = properties.sources as {
    items: { properties: { name: { enum: string[] } } }
  }

  sources.items.properties.name.enum = [
    'wiktionaryEnglish',
    'wiktionaryNative',
    'wikidataLexeme',
    'multilingualDictionary',
    'dicionarioAberto',
    'synthesized',
  ]

  const history = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      label: bilingualTextSchema(false),
      entryKind: { type: 'string', enum: ['lemma', 'form', 'unresolved'] },
      queryNodeId: { type: 'string' },
      lemmaNodeId: { type: 'string' },
      formOf: {
        type: ['object', 'null'],
        properties: {
          word: { type: 'string' },
          language: { type: 'string' },
        },
        required: ['word', 'language'],
        additionalProperties: false,
      },
      evidenceScopeIds: { type: 'array', items: { type: 'string' } },
      pronunciation: properties.pronunciation,
      definition: properties.definition,
      ancestryGraph: properties.ancestryGraph,
      roots: properties.roots,
      lore: properties.lore,
      partsOfSpeech: properties.partsOfSpeech,
    },
    required: [
      'id',
      'label',
      'entryKind',
      'queryNodeId',
      'lemmaNodeId',
      'formOf',
      'evidenceScopeIds',
      'pronunciation',
      'definition',
      'ancestryGraph',
      'roots',
      'lore',
      'partsOfSpeech',
    ],
    additionalProperties: false,
  }

  schema.properties = {
    language: { type: 'string', enum: ['it', 'es', 'fr', 'pt'] },
    word: properties.word,
    primaryHistoryId: { type: 'string' },
    histories: { type: 'array', minItems: 1, maxItems: 4, items: history },
    pronunciation: properties.pronunciation,
    definition: properties.definition,
    ancestryGraph: properties.ancestryGraph,
    roots: properties.roots,
    lore: properties.lore,
    partsOfSpeech: properties.partsOfSpeech,
    suggestions: properties.suggestions,
    modernUsage: properties.modernUsage,
    sources: properties.sources,
  }
  schema.required = [
    'language',
    'word',
    'primaryHistoryId',
    'histories',
    'pronunciation',
    'definition',
    'ancestryGraph',
    'roots',
    'lore',
    'partsOfSpeech',
    'suggestions',
    'modernUsage',
    'sources',
  ]
  return schema
})()

/**
 * Convert the strict-mode null-union encoding back to the app's canonical
 * shape: object properties whose value is null are removed (recursively),
 * so downstream Zod optional fields validate as absent rather than null.
 * Null array ELEMENTS are left untouched — the schema never produces them,
 * and silently dropping one would mask a real malformation from Zod.
 */
export function stripNullsDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripNullsDeep(item)) as unknown as T
  }

  if (value !== null && typeof value === 'object') {
    const stripped: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === null) {
        continue
      }
      stripped[key] = stripNullsDeep(entry)
    }
    return stripped as T
  }

  return value
}
