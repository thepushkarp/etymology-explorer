import { NextResponse } from 'next/server'

const BASE_URL = 'https://etymology.thepushkarp.com'

const API_CATALOG = {
  linkset: [
    {
      anchor: `${BASE_URL}/api/etymology`,
      item: [
        {
          href: `${BASE_URL}/openapi.json`,
          rel: 'service-desc',
          type: 'application/openapi+json',
          title: 'OpenAPI Description',
        },
        {
          href: `${BASE_URL}/docs/api`,
          rel: 'service-doc',
          type: 'text/html',
          title: 'API Documentation',
        },
        {
          href: `${BASE_URL}/api/health`,
          rel: 'status',
          type: 'application/json',
          title: 'Health Endpoint',
        },
      ],
    },
  ],
} as const

export async function GET() {
  return new NextResponse(JSON.stringify(API_CATALOG, null, 2), {
    headers: {
      'Content-Type': 'application/linkset+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
