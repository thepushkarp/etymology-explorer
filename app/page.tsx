import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ExploreExperience } from '@/components/ExploreExperience'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

interface HomePageProps {
  searchParams: Promise<{ q?: string | string[] }>
}

/**
 * Deep-linked searches (/?q=word) canonicalize to the crawlable /word/{word}
 * page so search engines index one URL per word; bare / keeps canonical /.
 */
export async function generateMetadata({ searchParams }: HomePageProps): Promise<Metadata> {
  const { q } = await searchParams
  const raw = Array.isArray(q) ? q[0] : q
  if (!raw) return { alternates: { canonical: '/' } }

  const word = canonicalizeWord(raw)
  if (!isValidWord(word)) return { alternates: { canonical: '/' } }

  return { alternates: { canonical: `/word/${encodeURIComponent(word)}` } }
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-cream">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-charcoal/20 border-t-charcoal" />
            <p className="font-serif italic text-charcoal-light">Loading the archive...</p>
          </div>
        </main>
      }
    >
      <ExploreExperience />
    </Suspense>
  )
}
