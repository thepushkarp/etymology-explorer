import { afterEach, describe, expect, test } from 'bun:test'
import { fetchEtymonlineOutcome, parseRecoveredEtymonline } from './etymonline'
import { fetchIncelsWikiOutcome } from './incelsWiki'
import { SourceFetchBudget } from './sourceFetchBudget'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function sourceFetch(respond: (url: URL) => Response | Promise<Response>): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (!['www.etymonline.com', 'incels.wiki'].includes(url.hostname)) {
      const commands = JSON.parse(String(init?.body ?? '[]'))
      return Response.json(
        Array.isArray(commands[0]) ? commands.map(() => ({ result: null })) : { result: null }
      )
    }
    return respond(url)
  }) as typeof fetch
}

describe('source lookup outcomes', () => {
  test('distinguishes challenges, missing entries, no evidence and the shared budget', async () => {
    sourceFetch(
      () => new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge' } })
    )
    expect(await fetchEtymonlineOutcome('perfunctory')).toMatchObject({
      status: 'blocked',
      httpStatus: 403,
    })
    let attempts = 0
    sourceFetch(() => {
      attempts++
      return new Response('unexpected')
    })
    expect(
      await fetchEtymonlineOutcome('perfunctory', undefined, { skipDirect: true })
    ).toMatchObject({ status: 'blocked' })
    expect(attempts).toBe(0)
    expect(await new SourceFetchBudget(0).run(() => fetchEtymonlineOutcome('word'))).toMatchObject({
      status: 'budget_skipped',
    })
    sourceFetch(() =>
      Response.json({
        query: {
          pages: {
            '-1': {
              title: 'missing',
              missing: '',
              extract: 'This stale text must never admit a missing entry.',
            },
          },
        },
      })
    )
    expect(await fetchIncelsWikiOutcome('missing')).toEqual({ status: 'not_found' })
    sourceFetch(() => Response.json({ query: { pages: { '1': { title: 'word' } } } }))
    expect(await fetchIncelsWikiOutcome('word')).toMatchObject({ status: 'no_evidence' })
  })

  test('accepts source-reported redirect chains but never unrelated page titles', async () => {
    const response = {
      query: {
        normalized: [{ from: 'looksmaxxing', to: 'Looksmaxxing' }],
        redirects: [{ from: 'Looksmaxxing', to: 'Looksmaxing' }],
        pages: {
          '1': {
            title: 'Looksmaxing',
            extract: 'A community term with enough supplemental source text to be usable.',
          },
        },
      },
    }
    sourceFetch((url) => {
      expect(url.searchParams.get('redirects')).toBe('1')
      return Response.json(response)
    })
    const outcome = await fetchIncelsWikiOutcome('looksmaxxing')
    expect(outcome.status).toBe('found')
    if (outcome.status === 'found') {
      expect(outcome.data.requestedWord).toBe('looksmaxxing')
      expect(outcome.data.resolvedWord).toBe('Looksmaxing')
      expect(outcome.data.url).toEndWith('/Looksmaxing')
      expect(outcome.data.evidenceRole).toBe('context')
    }
    sourceFetch(() =>
      Response.json({
        query: { ...response.query, redirects: [{ from: 'another', to: 'Looksmaxing' }] },
      })
    )
    expect(await fetchIncelsWikiOutcome('looksmaxxing')).toMatchObject({ status: 'no_evidence' })
  })

  test('propagates cancellation instead of reporting an unavailable source', async () => {
    const signal = AbortSignal.abort(new Error('reader left'))
    await expect(fetchEtymonlineOutcome('word', signal)).rejects.toThrow('reader left')
    await expect(fetchIncelsWikiOutcome('word', signal)).rejects.toThrow('reader left')
  })
})

describe('recovered Etymonline entry boundaries', () => {
  test('retains all target paragraphs and separates adjacent proper names and related entries', () => {
    const text =
      '<h1>Origin and history of <em>nice</em></h1><h2>nice(adj.)</h2><p>Late 13c., from Latin nescius.</p><p>By 1926, a later sense. TAIL</p><h2>Nice</h2><p>A city from Greek nikaios.</p><p>Late 14c., unrelated fond entry.</p>'
    const result = parseRecoveredEtymonline('nice', {
      url: 'https://www.etymonline.com/word/nice',
      text,
    })
    expect(result?.text).toContain('TAIL')
    expect(result?.text).not.toContain('nikaios')
    expect(result?.text).not.toContain('fond')
    expect(result?.entryGroups).toHaveLength(1)
    expect(result?.incomplete).toBe(true)
  })

  test('marks retained homographs incomplete when a final matching entry has no boundary', () => {
    const result = parseRecoveredEtymonline('bank', {
      url: 'https://www.etymonline.com/word/bank',
      text: '<h1><em>bank</em></h1><h2>bank(n.1)</h2><p>From Old English first.</p><h2>bank(n.2)</h2><p>From French second. TAIL</p><h2>bank(n.3)</h2><p>From Latin third.</p><p>Unlabeled related entry.</p>',
    })
    expect(result?.entryGroups).toHaveLength(2)
    expect(result?.text).toContain('TAIL')
    expect(result?.text).not.toContain('third')
    expect(result?.incomplete).toBe(true)
  })

  test('rejects an open-ended extraction with unlabeled related text and false source identity', () => {
    const text =
      '<h1>Origin and history of <em>perfunctory</em></h1><h2>perfunctory(adj.)</h2><p>1580s, from Late Latin perfunctorius.</p><p>1530s, from French fonction, unrelated function entry.</p>'
    expect(
      parseRecoveredEtymonline('perfunctory', {
        url: 'https://www.etymonline.com/word/perfunctory',
        text,
      })
    ).toBeNull()
    expect(
      parseRecoveredEtymonline('perfunctory', {
        url: 'https://www.etymonline.com.evil.test/word/perfunctory',
        text,
      })
    ).toBeNull()
    expect(
      parseRecoveredEtymonline('côte', { url: 'https://www.etymonline.com/word/cote', text })
    ).toBeNull()
  })
})
