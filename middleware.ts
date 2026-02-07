import { NextResponse } from 'next/server'
import { FEATURE_FLAGS } from '@/lib/config/guardrails'

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export function middleware() {
  const response = NextResponse.next()

  const cspReportOnly =
    process.env.CSP_REPORT_ONLY !== undefined
      ? process.env.CSP_REPORT_ONLY === 'true'
      : FEATURE_FLAGS.cspReportOnly

  if (cspReportOnly) {
    response.headers.set('Content-Security-Policy-Report-Only', CSP_POLICY)
  } else {
    response.headers.set('Content-Security-Policy', CSP_POLICY)
  }

  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
