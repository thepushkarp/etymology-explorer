import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildResearchPrompt,
  conductAgenticResearch,
  extractRelatedTerms,
  extractRootsCpu,
} from '@/lib/research'
import { extractEtymonlineRelatedEntries } from '@/lib/etymonline'
import { parseSourceTexts } from '@/lib/etymologyParser'
import { CONFIG } from '@/lib/config'
import { ResearchContext, StreamEvent } from '@/lib/types'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const LTR_MARK = '\u200E' // Wiktionary renders derivation formulas as "+<U+200E>"

/**
 * Answer an @upstash/redis REST call with a cache miss. The client batches
 * concurrent commands into a pipeline (array body → array response).
 */
function upstashMissResponse(init?: RequestInit): Response {
  let commandCount = 1
  try {
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    if (Array.isArray(body) && Array.isArray(body[0])) {
      commandCount = body.length
      return new Response(JSON.stringify(Array(commandCount).fill({ result: null })), {
        status: 200,
      })
    }
  } catch {
    // fall through to single-command response
  }
  return new Response(JSON.stringify({ result: null }), { status: 200 })
}

describe('extractRootsCpu', () => {
  test('classical: parses surface-analysis formula with U+200E marks (telephone)', () => {
    const wiktionary = `From French téléphone. By surface analysis, tele- +${LTR_MARK} -phone.`

    expect(extractRootsCpu('telephone', null, wiktionary, [])).toEqual(['tele', 'phone'])
  })

  test('classical: parses multi-part equivalent-to formula (autobiography)', () => {
    const wiktionary =
      `From auto- +${LTR_MARK} biography, ` +
      `equivalent to auto- +${LTR_MARK} bio- +${LTR_MARK} -graphy.`

    expect(extractRootsCpu('autobiography', null, wiktionary, [])).toEqual([
      'auto',
      'biography',
      'bio',
      'graphy',
    ])
  })

  test('germanic: parses equivalent-to formula (understand)', () => {
    const wiktionary =
      'From Middle English understanden, from Old English understandan ' +
      `("to understand"), equivalent to under- +${LTR_MARK} stand.`

    expect(extractRootsCpu('understand', null, wiktionary, [])).toEqual(['under', 'stand'])
  })

  test('neologism: drops inflectional suffixes from formulas (doomscrolling, selfie)', () => {
    expect(
      extractRootsCpu('doomscrolling', null, `From doom +${LTR_MARK} scroll +${LTR_MARK} -ing.`, [])
    ).toEqual(['doom', 'scroll'])

    expect(extractRootsCpu('selfie', null, `From self +${LTR_MARK} -ie.`, [])).toEqual(['self'])
  })

  test('tricky: returns nothing for plain narrative chains, leaving the LLM fallback (nice)', () => {
    const wiktionary =
      'From Middle English nyce, from Old French nice ("careless, clumsy"), ' +
      'from Latin nescius ("ignorant, not knowing").'
    const etymonline =
      'late 13c., "foolish, ignorant," from Old French nice "careless," ' +
      'from Latin nescius "ignorant, unaware"'

    const chains = parseSourceTexts('nice', etymonline, wiktionary)
    expect(extractRootsCpu('nice', etymonline, wiktionary, chains)).toEqual([])
  })

  test('collects hyphen-marked affix morphemes from parsed chains, skipping reconstructed forms', () => {
    const etymonline =
      '1580s, from Latin incredibilis "not to be believed," from in- "not" ' +
      'and from PIE root *kerd- "heart"'
    const chains = parseSourceTexts('incredible', etymonline, null)
    // The chain contains Latin "incredibilis", Latin-adjacent "in-", and PIE "*kerd-".
    // Only the hyphen-marked affix is a CPU root candidate; *kerd- is reconstructed.
    const roots = extractRootsCpu('incredible', etymonline, null, chains)

    expect(roots).not.toContain('kerd')
    expect(roots).not.toContain('*kerd-')
  })

  test('excludes the searched word itself and caps at maxRootsToExplore', () => {
    const formula = `From alpha +${LTR_MARK} beta +${LTR_MARK} gamma +${LTR_MARK} delta +${LTR_MARK} epsilon +${LTR_MARK} zeta.`

    const roots = extractRootsCpu('alpha', null, formula, [])
    expect(roots).not.toContain('alpha')
    expect(roots.length).toBeLessThanOrEqual(CONFIG.maxRootsToExplore)
    expect(roots).toEqual(['beta', 'gamma', 'delta', 'epsilon'])
  })
})

