import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { WordPageEntry } from '@/components/WordPageEntry'
import { WordTraceExperience } from '@/components/WordTraceExperience'
import { getCachedEtymology } from '@/lib/cache'
import { SITE_SHORT_NAME } from '@/lib/site'
import type { EtymologyResult } from '@/lib/types'
import { canonicalizeWord, isValidWord } from '@/lib/validation'
import { etymologyWordTag } from '@/lib/cache'
import { localizeResult } from '@/lib/resultLocalization'

// Shareable, crawlable word pages served STRICTLY from the Redis cache.
// This module's import graph must never include lib/research.ts or lib/llm.ts
// (enforced by app/word/import-graph.test.ts) so crawler traffic cannot
// trigger LLM spend. Cache misses render a noindex page whose live-trace UI
// (client-side, via /api/etymology) auto-starts only for in-app navigations;
// direct loads and crawlers must click "Trace it live" (lib/traceIntent.ts).
export const revalidate = 86400

// No build-time prerenders; paths are generated on demand and ISR-cached
export function generateStaticParams(): Array<{ word: string }> {
  return []
}

const DESCRIPTION_MAX_CHARS = 155

// Redis reads go through unstable_cache: the Upstash client issues no-store
// fetches, which would otherwise flip this ISR route to dynamic at runtime
// (app-static-to-dynamic-error). The data layer revalidates hourly so a
// cached miss doesn't compound with the 24h page ISR window once a word is
// traced live; the per-word tag lets the trace-write path call
// revalidateTag(`etymology-word:${word}`) to surface new entries immediately.
function loadCachedEtymology(word: string): Promise<EtymologyResult | null> {
  return unstable_cache(() => getCachedEtymology(word), ['word-page-etymology', word], {
    revalidate: 3600,
    tags: [etymologyWordTag(word, 'en')],
  })()
}

interface WordPageProps {
  params: Promise<{ word: string }>
}

// Next.js has changed whether dynamic params arrive percent-encoded across
// versions (vercel/next.js#54916), so decode defensively: decoding an
// already-decoded word is a no-op for every valid word ('%' never passes
// isValidWord), and malformed sequences 404 via the catch.
function resolveWord(rawParam: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(rawParam)
  } catch {
    return null
  }
  const word = canonicalizeWord(decoded)
  return isValidWord(word) ? word : null
}

function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars + 1)
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, maxChars)).replace(
    /[\s,;:.–—-]+$/,
    ''
  )
  return `${trimmed}…`
}

function buildWordDescription(result: EtymologyResult): string {
  const display = localizeResult(result, 'en')
  const combined = [display.definition, display.lore]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return truncateAtWordBoundary(combined, DESCRIPTION_MAX_CHARS)
}

export async function generateMetadata({ params }: WordPageProps): Promise<Metadata> {
  const { word: rawWord } = await params
  const word = resolveWord(rawWord)
  if (!word) notFound()

  const title = `Etymology of ${word} — ${SITE_SHORT_NAME}`
  const canonicalPath = `/word/${encodeURIComponent(word)}`
  const result = await loadCachedEtymology(word)

  if (!result) {
    return {
      title: { absolute: title },
      description: `The etymology of “${word}” has not been traced yet. Run a live trace on ${SITE_SHORT_NAME} to follow it back to its roots.`,
      robots: { index: false, follow: true },
      alternates: { canonical: canonicalPath },
    }
  }

  const description = buildWordDescription(result)
  const ogImage = `/og?word=${encodeURIComponent(word)}`

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: SITE_SHORT_NAME,
      type: 'article',
      images: [{ url: ogImage, width: 1200, height: 630, alt: `Etymology of ${word}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function WordPage({ params }: WordPageProps) {
  const { word: rawWord } = await params
  const word = resolveWord(rawWord)
  if (!word) notFound()

  const result = await loadCachedEtymology(word)
  if (!result) {
    // key={word} forces a fresh mount per word: without it, an in-app
    // navigation between two uncached words reuses this client instance
    // (same type + position), so startedRef and the stream reducer state
    // would persist — the new word would never trace and the prior result
    // would leak. The cached branch (WordPageEntry) is prop-driven and needs
    // no key.
    return <WordTraceExperience key={word} word={word} />
  }

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <SiteHeader compact />
      <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <Link
          href="/"
          className="editorial-link inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-charcoal-light/72 transition-colors hover:text-charcoal"
        >
          <span aria-hidden="true">&larr;</span>
          <span>Back to explorer</span>
        </Link>

        <div className="mt-8">
          <WordPageEntry result={result} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
