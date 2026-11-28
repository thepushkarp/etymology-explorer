import type { Metadata } from 'next'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { CONFIG } from '@/lib/config'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { EntryView } from '@/components/EntryView'
import { WordTraceExperience } from '@/components/WordTraceExperience'
import {
  ENTRY_PREFIX,
  entryIsStale,
  etymologyWordTag,
  filterFreshSpellings,
  getCachedEntry,
} from '@/lib/cache'
import { LANGUAGES, isLanguageCode, wordPagePath, type LanguageCode } from '@/lib/languages'
import { historyEntry } from '@/lib/resultHistories'
import { entryPagePath, selectionForWordPath } from '@/lib/entrySelection'
import { getLookupGroup } from '@/lib/lookupGroupCache'
import { isKanaWord, lookupGroupForWord } from '@/lib/lookupGroups'
import { entryNavigation } from '@/lib/entryNavigation'
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
// Only validated hits enter the 24h Next.js Data Cache (invalidated immediately
// via revalidateTag on writes); misses and transient Redis errors bypass Data Cache
// so an outage can never freeze a word as noindex. Staleness and spelling-proof
// freshness are evaluated dynamically on every read.
const CACHE_MISS = Symbol('word-page-cache-miss')

const loadCachedEntryData = cache(async (word: string) => {
  try {
    return await unstable_cache(
      async () => {
        const result = await getCachedEntry(word)
        if (!result) throw CACHE_MISS
        return result.entry
      },
      ['word-page-entry', ENTRY_PREFIX, String(CONFIG.pipelineRevision), word],
      {
        revalidate: CONFIG.wordPageCacheTTL,
        tags: [etymologyWordTag(word)],
      }
    )()
  } catch (error) {
    if (error === CACHE_MISS) return null
    throw error
  }
})

const loadCachedEntry = cache(async (word: string) => {
  const raw = await loadCachedEntryData(word)
  if (!raw) return null
  const entry = filterFreshSpellings(raw)
  return { entry, stale: entryIsStale(entry) }
})

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
  const [resolvedParams, rawSearchParams] = await Promise.all([params, searchParams])
  const route = await resolveRoute(Promise.resolve(resolvedParams))
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (typeof value === 'string') query.set(key, value)
    else if (value) for (const item of value) query.append(key, item)
  }
  const selection = selectionForWordPath(query, decodeURIComponent(resolvedParams.segments.at(-1)!))
  const { language, word } = route
  const [cached, externalGroup] = await Promise.all([
    loadCachedEntry(word),
    selection.lookup && selection.lookup !== word
      ? getLookupGroup(selection.lookup)
      : Promise.resolve(undefined),
  ])
  const selectedLanguage = language ?? cached?.entry.languages[0]
  const result = selectedLanguage ? cached?.entry.entries[selectedLanguage] : undefined
  const rawLookupGroup =
    selection.lookup && selection.lookup !== word
      ? externalGroup
      : cached?.entry || isKanaWord(word)
        ? await getLookupGroup(
            selection.lookup ?? word,
            selection.lookup ? undefined : cached?.entry
          )
        : undefined
  const lookupGroup = lookupGroupForWord(word, rawLookupGroup)
  const first = selectedLanguage
    ? entryNavigation({
        word,
        language: selectedLanguage,
        entry: cached?.entry,
        group: lookupGroup,
        selection,
      }).defaultTarget
    : undefined
  if (first) {
    redirect(
      entryPagePath(first.word, first.language, {
        // The destination must consume intent for the original searched spelling.
        lookup: selection.lookup ?? word,
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
      <SiteHeader showSearch />
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
