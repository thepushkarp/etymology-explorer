/**
 * JSON Schema for etymology result - used for structured outputs in LLM calls.
 *
 * NOTE: This schema must be kept in sync with the Zod schema in `lib/schemas/etymology.ts`.
 * Ideally, we would generate this from the Zod schema, but to avoid extra runtime dependencies
 * and bundle size, we maintain this explicitly for now.
 */

// Schema for a single ancestry stage
const ANCESTRY_STAGE_SCHEMA = {
  type: 'object',
  properties: {
    stage: { type: 'string', description: 'Language/period: PIE, Greek, Latin, etc.' },
    form: { type: 'string', description: 'The word form at this stage' },
    note: { type: 'string', description: 'Brief annotation about meaning/context' },
  },
  required: ['stage', 'form', 'note'],
  additionalProperties: false,
}

export const ETYMOLOGY_SCHEMA = {
  type: 'object',
  properties: {
    word: { type: 'string', description: 'The word being analyzed' },
    pronunciation: { type: 'string', description: 'IPA pronunciation' },
    definition: { type: 'string', description: 'Brief 5-10 word definition' },
    roots: {
      type: 'array',
      description:
        'All constituent roots (1 for simple words, 2+ for compounds like telephone, autobiography)',
      items: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Root morpheme' },
          origin: { type: 'string', description: 'Language of origin' },
          meaning: { type: 'string', description: 'What this root means' },
          relatedWords: {
            type: 'array',
            items: { type: 'string' },
            description: '6-8 GRE-level words sharing this root',
          },
          ancestorRoots: {
            type: 'array',
            items: { type: 'string' },
            description: 'Older forms like PIE roots',
          },
          descendantWords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Modern derivatives in other languages',
          },
        },
        required: ['root', 'origin', 'meaning', 'relatedWords'],
        additionalProperties: false,
      },
    },
    ancestryGraph: {
      type: 'object',
      description: 'Graph showing how roots evolved independently then merged',
      properties: {
        branches: {
          type: 'array',
          description: 'Independent evolution paths for each root',
          items: {
            type: 'object',
            properties: {
              root: { type: 'string', description: 'The root this branch traces' },
              stages: {
                type: 'array',
                items: ANCESTRY_STAGE_SCHEMA,
                description: 'Evolution stages for this root',
              },
            },
            required: ['root', 'stages'],
            additionalProperties: false,
          },
        },
        convergencePoints: {
          type: 'array',
          description: 'Where branches share deep PIE ancestors',
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
          type: 'object',
          description: 'Where branches combine (for compound words)',
          properties: {
            form: { type: 'string', description: 'The combined form' },
            note: { type: 'string', description: 'Context about the combination' },
          },
          required: ['form', 'note'],
          additionalProperties: false,
        },
        postMerge: {
          type: 'array',
          items: ANCESTRY_STAGE_SCHEMA,
          description: 'Evolution after merge (optional)',
        },
      },
      required: ['branches'],
      additionalProperties: false,
    },
    lore: {
      type: 'string',
      description:
        'Revelationary 4-6 sentence narrative with aha moments, not mechanical fact-listing',
    },
    sources: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of sources used',
    },
    partsOfSpeech: {
      type: 'array',
      description: 'Definitions per grammatical category (noun, verb, etc.)',
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
            description: 'Part of speech',
          },
          definition: { type: 'string', description: 'Definition for this POS' },
          pronunciation: {
            type: 'string',
            description: 'IPA pronunciation if different per POS (e.g., REcord vs reCORD)',
          },
        },
        required: ['pos', 'definition'],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: 'object',
      description: 'Related words for vocabulary building',
      properties: {
        synonyms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Words with similar meaning',
        },
        antonyms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Words with opposite meaning',
        },
        homophones: {
          type: 'array',
          items: { type: 'string' },
          description: 'Words that sound alike',
        },
        easilyConfusedWith: {
          type: 'array',
          items: { type: 'string' },
          description: 'Commonly confused words (e.g., affect/effect)',
        },
        seeAlso: {
          type: 'array',
          items: { type: 'string' },
          description: 'Other interesting related words',
        },
      },
      additionalProperties: false,
    },
    modernUsage: {
      type: 'object',
      description: 'Contemporary and slang usage context',
      properties: {
        hasSlangMeaning: { type: 'boolean', description: 'Whether word has modern slang meaning' },
        slangDefinition: { type: 'string', description: 'The slang/contemporary definition' },
        popularizedBy: { type: 'string', description: 'What popularized the modern usage' },
        contexts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Cultural contexts where slang is used',
        },
        notableReferences: {
          type: 'array',
          items: { type: 'string' },
          description: 'Famous uses in media/literature',
        },
      },
      required: ['hasSlangMeaning'],
      additionalProperties: false,
    },
  },
  required: ['word', 'pronunciation', 'definition', 'roots', 'ancestryGraph', 'lore', 'sources'],
  additionalProperties: false,
} as const
