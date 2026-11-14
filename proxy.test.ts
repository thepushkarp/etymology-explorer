import { describe, expect, spyOn, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { legacySearchRedirect, proxy } from './proxy'
import * as entryCache from './lib/cache'
import { etymologyResult } from './lib/testSupport/etymologyResult'

const redirect = (path: string) => legacySearchRedirect(new URL(path, 'https://etymex.com'))

test('known spelling pages redirect GET and HEAD without caching mutable identity', async () => {
  const result = etymologyResult({ word: '津波', language: 'ja' })
  const lookup = spyOn(entryCache, 'getCachedSpellingEntry').mockResolvedValue({
    word: result.word,
    language: 'ja',
    stale: false,
    entry: {
      word: result.word,
      languages: ['ja'],
      entries: { ja: result },
      otherLanguages: [],
      tracedAt: new Date().toISOString(),
      revision: 1,
    },
  })
  try {
    for (const method of ['GET', 'HEAD']) {
      const response = await proxy(new NextRequest('https://etymex.com/word/ja/つなみ', { method }))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        `https://etymex.com/word/ja/${encodeURIComponent('津波')}`
      )
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
    expect(lookup).toHaveBeenCalledWith('つなみ', 'ja')
    const selected = await proxy(
      new NextRequest('https://etymex.com/word/ja/つなみ?lookup=tsunami&history=first')
    )
    expect(selected.headers.get('location')).toBe(
      `https://etymex.com/word/ja/${encodeURIComponent('津波')}?lookup=tsunami&history=first`
    )
    lookup.mockClear()
    await proxy(new NextRequest('https://etymex.com/word/ja/%E0%A4%A'))
    await proxy(new NextRequest('https://etymex.com/word/unknown/つなみ'))
    await proxy(new NextRequest('https://etymex.com/word/en/hello'))
    await proxy(new NextRequest('https://etymex.com/word/hi/पानी'))
    expect(lookup).not.toHaveBeenCalled()
  } finally {
    lookup.mockRestore()
  }
})

describe('legacy /?q= redirect', () => {
  test('canonicalizes and encodes the word', () => {
    expect(redirect('/?q=nice')).toBe('/word/nice')
    expect(redirect('/?q=Red%20%20Herring')).toBe('/word/red%20herring')
    expect(redirect('/?q=%0Ared%20herring')).toBeNull()
    expect(redirect('/?q=%20%20CafÉ%20')).toBe(`/word/${encodeURIComponent('café')}`)
  })

  test('leaves bare /, invalid words, and other paths alone', () => {
    expect(redirect('/')).toBeNull()
    expect(redirect('/?q=not%20a%20word!!')).toBeNull()
    expect(redirect('/faq?q=nice')).toBeNull()
  })
})
