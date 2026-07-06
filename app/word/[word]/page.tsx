import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EditorialPageFrame } from '@/components/EditorialPageFrame'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { WordPageEntry } from '@/components/WordPageEntry'
import { getCachedEtymology } from '@/lib/cache'
import { SITE_SHORT_NAME } from '@/lib/site'
import type { EtymologyResult } from '@/lib/types'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

// Shareable, crawlable word pages served STRICTLY from the Redis cache.
// This module's import graph must never include lib/research.ts or lib/llm.ts
// (enforced by app/word/import-graph.test.ts) so crawler traffic cannot
// trigger LLM spend. Cache misses render a noindex page with a live-trace CTA.
export const revalidate = 86400

// No build-time prerenders; paths are generated on demand and ISR-cached
export function generateStaticParams(): Array<{ word: string }> {
  return []
}

const DESCRIPTION_MAX_CHARS = 155

// Redis reads go through unstable_cache: the Upstash client issues no-store
// fetches, which would otherwise flip this ISR route to dynamic at runtime
// (app-static-to-dynamic-error). Entries revalidate daily alongside the page.
const loadCachedEtymology = unstable_cache(getCachedEtymology, ['word-page-etymology'], {
  revalidate: 86400,
})

interface WordPageProps {
  params: Promise<{ word: string }>
}

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
  const combined = [result.definition, result.lore]
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

function UntracedWordPage({ word }: { word: string }) {
  return (
    <EditorialPageFrame
      eyebrow="uncharted entry"
      title={word}
      subtitle="This word has not been traced in the archive yet. Its older forms and borrowed meanings are still waiting to be followed back."
    >
      <section className="mx-auto max-w-3xl">
        <div className="editorial-card flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-serif text-xl italic text-charcoal-light">no entry on file</p>
            <p className="mt-2 font-serif text-3xl tracking-[-0.03em] text-charcoal">
              Trace it live and watch the roots surface.
            </p>
          </div>
          <Link
            href={`/?q=${encodeURIComponent(word)}`}
            className="editorial-chip self-start font-serif italic sm:self-center"
          >
            Trace &ldquo;{word}&rdquo; live &rarr;
          </Link>
        </div>
      </section>
    </EditorialPageFrame>
  )
}

export default async function WordPage({ params }: WordPageProps) {
  const { word: rawWord } = await params
  const word = resolveWord(rawWord)
  if (!word) notFound()

  const result = await loadCachedEtymology(word)
  if (!result) {
    return <UntracedWordPage word={word} />
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