describe('research breadth', () => {
  test('extractEtymonlineRelatedEntries finds linked relation entries from escaped page payloads', () => {
    const html = String.raw`{\"word\":\"contradict\",\"desc\":\"assert the contrary\"},{\"word\":\"contra\",\"desc\":\"Latin preposition meaning against\"},{\"word\":\"*deik-\",\"desc\":\"PIE root meaning to show\"},{\"key\":\"syn_ant\",\"word\":\"contravene\",\"desc\":\"from Latin contra + venire\"},{\"word\":\"gainsay\",\"desc\":\"literally say against\"},{\"word\":\"contradictory\"}`

    expect(extractEtymonlineRelatedEntries(html, 'contradict')).toEqual([
      'contra',
      '*deik-',
      'contravene',
      'gainsay',
    ])
  })

  test('extractRelatedTerms combines derivational formulas with seeded source hints', () => {
    const text = `
Derived from Latin contradictus.
Equivalent to contra + dict.
Ultimately from Proto-Indo-European *deik-.
Compare gainsay.
    `

    expect(extractRelatedTerms(text, ['contradict'], ['contra', '*deik-', 'contravene'])).toEqual([
      'contra',
      '*deik-',
      'contravene',
      'dict',
    ])
  })

  test('buildResearchPrompt includes linked entries and fetched related-term sections', () => {
    const context: ResearchContext = {
      mainWord: {
        word: 'contradict',
        etymonline: {
          text: '1580s, from Latin contradictus.',
          url: 'https://www.etymonline.com/word/contradict',
          relatedEntries: ['contra', '*deik-', 'contravene'],
        },
        wiktionary: {
          text: 'Derived from Latin contradictus.',
          url: 'https://en.wiktionary.org/wiki/contradict',
        },
      },
      identifiedRoots: ['contra', 'dict'],
      rootResearch: [
        {
          root: 'contra',
          etymonlineData: null,
          wiktionaryData: null,
          relatedTerms: ['oppose', 'contravene'],
        },
      ],
      relatedResearch: [
        {
          term: 'contravene',
          etymonlineData: {
            text: 'From Latin contra + venire.',
            url: 'https://www.etymonline.com/word/contravene',
          },
          wiktionaryData: null,
        },
      ],
      totalSourcesFetched: 8,
    }

    const prompt = buildResearchPrompt(context)

    expect(prompt).toContain('Etymonline linked entries: contra, *deik-, contravene')
    expect(prompt).toContain('=== Related Term: "contravene" ===')
    expect(prompt).toContain('Related terms found: oppose, contravene')
  })
})

