import { NextResponse } from 'next/server'

export async function GET() {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Content-Signal: ai-train=no, search=yes, ai-input=no',
    'Sitemap: https://etymology.thepushkarp.com/sitemap.xml',
  ].join('\n')

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
