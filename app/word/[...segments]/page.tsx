import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { notFound, permanentRedirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { EntryView } from '@/components/EntryView'
import { WordTraceExperience } from '@/components/WordTraceExperience'
import {
  CACHE_VERSION,
  BETA_CACHE_VERSION,
  etymologyWordTag,
  getCachedEtymology,
} from '@/lib/cache'
import {
  LANGUAGES,
  isBetaLanguage,
  isLanguageCode,
  wordPagePath,
  type LanguageCode,
} from '@/lib/languages'
import { localizeResult, type ResultLocale } from '@/lib/resultLocalization'
import { SITE_SHORT_NAME } from '@/lib/site'
import type { EtymologyResult } from '@/lib/types'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

// Shareable word pages are served strictly from Redis. One catch-all route is
// required because Next.js cannot place /word/[word] beside
// /word/[language]/[word] with different dynamic parameter names. Keeping the
// variants in this module also makes the cache-only import invariant uniform.
export const revalidate = 86400

export function generateStaticParams(): Array<{ segments: string[] }> {
  return []
}

interface WordPageProps {
  params: Promise<{ segments: string[] }>
}

interface ResolvedWordRoute {
  language: LanguageCode
  word: string
}

const DESCRIPTION_MAX_CHARS = 155

function resolveWord(rawParam: string): string | null {
  try {
    const word = canonicalizeWord(decodeURIComponent(rawParam))
    return isValidWord(word) ? word : null
  } catch {
    return null
  }
}

async function resolveRoute(params: WordPageProps['params']): Promise<ResolvedWordRoute> {
  const { segments } = await params
  if (segments.length === 1) {
    const word = resolveWord(segments[0])
    if (!word) notFound()
    return { language: 'en', word }
  }

  if (segments.length !== 2) notFound()
  const language = segments[0].toLowerCase()
  const word = resolveWord(segments[1])
  if (!isLanguageCode(language) || !word) notFound()
  if (language === 'en') permanentRedirect(wordPagePath(word, 'en'))
  if (!isBetaLanguage(language)) notFound()
  return { language, word }
}

function loadCachedEtymology(word: string, language: LanguageCode) {
  const cacheKey =
    language === 'en'
      ? ['word-page-etymology', CACHE_VERSION, word]
      : ['multilingual-word-page-etymology', BETA_CACHE_VERSION, language, word]
  return unstable_cache(() => getCachedEtymology(word, language), cacheKey, {
    revalidate: 3600,
    tags: [etymologyWordTag(word, language)],
  })()
}

function truncateAtWordBoundary(text: string): string {
  if (text.length <= DESCRIPTION_MAX_CHARS) return text
  const cut = text.slice(0, DESCRIPTION_MAX_CHARS + 1)
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = (
    lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, DESCRIPTION_MAX_CHARS)
  ).replace(/[\s,;:.–—-]+$/, '')
  return `${trimmed}…`
}

function buildDescription(result: EtymologyResult, locale: ResultLocale): string {
  const display = localizeResult(result, locale)
  return truncateAtWordBoundary(
    [display.definition, display.lore].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  )
}

function resultMatchesLanguage(result: EtymologyResult | null, language: LanguageCode): boolean {
  if (!result) return false
  return language === 'en' ? (result.language ?? 'en') === 'en' : result.language === language
}

export async function generateMetadata({ params }: WordPageProps): Promise<Metadata> {
  const { language, word } = await resolveRoute(params)
  const isEnglish = language === 'en'
  const definition = LANGUAGES[language]
  const canonicalPath = wordPagePath(word, language)
  const title = isEnglish
    ? `Etymology of ${word} — ${SITE_SHORT_NAME}`
    : `${definition.englishName} etymology of ${word} — ${SITE_SHORT_NAME}`
  const result = await loadCachedEtymology(word, language)

  if (!resultMatchesLanguage(result, language)) {
    const description = isEnglish
      ? `The etymology of “${word}” has not been traced yet. Run a live trace on ${SITE_SHORT_NAME} to follow it back to its roots.`
      : `The ${definition.englishName} etymology of “${word}” has not been traced yet.`
    return {
      title: { absolute: title },
      description,
      robots: { index: false, follow: true },
      alternates: { canonical: canonicalPath },
    }
  }

  const description = buildDescription(result as EtymologyResult, isEnglish ? 'en' : 'local')
  const languageQuery = isEnglish ? '' : `&language=${language}`
  const ogImage = `/og?word=${encodeURIComponent(word)}${languageQuery}`
  const alt = isEnglish ? `Etymology of ${word}` : title

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
      images: [{ url: ogImage, width: 1200, height: 630, alt }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

export default async function WordPage({ params }: WordPageProps) {
  const { language, word } = await resolveRoute(params)
  const result = await loadCachedEtymology(word, language)

  if (!resultMatchesLanguage(result, language)) {
    return <WordTraceExperience key={`${language}:${word}`} word={word} language={language} />
  }

  return (
    <>
      <SiteHeader searchLanguage={language} />
      <main className="mx-auto w-full max-w-3xl px-4 pt-14 sm:px-6 sm:pt-20">
        <EntryView result={result as EtymologyResult} />
      </main>
      <SiteFooter />
    </>
  )
}
