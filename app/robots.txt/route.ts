import { NextResponse } from 'next/server'
import { SITE_ORIGIN } from '@/lib/site'

// Content-Signal: search engines and AI answer engines may index and cite the
// pages (search, ai-input); training on them is opted out (ai-train). The
// sitemap uses the canonical origin, never the request host, so a request via
// www or a legacy domain can't advertise a non-canonical sitemap.
export function GET() {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Content-Signal: ai-train=no, search=yes, ai-input=yes',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
  ].join('\n')

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