describe('buildResearchPrompt token diet', () => {
  function buildContext(): ResearchContext {
    return {
      mainWord: {
        word: 'telephone',
        etymonline: {
          text: `1835, from French téléphone. ${'x'.repeat(5000)}`,
          url: 'https://www.etymonline.com/word/telephone',
        },
        wiktionary: {
          text: `From French téléphone. ${'y'.repeat(5000)}`,
          url: 'https://en.wiktionary.org/wiki/telephone',
        },
        wikipedia: {
          text: `A telephone is a device. ${'w'.repeat(5000)}`,
          url: 'https://en.wikipedia.org/wiki/Telephone',
        },
        freeDictionary: {
          word: 'telephone',
          phonetic: '/ˈtɛlɪfoʊn/',
          phonetics: [
            {
              text: '/ˈtɛlɪfoʊn/',
              audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/telephone-us.mp3',
            },
          ],
          meanings: [
            {
              partOfSpeech: 'noun',
              definitions: [
                { definition: 'An electronic device used for two-way talking', example: 'ring' },
                { definition: 'The telephone network', example: 'by telephone' },
                { definition: 'A children’s whisper game' },
                { definition: 'A fourth definition that must be dropped' },
              ],
            },
            {
              partOfSpeech: 'verb',
              definitions: [{ definition: 'To call someone using a telephone' }],
            },
          ],
          origin: 'late 19th century: from French téléphone',
        },
      },
      identifiedRoots: ['tele', 'phone'],
      rootResearch: [
        {
          root: 'tele',
          etymonlineData: {
            text: `word-forming element meaning far. ${'r'.repeat(5000)}`,
            url: 'https://www.etymonline.com/word/tele-',
          },
          wiktionaryData: null,
          relatedTerms: [],
        },
      ],
      relatedResearch: [
        {
          term: 'telegraph',
          etymonlineData: {
            text: `1794, from French télégraphe. ${'t'.repeat(5000)}`,
            url: 'https://www.etymonline.com/word/telegraph',
          },
          wiktionaryData: null,
        },
      ],
      totalSourcesFetched: 10,
    }
  }

  function sourceBlocks(prompt: string): string[] {
    return [...prompt.matchAll(/<source_data name="[^"]+">\n([\s\S]*?)\n<\/source_data>/g)].map(
      (match) => match[1]
    )
  }

  test('freeDictionary is compacted: origin, phonetics, per-POS definitions — no audio URLs', () => {
    const prompt = buildResearchPrompt(buildContext())

    expect(prompt).toContain('Phonetics: /ˈtɛlɪfoʊn/')
    expect(prompt).toContain('Origin: late 19th century: from French téléphone')
    expect(prompt).toContain('noun: An electronic device used for two-way talking')
    expect(prompt).toContain('verb: To call someone using a telephone')
    // The raw JSON payload junk must be gone
    expect(prompt).not.toContain('.mp3')
    expect(prompt).not.toContain('A fourth definition that must be dropped')
    expect(prompt).not.toContain('"partOfSpeech"')
  })

  test('freeDictionary compact block matches snapshot', () => {
    const prompt = buildResearchPrompt(buildContext())
    const block = prompt.match(/<source_data name="free_dictionary">\n([\s\S]*?)\n<\/source_data>/)

    expect(block?.[1]).toMatchSnapshot()
  })

  test('every source block honors its tiered character budget', () => {
    const prompt = buildResearchPrompt(buildContext())
    const blocks = sourceBlocks(prompt)
    const maxBudget = Math.max(
      CONFIG.promptBudget.mainSourceChars,
      CONFIG.promptBudget.supplementalSourceChars
    )

    expect(blocks.length).toBeGreaterThanOrEqual(5)
    for (const block of blocks) {
      expect(block.length).toBeLessThanOrEqual(maxBudget)
    }

    // Tier checks: main sources get the large budget, roots and related less
    const etymonlineBlock = blocks[0]
    expect(etymonlineBlock.length).toBe(CONFIG.promptBudget.mainSourceChars)

    const rootBlock = prompt.match(
      /=== Root: "tele" ===\n<source_data name="etymonline">\n([\s\S]*?)\n<\/source_data>/
    )
    expect(rootBlock?.[1].length).toBe(CONFIG.promptBudget.rootSourceChars)

    const relatedBlock = prompt.match(
      /=== Related Term: "telegraph" ===\n<source_data name="etymonline">\n([\s\S]*?)\n<\/source_data>/
    )
    expect(relatedBlock?.[1].length).toBe(CONFIG.promptBudget.relatedSourceChars)
  })
})

/**
 * Route fetch calls by URL so conductAgenticResearch can run end-to-end
 * without the network. Redis REST calls (source cache) get a benign
 * cache-miss response; unknown hosts get a 404.
 */
