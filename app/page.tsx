import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { ExploreExperience } from '@/components/ExploreExperience'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

interface HomePageProps {
  searchParams: Promise<{ q?: string | string[] }>
}

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

/**
 * Bare / is the landing/search page. Legacy deep links (/?q=word) redirect
 * permanently to the canonical /word/{word} page, which hosts the full
 * search experience; old shared links keep working.
 */
export default async function Home({ searchParams }: HomePageProps) {
  const { q } = await searchParams
  const raw = Array.isArray(q) ? q[0] : q
  if (raw) {
    const word = canonicalizeWord(raw)
    if (isValidWord(word)) {
      permanentRedirect(`/word/${encodeURIComponent(word)}`)
    }
  }

  return <ExploreExperience />
}
