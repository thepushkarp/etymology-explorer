import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { WordPageEntry } from '@/components/WordPageEntry'
import { WordTraceExperience } from '@/components/WordTraceExperience'
import { etymologyWordTag, getCachedEtymology } from '@/lib/cache'
import { LANGUAGES, isBetaLanguage, isLanguageCode, type BetaLanguageCode } from '@/lib/languages'
import { localizeResult } from '@/lib/resultLocalization'
import { SITE_SHORT_NAME } from '@/lib/site'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

export const revalidate = 86400

export function generateStaticParams(): Array<{ language: string; word: string }> {
  return []
}

interface MultilingualWordPageProps {
  params: Promise<{ language: string; word: string }>
}

function resolveWord(rawParam: string): string | null {
  try {
    const word = canonicalizeWord(decodeURIComponent(rawParam))
    return isValidWord(word) ? word : null
  } catch {
    return null
  }
}

function loadCachedEtymology(word: string, language: BetaLanguageCode) {
  return unstable_cache(
    () => getCachedEtymology(word, language),
    ['multilingual-word-page-etymology', language, word],
    { revalidate: 3600, tags: [etymologyWordTag(word, language)] }
  )()
}

function truncate(text: string): string {
  if (text.length <= 155) return text
  return `${text.slice(0, 152).replace(/[\s,;:.–—-]+$/, '')}…`
}

async function resolveParams(params: MultilingualWordPageProps['params']) {
  const { language: rawLanguage, word: rawWord } = await params
  const language = rawLanguage.toLowerCase()
  const word = resolveWord(rawWord)
  if (!isLanguageCode(language) || !word) notFound()
  if (language === 'en') permanentRedirect(`/word/${encodeURIComponent(word)}`)
  if (!isBetaLanguage(language)) notFound()
  return { language, word }
}

export async function generateMetadata({ params }: MultilingualWordPageProps): Promise<Metadata> {
  const { language, word } = await resolveParams(params)
  const definition = LANGUAGES[language]
  const canonicalPath = `/word/${language}/${encodeURIComponent(word)}`
  const title = `${definition.englishName} etymology of ${word} — ${SITE_SHORT_NAME}`
  const result = await loadCachedEtymology(word, language)

  if (!result || result.language !== language) {
    return {
      title: { absolute: title },
      description: `The ${definition.englishName} etymology of “${word}” has not been traced yet.`,
      robots: { index: false, follow: true },
      alternates: { canonical: canonicalPath },
    }
  }

  const display = localizeResult(result, 'local')
  const description = truncate(`${display.definition} ${display.lore}`.replace(/\s+/g, ' '))
  const ogImage = `/og?word=${encodeURIComponent(word)}&language=${language}`
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

export default async function MultilingualWordPage({ params }: MultilingualWordPageProps) {
  const { language, word } = await resolveParams(params)
  const result = await loadCachedEtymology(word, language)
  if (!result || result.language !== language) {
    return <WordTraceExperience key={`${language}:${word}`} word={word} language={language} />
  }

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <SiteHeader compact />
      <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <Link
          href="/"
          className="editorial-link inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-charcoal-light/72"
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
