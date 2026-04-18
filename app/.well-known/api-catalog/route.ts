import { NextResponse } from 'next/server'
import { getRequestOrigin } from '@/lib/origin'

export async function GET() {
  const baseUrl = await getRequestOrigin()
  const apiCatalog = {
    linkset: [
      {
        anchor: `${baseUrl}/api/etymology`,
        'service-desc': [
          {
            href: `${baseUrl}/openapi.json`,
            type: 'application/openapi+json',
            title: 'OpenAPI Description',
          },
        ],
        'service-doc': [
          {
            href: `${baseUrl}/docs/api`,
            type: 'text/html',
            title: 'API Documentation',
          },
        ],
        status: [
          {
            href: `${baseUrl}/api/health`,
            type: 'application/json',
            title: 'Health Endpoint',
          },
        ],
      },
    ],
  } as const

  return new NextResponse(JSON.stringify(apiCatalog, null, 2), {
    headers: {
      'Content-Type':
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
