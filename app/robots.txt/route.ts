import { NextResponse } from 'next/server'
import { getRequestOrigin } from '@/lib/origin'

export async function GET() {
  const origin = await getRequestOrigin()

  const body = [
    'User-agent: *',
    'Allow: /',
    'Allow: /api/health',
    'Disallow: /api/',
    'Content-Signal: ai-train=no, search=yes, ai-input=no',
    `Sitemap: ${origin}/sitemap.xml`,
  ].join('\n')

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
