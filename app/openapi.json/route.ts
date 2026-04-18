import { NextResponse } from 'next/server'

const OPENAPI_DOC = {
  openapi: '3.0.3',
  info: {
    title: 'Etymology Explorer API',
    version: '1.0.0',
    description: 'Public endpoints powering Etymology Explorer.',
  },
  servers: [{ url: 'https://etymology.thepushkarp.com' }],
  paths: {
    '/api/etymology': {
      get: {
        summary: 'Get etymology for a word',
        parameters: [
          { name: 'word', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'stream', in: 'query', required: false, schema: { type: 'boolean' } },
        ],
      },
    },
    '/api/suggestions': {
      get: {
        summary: 'Get suggestion words',
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
      },
    },
    '/api/random-word': {
      get: {
        summary: 'Get random word',
      },
    },
    '/api/pronunciation': {
      get: {
        summary: 'Get pronunciation data',
        parameters: [{ name: 'word', in: 'query', required: true, schema: { type: 'string' } }],
      },
    },
    '/api/ngram': {
      get: {
        summary: 'Get usage timeline data',
        parameters: [{ name: 'word', in: 'query', required: true, schema: { type: 'string' } }],
      },
    },
    '/api/health': {
      get: {
        summary: 'Service health check',
      },
    },
  },
} as const

export async function GET() {
  return NextResponse.json(OPENAPI_DOC)
}
