import { NextResponse } from 'next/server'
import { getRequestOrigin } from '@/lib/origin'
import { SITE_SHORT_NAME } from '@/lib/site'

export async function GET() {
  const origin = await getRequestOrigin()

  const openApiDoc = {
    openapi: '3.0.3',
    info: {
      title: `${SITE_SHORT_NAME} API`,
      version: '1.2.0',
      description: `Public endpoints powering ${SITE_SHORT_NAME}.`,
    },
    servers: [{ url: origin }],
    paths: {
      '/api/etymology': {
        get: {
          summary: 'Get etymology for a word',
          parameters: [
            { name: 'word', in: 'query', required: true, schema: { type: 'string' } },
            {
              name: 'language',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['en', 'it', 'es', 'fr', 'pt'], default: 'en' },
            },
            { name: 'stream', in: 'query', required: false, schema: { type: 'boolean' } },
          ],
          responses: {
            '200': {
              description:
                'English returns scalar prose. Beta languages return paired prose and independently selectable lexical histories.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EtymologyApiResponse' },
                },
              },
            },
          },
        },
      },
      '/api/suggestions': {
        get: {
          summary: 'Get suggestion words',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            {
              name: 'language',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['en', 'it', 'es', 'fr', 'pt'], default: 'en' },
            },
          ],
        },
      },
      '/api/random-word': {
        get: {
          summary: 'Get random word',
          parameters: [
            {
              name: 'language',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['en', 'it', 'es', 'fr', 'pt'], default: 'en' },
            },
          ],
        },
      },
      '/api/pronunciation': {
        get: {
          summary: 'Get pronunciation data',
          parameters: [
            { name: 'word', in: 'query', required: true, schema: { type: 'string' } },
            {
              name: 'language',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['en', 'it', 'es', 'fr', 'pt'], default: 'en' },
            },
          ],
        },
      },
      '/api/ngram': {
        get: {
          summary: 'Get usage timeline data',
          parameters: [
            { name: 'word', in: 'query', required: true, schema: { type: 'string' } },
            {
              name: 'language',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['en', 'it', 'es', 'fr', 'pt'], default: 'en' },
            },
          ],
        },
      },
      '/api/health': {
        get: {
          summary: 'Service health check',
        },
      },
    },
    components: {
      schemas: {
        BilingualText: {
          type: 'object',
          required: ['en', 'local'],
          properties: {
            en: { type: 'string' },
            local: { type: 'string' },
          },
          additionalProperties: false,
        },
        LexemeRef: {
          type: 'object',
          required: ['word', 'language'],
          properties: {
            word: { type: 'string' },
            language: { type: 'string' },
          },
          additionalProperties: false,
        },
        LexicalHistory: {
          type: 'object',
          required: [
            'id',
            'label',
            'entryKind',
            'queryNodeId',
            'lemmaNodeId',
            'evidenceScopeIds',
            'pronunciation',
            'definition',
            'roots',
            'ancestryGraph',
            'lore',
          ],
          properties: {
            id: { type: 'string' },
            label: { $ref: '#/components/schemas/BilingualText' },
            entryKind: { type: 'string', enum: ['lemma', 'form', 'unresolved'] },
            queryNodeId: { type: 'string' },
            lemmaNodeId: { type: 'string' },
            formOf: { $ref: '#/components/schemas/LexemeRef' },
            evidenceScopeIds: { type: 'array', items: { type: 'string' } },
            pronunciation: { type: 'string' },
            definition: { $ref: '#/components/schemas/BilingualText' },
            roots: { type: 'array', items: { type: 'object' } },
            ancestryGraph: { type: 'object' },
            lore: { $ref: '#/components/schemas/BilingualText' },
            partsOfSpeech: { type: 'array', items: { type: 'object' } },
          },
          additionalProperties: false,
        },
        EnglishEtymologyResult: {
          type: 'object',
          required: [
            'language',
            'word',
            'pronunciation',
            'definition',
            'roots',
            'ancestryGraph',
            'lore',
          ],
          properties: {
            language: { type: 'string', enum: ['en'] },
            word: { type: 'string' },
            pronunciation: { type: 'string' },
            definition: { type: 'string' },
            roots: { type: 'array', items: { type: 'object' } },
            ancestryGraph: { type: 'object' },
            lore: { type: 'string' },
          },
          additionalProperties: true,
        },
        BetaEtymologyResult: {
          type: 'object',
          required: [
            'language',
            'word',
            'primaryHistoryId',
            'histories',
            'pronunciation',
            'definition',
            'roots',
            'ancestryGraph',
            'lore',
          ],
          properties: {
            language: { type: 'string', enum: ['it', 'es', 'fr', 'pt'] },
            word: { type: 'string' },
            primaryHistoryId: { type: 'string' },
            histories: {
              type: 'array',
              minItems: 1,
              maxItems: 4,
              items: { $ref: '#/components/schemas/LexicalHistory' },
            },
            pronunciation: { type: 'string' },
            definition: { $ref: '#/components/schemas/BilingualText' },
            roots: { type: 'array', items: { type: 'object' } },
            ancestryGraph: { type: 'object' },
            lore: { $ref: '#/components/schemas/BilingualText' },
          },
          additionalProperties: true,
        },
        EtymologyApiResponse: {
          type: 'object',
          required: ['success'],
          properties: {
            success: { type: 'boolean' },
            data: {
              oneOf: [
                { $ref: '#/components/schemas/EnglishEtymologyResult' },
                { $ref: '#/components/schemas/BetaEtymologyResult' },
              ],
            },
            error: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
  } as const

  return new NextResponse(JSON.stringify(openApiDoc, null, 2), {
    headers: {
      'Content-Type': 'application/openapi+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
