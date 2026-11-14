import { describe, expect, mock, test } from 'bun:test'
import type { EtymologyResult, WordEntry } from '@/lib/types'
import type { LanguageCode } from '@/lib/languages'
import { etymologyResult } from '@/lib/testSupport/etymologyResult'

let cachedEntry: { entry: WordEntry; stale: boolean } | null = null

mock.module('@/lib/cache', () => ({
  ENTRY_PREFIX: 'entry:test:',
  getCachedEntry: async () => cachedEntry,
  etymologyWordTag: (word: string) => word,
}))

// unstable_cache needs Next's incremental cache runtime; pass functions through
mock.module('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

const { default: WordPage, generateMetadata } = await import('./[...segments]/page')

const fixture: EtymologyResult = etymologyResult({
  word: 'perfidious',
  pronunciation: '/pərˈfɪdiəs/',
  definition: 'Deceitful and untrustworthy; treacherous in matters of faith.',
  roots: [
    {
      root: 'fides',
      origin: 'Latin',
      meaning: 'faith, trust',
      relatedWords: ['fidelity', 'confide'],
    },
  ],
  ancestryGraph: { branches: [] },
  lore: 'Perfidious walked out of Latin per fidem decipere — to deceive through trust — and has named betrayers of promises ever since, from Roman rhetoric to the diplomatic insult perfidious Albion.',
  sources: [
    { name: 'etymonline', url: 'https://www.etymonline.com/word/perfidious', word: 'perfidious' },
  ],
})

function entryFor(results: EtymologyResult[], stale = false) {
  return {
    entry: {
      word: results[0].word,
      languages: results.map((result) => result.language),
      entries: Object.fromEntries(results.map((result) => [result.language, result])),
      otherLanguages: [],
      tracedAt: '2026-11-10T00:00:00.000Z',
      revision: 1,
      attemptedLanguages: results.map((result) => result.language),
    } satisfies WordEntry,
    stale,
  }
}

function paramsFor(word: string, language?: LanguageCode) {
  return {
    params: Promise.resolve({ segments: language ? [language, word] : [word] }),
    searchParams: Promise.resolve({}),
  }
}

describe('/word/[word] generateMetadata', () => {
  test('uncached English and other-language phrases have canonical noindex pages', async () => {
    cachedEntry = null
    const english = await generateMetadata(paramsFor(' Red%20%20Herring '))
    expect(english.alternates?.canonical).toBe('/word/red%20herring')
    expect(english.robots).toEqual({ index: false, follow: true })
    const french = await generateMetadata({
      params: Promise.resolve({ segments: ['fr', 'Pomme%20de%20terre'] }),
    })
    expect(french.alternates?.canonical).toBe('/word/fr/pomme%20de%20terre')
    expect(french.robots).toEqual({ index: false, follow: true })
    await expect(generateMetadata(paramsFor('%0Ared%20herring'))).rejects.toThrow()
  })

  test('cache hit: indexable metadata with canonical, description, and word OG image', async () => {
    cachedEntry = entryFor([fixture])
    const metadata = await generateMetadata(paramsFor('perfidious'))

    expect(metadata.title).toEqual({ absolute: 'Etymology of perfidious — English — EtymEx' })
    expect(metadata.alternates?.canonical).toBe('/word/perfidious')
    expect(metadata.robots).toBeUndefined()

    expect(metadata.description).toStartWith('Deceitful and untrustworthy')
    expect(metadata.description).toEndWith('…')
    expect(metadata.description?.length).toBeLessThanOrEqual(156)

    expect(metadata.openGraph?.images).toEqual([
      {
        url: '/og?word=perfidious',
        width: 1200,
        height: 630,
        alt: 'Etymology of perfidious',
      },
    ])
    const twitter = metadata.twitter as { card?: string; images?: unknown } | undefined
    expect(twitter?.card).toBe('summary_large_image')
    expect(twitter?.images).toEqual(['/og?word=perfidious'])
  })

  test('cache hit: canonicalizes mixed-case and percent-encoded params', async () => {
    cachedEntry = entryFor([fixture])
    const metadata = await generateMetadata(paramsFor('Caf%C3%89'))

    expect(metadata.alternates?.canonical).toBe(`/word/${encodeURIComponent('café')}`)
    expect(metadata.title).toEqual({ absolute: 'Etymology of café — English — EtymEx' })
  })

  test('cache miss: noindex metadata with live-trace description', async () => {
    cachedEntry = null
    const metadata = await generateMetadata(paramsFor('zymurgology'))

    expect(metadata.robots).toEqual({ index: false, follow: true })
    expect(metadata.alternates?.canonical).toBe('/word/zymurgology')
    expect(metadata.title).toEqual({ absolute: 'Etymology of zymurgology — EtymEx' })
    expect(metadata.description).toContain('has not been traced yet')
    expect(metadata.openGraph).toBeUndefined()
  })

  test('merged primary page uses the primary language and lists every available language', async () => {
    const french = etymologyResult({ word: 'chat', language: 'fr', definition: 'A cat.' })
    const italian = etymologyResult({ word: 'chat', language: 'it', definition: 'An online chat.' })
    cachedEntry = entryFor([french, italian], true)
    const metadata = await generateMetadata(paramsFor('chat'))
    expect(metadata.title).toEqual({ absolute: 'Etymology of chat — French, Italian — EtymEx' })
    expect(metadata.description).toStartWith('A cat.')
    expect(metadata.robots).toBeUndefined()
    const page = await WordPage(paramsFor('chat'))
    const main = page.props.children[1]
    expect(main.props.children.props).toMatchObject({
      entry: cachedEntry.entry,
      language: 'fr',
      stale: true,
    })
  })

  test('secondary language remains self-canonical and names its language in metadata and OG', async () => {
    cachedEntry = entryFor([
      etymologyResult({ word: 'chat' }),
      etymologyResult({ word: 'chat', language: 'fr', definition: 'A cat.' }),
    ])
    const metadata = await generateMetadata(paramsFor('chat', 'fr'))
    expect(metadata.title).toEqual({ absolute: 'French etymology of chat — EtymEx' })
    expect(metadata.alternates?.canonical).toBe('/word/fr/chat')
    expect(metadata.openGraph?.images).toEqual([
      {
        url: '/og?word=chat&language=fr',
        width: 1200,
        height: 630,
        alt: 'French etymology of chat',
      },
    ])
  })

  test('explicit language routes keep their identity when the primary language changes', async () => {
    const italian = etymologyResult({ word: 'sale', language: 'it', definition: 'Salt.' })
    const english = etymologyResult({ word: 'sale', language: 'en', definition: 'A transaction.' })
    for (const results of [[italian], [english, italian]]) {
      cachedEntry = entryFor(results)
      const metadata = await generateMetadata(paramsFor('sale', 'it'))
      expect(metadata.alternates?.canonical).toBe('/word/it/sale')
      expect(metadata.title).toEqual({ absolute: 'Italian etymology of sale — EtymEx' })
      const page = await WordPage(paramsFor('sale', 'it'))
      expect(page.props.children[1].props.children.props.language).toBe('it')
    }
    cachedEntry = null
    const metadata = await generateMetadata(paramsFor('chat', 'en'))
    expect(metadata.alternates?.canonical).toBe('/word/en/chat')
    expect(metadata.robots).toEqual({ index: false, follow: true })
  })

  test('missing requested languages retain cached siblings for the noindex trace experience', async () => {
    cachedEntry = entryFor([etymologyResult({ word: 'chat', language: 'fr' })], true)
    const metadata = await generateMetadata(paramsFor('chat', 'en'))
    expect(metadata.alternates?.canonical).toBe('/word/en/chat')
    expect(metadata.robots).toEqual({ index: false, follow: true })
    const page = await WordPage(paramsFor('chat', 'en'))
    expect(page.props).toMatchObject({
      word: 'chat',
      language: 'en',
      initialEntry: cachedEntry.entry,
      stale: true,
    })
  })

  test('invalid word: rejects via notFound', async () => {
    cachedEntry = null
    await expect(generateMetadata(paramsFor('not%20a%20word%21%21'))).rejects.toThrow()
  })

  test('malformed percent-encoding: rejects via notFound', async () => {
    cachedEntry = null
    await expect(generateMetadata(paramsFor('%E0%A4%A'))).rejects.toThrow()
  })
})
