import { describe, expect, mock, test } from 'bun:test'
import type { EtymologyResult } from '@/lib/types'

let cachedResult: EtymologyResult | null = null

mock.module('@/lib/cache', () => ({
  getCachedEtymology: async () => cachedResult,
}))

// unstable_cache needs Next's incremental cache runtime; pass functions through
mock.module('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

const { generateMetadata } = await import('./[word]/page')

const fixture: EtymologyResult = {
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
}

function paramsFor(word: string) {
  return { params: Promise.resolve({ word }) }
}

describe('/word/[word] generateMetadata', () => {
  test('cache hit: indexable metadata with canonical, description, and word OG image', async () => {
    cachedResult = fixture
    const metadata = await generateMetadata(paramsFor('perfidious'))

    expect(metadata.title).toEqual({ absolute: 'Etymology of perfidious — EtymEx' })
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
    cachedResult = fixture
    const metadata = await generateMetadata(paramsFor('Caf%C3%89'))

    expect(metadata.alternates?.canonical).toBe(`/word/${encodeURIComponent('café')}`)
    expect(metadata.title).toEqual({ absolute: 'Etymology of café — EtymEx' })
  })

  test('cache miss: noindex metadata with live-trace description', async () => {
    cachedResult = null
    const metadata = await generateMetadata(paramsFor('zymurgology'))

    expect(metadata.robots).toEqual({ index: false, follow: true })
    expect(metadata.alternates?.canonical).toBe('/word/zymurgology')
    expect(metadata.title).toEqual({ absolute: 'Etymology of zymurgology — EtymEx' })
    expect(metadata.description).toContain('has not been traced yet')
    expect(metadata.openGraph).toBeUndefined()
  })

  test('invalid word: rejects via notFound', async () => {
    cachedResult = null
    await expect(generateMetadata(paramsFor('not%20a%20word%21%21'))).rejects.toThrow()
  })

  test('malformed percent-encoding: rejects via notFound', async () => {
    cachedResult = null
    await expect(generateMetadata(paramsFor('%E0%A4%A'))).rejects.toThrow()
  })
})
