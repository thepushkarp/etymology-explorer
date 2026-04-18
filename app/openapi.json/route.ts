import { NextResponse } from 'next/server'
import { getRequestOrigin } from '@/lib/origin'

export async function GET() {
  const origin = await getRequestOrigin()

  const openApiDoc = {
    openapi: '3.0.3',
    info: {
      title: 'Etymology Explorer API',
      version: '1.0.0',
      description: 'Public endpoints powering Etymology Explorer.',
    },
    servers: [{ url: origin }],
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

  return new NextResponse(JSON.stringify(openApiDoc, null, 2), {
    headers: {
      'Content-Type': 'application/openapi+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
