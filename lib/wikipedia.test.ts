import { afterEach, expect, test } from 'bun:test'
import { fetchWikipedia } from './wikipedia'
import { SUPPORTED_LANGUAGE_CODES } from './languages'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})
function fixture(title = 'Pomme de terre', extra = {}, queryExtra = {}) {
  return {
    query: {
      pages: [
        {
          ns: 0,
          title,
          extract: 'Introduction\n\nEtymology\nComplete history at the end.',
          revisions: [{ revid: 42 }],
          ...extra,
        },
      ],
      ...queryExtra,
    },
  }
}
function respond(data: unknown) {
  globalThis.fetch = (async (url: string | URL | Request) =>
    Response.json(
      String(url).includes('/pipeline') ? [{ result: null }] : data
    )) as unknown as typeof fetch
}

test('complete article text and revision metadata across all supported editions', async () => {
  for (const language of SUPPORTED_LANGUAGE_CODES) {
    let requested = ''
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes('/pipeline')) return Response.json([{ result: null }])
      requested = String(url)
      return Response.json(fixture())
    }) as unknown as typeof fetch
    const result = await fetchWikipedia('pomme de terre', undefined, language)
    expect(result?.text).toContain('Complete history at the end.')
    expect(result).toMatchObject({
      language,
      requestedWord: 'pomme de terre',
      resolvedWord: 'Pomme de terre',
      revisionId: 42,
    })
    expect(requested).toContain(`https://${language}.wikipedia.org/w/api.php?`)
    expect(new URL(requested).searchParams.has('exintro')).toBe(false)
  }
})

test('explicit redirects accepted but arbitrary changed titles rejected', async () => {
  respond(fixture('Plot armor', {}, { redirects: [{ from: 'plot armour', to: 'Plot armor' }] }))
  expect(await fetchWikipedia('plot armour')).toMatchObject({
    resolvedWord: 'Plot armor',
    variants: [{ relationship: 'redirect', word: 'Plot armor' }],
  })
  respond(fixture('Unrelated topic'))
  expect(await fetchWikipedia('plot armour')).toBeNull()
  respond(fixture('Plot armor', {}, { redirects: [{ from: 'unrelated', to: 'Plot armor' }] }))
  expect(await fetchWikipedia('plot armour')).toBeNull()
})

test('rejects disambiguation, topic qualifiers, fragment redirects and foreign canonical URLs', async () => {
  for (const data of [
    fixture('Pomme de terre', { pageprops: { disambiguation: '' } }),
    fixture('Pomme de terre', { fullurl: 'https://evil.test/wiki/Pomme_de_terre' }),
    fixture(
      'Pomme de terre (film)',
      {},
      { redirects: [{ from: 'pomme de terre', to: 'Pomme de terre (film)' }] }
    ),
    fixture(
      'Pomme de terre',
      {},
      { redirects: [{ from: 'pomme de terre', to: 'Pomme de terre', tofragment: 'History' }] }
    ),
  ]) {
    respond(data)
    expect(await fetchWikipedia('pomme de terre')).toBeNull()
  }
})

test('abort cancels before any network request', async () => {
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return Response.json(fixture())
  }) as unknown as typeof fetch
  await expect(fetchWikipedia('pomme de terre', AbortSignal.abort())).rejects.toThrow()
  expect(calls).toBe(0)
})
