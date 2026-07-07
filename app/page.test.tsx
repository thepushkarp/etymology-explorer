import { describe, expect, test } from 'bun:test'
import Home, { metadata } from './page'

/**
 * Legacy /?q=word deep links must permanently redirect to the canonical
 * /word/{word} page; bare / stays the landing page with canonical /.
 */

function digestOf(error: unknown): string {
  return (error as { digest?: string }).digest ?? ''
}

async function renderHome(q?: string | string[]) {
  return Home({ searchParams: Promise.resolve(q === undefined ? {} : { q }) })
}

describe('/ redirect behavior', () => {
  test('/?q=word issues a permanent redirect to /word/{word}', async () => {
    let thrown: unknown = null
    try {
      await renderHome('nice')
    } catch (error) {
      thrown = error
    }

    expect(thrown).not.toBeNull()
    const digest = digestOf(thrown)
    expect(digest).toStartWith('NEXT_REDIRECT')
    expect(digest).toContain(';/word/nice;')
    expect(digest).toContain(';308;')
  })

  test('the redirect target is canonicalized and encoded', async () => {
    let thrown: unknown = null
    try {
      await renderHome('  CafÉ ')
    } catch (error) {
      thrown = error
    }

    expect(digestOf(thrown)).toContain(`;/word/${encodeURIComponent('café')};`)
  })

  test('array q uses the first value', async () => {
    let thrown: unknown = null
    try {
      await renderHome(['nice', 'villain'])
    } catch (error) {
      thrown = error
    }

    expect(digestOf(thrown)).toContain(';/word/nice;')
  })

  test('bare / renders the landing page', async () => {
    const element = await renderHome()
    expect(element).toBeTruthy()
  })

  test('invalid q falls through to the landing page instead of redirecting', async () => {
    const element = await renderHome('not a word!!')
    expect(element).toBeTruthy()
  })

  test('bare / keeps canonical /', () => {
    expect(metadata.alternates?.canonical).toBe('/')
  })
})
