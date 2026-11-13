import type { Metadata } from 'next'
import { CONFIG } from '@/lib/config'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { EntryView } from '@/components/EntryView'
import { WordTraceExperience } from '@/components/WordTraceExperience'
import { ENTRY_PREFIX, etymologyWordTag, getCachedEntry } from '@/lib/cache'
import { LANGUAGES, isLanguageCode, wordPagePath, type LanguageCode } from '@/lib/languages'
import { historyEntry } from '@/lib/resultHistories'
import { entryPagePath, parseEntrySelection } from '@/lib/entrySelection'
import { getLookupGroup } from '@/lib/lookupGroupCache'
import { SITE_SHORT_NAME } from '@/lib/site'
import type { EtymologyResult } from '@/lib/types'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

// Shareable word pages are served strictly from Redis. One catch-all route is
// required because Next.js cannot place /word/[word] beside
// /word/[language]/[word] with different dynamic parameter names. Keeping the
// variants in this module also makes the cache-only import invariant uniform.
interface WordPageProps {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

interface ResolvedWordRoute {
  language?: LanguageCode
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
    return { word }
  }

  if (segments.length !== 2) notFound()
  const language = segments[0].toLowerCase()
  const word = resolveWord(segments[1])
  if (!isLanguageCode(language) || !word) notFound()
  return { language, word }
}

// Metadata and page rendering share one in-flight read for every language route.
const loadCachedEntry = cache((word: string) =>
  unstable_cache(() => getCachedEntry(word), ['word-page-entry', ENTRY_PREFIX, word], {
    revalidate: CONFIG.incompleteEtymologyCacheTTL,
    tags: [etymologyWordTag(word)],
  })()
)

async function resolveEntry(params: WordPageProps['params']) {
  const route = await resolveRoute(params)
  const cached = await loadCachedEntry(route.word)
  const language = route.language ?? cached?.entry.languages[0]
  const result = language ? cached?.entry.entries[language] : undefined
  return { ...route, cached, selectedLanguage: language, result }
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

// Definitions are stored as lowercase fragments ("pleasant, kind, …"); without
// this the snippet runs the definition straight into the lore's first sentence.
function asSentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const capitalized = trimmed[0].toUpperCase() + trimmed.slice(1)
  return /[.!?…]$/.test(capitalized) ? capitalized : `${capitalized}.`
}

function buildDescription(result: EtymologyResult): string {
  const display = historyEntry(result)
  return truncateAtWordBoundary(
    [asSentence(display.definition), display.lore]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

export async function generateMetadata({
  params,
}: Pick<WordPageProps, 'params'>): Promise<Metadata> {
  const { language, word, cached, result } = await resolveEntry(params)
  const canonicalPath = wordPagePath(word, language)
  const languageNames = cached?.entry.languages.map((code) => LANGUAGES[code].englishName)
  const heading = language
    ? `${LANGUAGES[language].englishName} etymology of ${word}`
    : `Etymology of ${word}`
  const title = `${heading}${!language && languageNames?.length ? ` — ${languageNames.join(', ')}` : ''} — ${SITE_SHORT_NAME}`

  if (!result) {
    return {
      title: { absolute: title },
      description: `The ${language ? `${LANGUAGES[language].englishName} ` : ''}etymology of “${word}” has not been traced yet. Run a live trace on ${SITE_SHORT_NAME} to follow it back to its roots.`,
      robots: { index: false, follow: true },
      alternates: { canonical: canonicalPath },
    }
  }

  const description = buildDescription(result)
  const languageQuery = language ? `&language=${language}` : ''
  const ogImage = `/og?word=${encodeURIComponent(word)}${languageQuery}`

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
      images: [{ url: ogImage, width: 1200, height: 630, alt: heading }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

export default async function WordPage({ params, searchParams }: WordPageProps) {
  const { language, word, cached, selectedLanguage, result } = await resolveEntry(params)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value)
    else if (value) for (const item of value) query.append(key, item)
  }
  const selection = parseEntrySelection(query)
  const candidateGroup = await getLookupGroup(
    selection.lookup ?? word,
    selection.lookup ? undefined : cached?.entry
  )
  const lookupGroup =
    candidateGroup &&
    [...candidateGroup.members, ...candidateGroup.languages].some((target) => target.word === word)
      ? candidateGroup
      : undefined
  const first = lookupGroup?.choices.find((choice) => choice.language === selectedLanguage)
  if (
    first &&
    first.word !== word &&
    !lookupGroup?.choices.some(
      (choice) => choice.word === word && choice.language === selectedLanguage
    )
  ) {
    redirect(
      entryPagePath(first.word, first.language, {
        lookup: lookupGroup?.reading,
        historyId: first.historyId,
      })
    )
  }

  if (!cached || !result || !selectedLanguage) {
    return (
      <WordTraceExperience
        key={`${language ?? 'auto'}:${word}`}
        word={word}
        language={language}
        initialEntry={cached?.entry}
        stale={cached?.stale}
        selection={selection}
        lookupGroup={lookupGroup}
      />
    )
  }

  return (
    <>
      <SiteHeader showSearch searchLanguage={language} />
      <main className="mx-auto w-full max-w-3xl px-4 pt-14 sm:px-6 sm:pt-20">
        <EntryView
          entry={cached.entry}
          language={selectedLanguage}
          stale={cached.stale}
          selection={selection}
          lookupGroup={lookupGroup}
        />
      </main>
      <SiteFooter />
    </>
  )
}
