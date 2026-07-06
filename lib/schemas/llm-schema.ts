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
 */

const ANCESTRY_STAGE_SCHEMA = {
  type: 'object',
  properties: {
    stage: {
      type: 'string',
      description: 'Language/period: "Proto-Indo-European", "Ancient Greek", "Old French", etc.',
    },
    form: {
      type: 'string',
      description: 'Word form at this stage, with native script when it exists, e.g. "tēle (τῆλε)"',
    },
    note: {
      type: 'string',
      description: `Brief annotation about meaning/context, e.g. "meaning 'far, distant'"`,
    },
  },
  required: ['stage', 'form', 'note'],
  additionalProperties: false,
} as const

export const ETYMOLOGY_LLM_SCHEMA = {
  type: 'object',
  properties: {
    word: { type: 'string', description: 'The word being analyzed' },
    pronunciation: { type: 'string', description: 'IPA pronunciation, e.g. /pərˈfɪdiəs/' },
    definition: { type: 'string', description: 'Brief 5-10 word definition' },
    ancestryGraph: {
      type: 'object',
      description: 'Graph showing how roots evolved independently then merged',
      properties: {
        branches: {
          type: 'array',
          description: 'One branch per root: 2-4 interesting stages of independent evolution',
          items: {
            type: 'object',
            properties: {
              root: { type: 'string', description: 'The root this branch traces' },
              stages: {
                type: 'array',
                items: ANCESTRY_STAGE_SCHEMA,
                description: 'Evolution stages for this root, oldest first',
              },
            },
            required: ['root', 'stages'],
            additionalProperties: false,
          },
        },
        convergencePoints: {
          type: ['array', 'null'],
          description:
            'Only when branches share a PIE root already present in their stages; else null',
          items: {
            type: 'object',
            properties: {
              pieRoot: { type: 'string', description: 'The shared Proto-Indo-European root' },
              meaning: { type: 'string', description: 'What the PIE root meant' },
              branchIndices: {
                type: 'array',
                items: { type: 'integer' },
                description: 'Which branches (by index) share this ancestor',
              },
            },
            required: ['pieRoot', 'meaning', 'branchIndices'],
            additionalProperties: false,
          },
        },
        mergePoint: {
          type: ['object', 'null'],
          description: 'Where branches combine, compound words only — null for single-root words',
          properties: {
            form: { type: 'string', description: 'The combined form' },
            note: {
              type: 'string',
              description: `Context about the combination, e.g. "coined 1835, 'far-sound' device"`,
            },
          },
          required: ['form', 'note'],
          additionalProperties: false,
        },
        postMerge: {
          type: ['array', 'null'],
          items: ANCESTRY_STAGE_SCHEMA,
          description: 'Evolution after the merge; null when none',
        },
      },
      required: ['branches', 'convergencePoints', 'mergePoint', 'postMerge'],
      additionalProperties: false,
    },
    roots: {
      type: 'array',
      description:
        'ALL constituent roots: 1 for simple words, 2+ for compounds like telephone or autobiography',
      items: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Root morpheme' },
          origin: {
            type: 'string',
            description: 'Language of origin (Latin, Greek, Old English…)',
          },
          meaning: { type: 'string', description: 'What this root means' },
          relatedWords: {
            type: 'array',
            items: { type: 'string' },
            description: '3-8 GRE/TOEFL-level words sharing this root; never padded',
          },
          ancestorRoots: {
            type: ['array', 'null'],
            items: { type: 'string' },
            description: 'Older forms like PIE roots; null when unknown',
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
    lore: {
      type: 'string',
      description: '4-6 sentence revelatory narrative per the LORE rules in the instructions',
    },
    partsOfSpeech: {
      type: 'array',
      description: 'Definitions per grammatical category',
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
          definition: { type: 'string', description: 'Brief definition for this POS' },
          pronunciation: {
            type: ['string', 'null'],
            description: 'IPA only when it differs per POS (REcord vs reCORD); else null',
          },
        },
        required: ['pos', 'definition', 'pronunciation'],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: 'object',
      description: 'Related words for vocabulary building; every item is ONLY the bare word',
      properties: {
        synonyms: { type: 'array', items: { type: 'string' }, description: '2-4 words' },
        antonyms: { type: 'array', items: { type: 'string' }, description: '1-3 words' },
        homophones: { type: 'array', items: { type: 'string' }, description: 'Often empty' },
        easilyConfusedWith: {
          type: 'array',
          items: { type: 'string' },
          description: 'Commonly mistaken words',
        },
        seeAlso: {
          type: 'array',
          items: { type: 'string' },
          description: '2-4 related words worth exploring',
        },
      },
      required: ['synonyms', 'antonyms', 'homophones', 'easilyConfusedWith', 'seeAlso'],
      additionalProperties: false,
    },
    modernUsage: {
      type: 'object',
      description: 'Contemporary/slang usage; non-boolean fields are null unless hasSlangMeaning',
      properties: {
        hasSlangMeaning: {
          type: 'boolean',
          description: 'True ONLY with concrete source_data evidence of a modern slang meaning',
        },
        slangDefinition: { type: ['string', 'null'] },
        popularizedBy: { type: ['string', 'null'] },
        contexts: {
          type: ['array', 'null'],
          items: { type: 'string' },
          description: 'e.g. "gaming", "Gen Z slang"',
        },
        notableReferences: {
          type: ['array', 'null'],
          items: { type: 'string' },
          description: 'Famous uses in media/literature',
        },
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
      description: 'Which source databases actually contributed evidence',
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