function installFetchRouter(options?: { wikipediaDelayMs?: number }): {
  requestedUrls: string[]
} {
  const requestedUrls: string[] = []
  const wikipediaDelayMs = options?.wikipediaDelayMs ?? 0

  const wiktionaryExtract = [
    '== English ==',
    '',
    '=== Etymology ===',
    '',
    `From French téléphone. By surface analysis, tele- +${LTR_MARK} -phone.`,
    '',
    '=== Noun ===',
    '',
    'telephone (plural telephones)',
    '',
    '== French ==',
    '',
    '=== Etymology ===',
    '',
    'Borrowed internally.',
  ].join('\n')

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    requestedUrls.push(url)

    // Upstash source-cache REST calls (only when local env has credentials):
    // always answer "miss" so tests never depend on a live Redis.
    const kvUrl = process.env.ETYMOLOGY_KV_REST_API_URL
    if (kvUrl && url.startsWith(kvUrl)) {
      return upstashMissResponse(init)
    }

    if (url.includes('etymonline.com/word/telephone')) {
      return new Response(
        '<html><body><section class="prose-lg">1835, from French téléphone, from télé- "far" + phone "sound"</section></body></html>',
        { status: 200 }
      )
    }

    if (url.includes('wiktionary.org/w/api.php') && url.includes('telephone')) {
      return new Response(
        JSON.stringify({ query: { pages: { '123': { extract: wiktionaryExtract } } } }),
        { status: 200 }
      )
    }

    if (url.includes('dictionaryapi.dev')) {
      return new Response(
        JSON.stringify([
          {
            word: 'telephone',
            phonetic: '/ˈtɛlɪfoʊn/',
            phonetics: [{ text: '/ˈtɛlɪfoʊn/', audio: 'https://example.com/audio.mp3' }],
            meanings: [
              {
                partOfSpeech: 'noun',
                definitions: [{ definition: 'An electronic device for speaking at a distance' }],
              },
            ],
            origin: 'late 19th century: from French téléphone',
          },
        ]),
        { status: 200 }
      )
    }

    if (url.includes('wikipedia.org')) {
      if (wikipediaDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, wikipediaDelayMs))
      }
      return new Response(
        JSON.stringify({
          type: 'standard',
          extract: 'A telephone is a telecommunications device.',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Telephone' } },
        }),
        { status: 200 }
      )
    }

    if (url.includes('urbandictionary.com')) {
      return new Response(JSON.stringify({ list: [] }), { status: 200 })
    }

    return new Response('not found', { status: 404 })
  }) as typeof fetch

  return { requestedUrls }
}

describe('conductAgenticResearch phase ordering', () => {
  test('optional sources resolving after root identification still land in the synthesis context', async () => {
    const { requestedUrls } = installFetchRouter({ wikipediaDelayMs: 150 })
    const events: StreamEvent[] = []

    const context = await conductAgenticResearch('telephone', undefined, (event) =>
      events.push(event)
    )

    // Roots were derived on-CPU from the Wiktionary formula — no LLM call
    expect(context.identifiedRoots).toEqual(['tele', 'phone'])
    expect(context.llmUsage).toBeUndefined()
    expect(requestedUrls.some((url) => url.includes('openrouter.ai'))).toBe(false)

    // Roots were identified BEFORE the slow optional source finished...
    const rootsIndex = events.findIndex((event) => event.type === 'roots_identified')
    const wikipediaIndex = events.findIndex(
      (event) => event.type === 'source_complete' && event.source === 'wikipedia'
    )
    expect(rootsIndex).toBeGreaterThanOrEqual(0)
    expect(wikipediaIndex).toBeGreaterThan(rootsIndex)

    // ...yet the optional source still landed in the context and the prompt
    expect(context.mainWord.wikipedia?.text).toBe('A telephone is a telecommunications device.')
    expect(buildResearchPrompt(context)).toContain('A telephone is a telecommunications device.')
  })
})

describe('conductAgenticResearch abort propagation', () => {
  test('aborting the signal cancels pending fetches and rejects the pipeline', async () => {
    let abortedFetches = 0

    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

      // Keep the source cache instant so the pipeline reaches the real fetches
      const kvUrl = process.env.ETYMOLOGY_KV_REST_API_URL
      if (kvUrl && url.startsWith(kvUrl)) {
        return Promise.resolve(upstashMissResponse(init))
      }

      // Source fetches hang until the abort signal fires
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          abortedFetches += 1
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })
    }) as typeof fetch

    const controller = new AbortController()
    const researchPromise = conductAgenticResearch('telephone', { signal: controller.signal })

    setTimeout(() => controller.abort(), 20)

    expect(researchPromise).rejects.toMatchObject({ name: 'AbortError' })
    await researchPromise.catch(() => {})

    // All six in-flight source fetches were cancelled, not left hanging
    expect(abortedFetches).toBe(6)
  })
})
