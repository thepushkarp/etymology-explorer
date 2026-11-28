import { NextRequest, NextResponse } from 'next/server'
import { candidateLanguages, isLanguageCode, LANGUAGES, wordPagePath } from '@/lib/languages'
import { getCachedSpellingEntry } from '@/lib/cache'
import { checkRateLimits, type LimiterName } from '@/lib/rateLimit'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

// Proxy enforces coarse per-IP caps across API routes. Strict etymology caps
// (20/min + 200/day) run in app/api/etymology/route.ts only when a request
// misses cache and would trigger live source/LLM work.
function limitersFor(pathname: string): LimiterName[] {
  if (pathname === '/api/pronunciation') return ['pronunciation']
  return ['general']
}

/** Legacy /?q=word deep links (and the JSON-LD SearchAction) → canonical word page. */
export function legacySearchRedirect(url: URL): string | null {
  if (url.pathname !== '/') return null
  const raw = url.searchParams.get('q')
  if (!raw) return null
  const word = canonicalizeWord(raw)
  return isValidWord(word) ? wordPagePath(word) : null
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const redirectPath = request.method === 'GET' ? legacySearchRedirect(request.nextUrl) : null
  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.nextUrl), 308)
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    const segments = pathname.split('/').slice(1)
    const hint = segments.length === 3 ? segments[1].toLowerCase() : undefined
    if (segments[0] === 'word' && (segments.length === 2 || (hint && isLanguageCode(hint)))) {
      let word = ''
      try {
        word = canonicalizeWord(decodeURIComponent(segments.at(-1)!))
      } catch {
        // Invalid encoding is handled by the word page's not-found response.
      }
      if (isValidWord(word)) {
        const language = hint && isLanguageCode(hint) ? hint : undefined
        const candidates = candidateLanguages(word)
        const selected = language ?? (candidates.length === 1 ? candidates[0] : undefined)
        const alias =
          selected && LANGUAGES[selected].spellingIdentity
            ? await getCachedSpellingEntry(word, language)
            : null
        if (alias) {
          const destination = new URL(wordPagePath(alias.word, alias.language), request.nextUrl)
          destination.search = request.nextUrl.search
          const response = NextResponse.redirect(destination, 307)
          response.headers.set('Cache-Control', 'private, no-store')
          return response
        }
      }
    }
  }

  if (pathname.startsWith('/api/') && pathname !== '/api/health' && pathname !== '/api/changelog') {
    const blocked = await checkRateLimits(request, limitersFor(pathname))
    if (blocked) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(blocked.retryAfter) } }
      )
    }
  }

  const response = NextResponse.next()

  // CSP for every matched response (HTML pages and API alike).
  //
  // script-src uses 'unsafe-inline' rather than a hash or nonce because the
  // HTML pages are statically prerendered: Next.js bakes per-build
  // `self.__next_f.push(...)` inline flight scripts into the HTML, which
  // can't be hashed ahead of time, and nonces require dynamic rendering.
  // Adding a hash alongside 'unsafe-inline' would make CSP2+ browsers ignore
  // 'unsafe-inline' and break hydration. The policy still blocks scripts,
  // objects, and frames from external hosts.
  //
  // Vercel Analytics + Speed Insights load same-origin /_vercel/* scripts in
  // production (covered by 'self'); in dev they load debug scripts from
  // va.vercel-scripts.com, and the dev toolchain needs 'unsafe-eval' + ws:.
  const isDev = process.env.NODE_ENV === 'development'
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com"
    : "script-src 'self' 'unsafe-inline'"
  const connectSrc = isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'"
  const cspDirectives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https:",
    "media-src 'self'",
    connectSrc,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '))

  return response
}

export const config = {
  // All pages and API routes; skip Next internals and static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|fonts/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|json|woff2?)$).*)',
  ],
}
