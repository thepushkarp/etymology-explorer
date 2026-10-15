import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildResearchPrompt,
  conductAgenticResearch,
  extractRootsQuick,
  extractRelatedTerms,
  extractRootsCpu,
  hasCredibleMainSource,
  phraseComponents,
  expandLexemes,
} from '@/lib/research'
import { extractEtymonlineRelatedEntries, fetchEtymonline } from '@/lib/etymonline'
import { parseSourceTexts } from '@/lib/etymologyParser'
import { CONFIG } from '@/lib/config'
import { SourceFetchBudget } from '@/lib/sourceFetchBudget'
import { classifyApiError } from '@/lib/apiError'
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

    expect(extractRootsCpu('telephone', null, wiktionary, [])).toEqual(['tele-', '-phone'])
  })

  test('classical: parses formulas with parenthetical glosses between morphemes (telephone)', () => {
    const wiktionary =
      'The noun is derived from tele- (prefix meaning ‘from a distance’) ' +
      `+${LTR_MARK} -phone (suffix denoting a device which makes a sound), ` +
      'modelled after German Telephon.'

    expect(extractRootsCpu('telephone', null, wiktionary, [])).toEqual(['tele-', '-phone'])
  })

  test('classical: parses quoted glosses and preserves diacritics (telephone, etymonline style)', () => {
    const etymonline =
      '1835, from French téléphone (c. 1830), from télé- "far" (see tele- ) ' +
      '+ phōnē "sound, voice"'

    expect(extractRootsCpu('telephone', etymonline, null, [])).toEqual(['télé-', 'phōnē'])
  })

  test('classical: parses multi-part equivalent-to formula (autobiography)', () => {
    const wiktionary =
      `From auto- +${LTR_MARK} biography, ` +
      `equivalent to auto- +${LTR_MARK} bio- +${LTR_MARK} -graphy.`

    expect(extractRootsCpu('autobiography', null, wiktionary, [])).toEqual([
      'auto-',
      'biography',
      'bio-',
      '-graphy',
    ])
  })

  test('germanic: parses equivalent-to formula (understand)', () => {
    const wiktionary =
      'From Middle English understanden, from Old English understandan ' +
      `("to understand"), equivalent to under- +${LTR_MARK} stand.`

    expect(extractRootsCpu('understand', null, wiktionary, [])).toEqual(['under-', 'stand'])
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
  test.each(['en', 'fr'] as const)(
    'the %s dictionary fallback runs only after direct Wiktionary misses',
    async (language) => {
      for (const directWorks of [true, false]) {
        const requests: string[] = []
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
          const url = input instanceof Request ? input.url : String(input)
          if (
            process.env.ETYMOLOGY_KV_REST_API_URL &&
            url.startsWith(process.env.ETYMOLOGY_KV_REST_API_URL)
          )
            return upstashMissResponse(init)
          requests.push(url)
          const hostname = new URL(url).hostname
          if (['en.wiktionary.org', 'fr.wiktionary.org'].includes(hostname) && directWorks) {
            const heading =
              language === 'en'
                ? 'English'
                : hostname === 'en.wiktionary.org'
                  ? 'French'
                  : 'Français'
            return Response.json({
              parse: {
                title: 'fixture',
                text: `<h2 id="L">${heading}</h2><h3 id="Etymology">Etymology</h3><p>From alpha + -ize.</p>`,
                tocdata: {
                  sections: [
                    { index: '1', line: heading, anchor: 'L', hLevel: 2, number: '1' },
                    {
                      index: '2',
                      line: 'Etymology',
                      anchor: 'Etymology',
                      hLevel: 3,
                      number: '1.1',
                    },
                  ],
                },
              },
            })
          }
          if (hostname === 'freedictionaryapi.com')
            return Response.json({
              word: 'fixture',
              entries: [
                {
                  word: 'fixture',
                  language: { code: language },
                  senses: [{ definition: 'A documented word.' }],
                },
              ],
            })
          return new Response('', { status: 404 })
        }) as typeof fetch
        const context = await conductAgenticResearch('fixture', {
          language,
          skipOptionalSources: true,
        })
        const hosts = requests.map((url) => new URL(url).hostname)
        expect(hosts.filter((host) => host === 'freedictionaryapi.com')).toHaveLength(
          directWorks ? 0 : 1
        )
        expect(
          hosts.every(
            (host) => !['api.urbandictionary.com', 'api.dictionaryapi.dev'].includes(host)
          )
        ).toBe(true)
        if (!directWorks) {
          expect(context.entryContexts?.[0].entryKind).toBe('unresolved')
          expect(context.parsedChains).toEqual([])
          expect(context.incompleteResearch).toBe(true)
          expect(hasCredibleMainSource(context)).toBe(true)
        }
        if (directWorks && language === 'en') expect(context.incompleteResearch).toBe(true)
      }
    }
  )
  test('admits credible supplemental sources when primary etymology sources miss', () => {
    const context: ResearchContext = {
      mainWord: {
        word: 'validword',
        etymonline: null,
        wiktionary: null,
        wikipedia: null,
        incelsWiki: null,
      },
      identifiedRoots: [],
      rootResearch: [],
      relatedResearch: [],
      totalSourcesFetched: 6,
    }

    expect(hasCredibleMainSource(context)).toBe(false)

    context.mainWord.wikipedia = {
      text: 'A documented English word.',
      url: 'https://en.wikipedia.org/wiki/Validword',
    }
    expect(hasCredibleMainSource(context)).toBe(true)

    context.mainWord.wikipedia = null
    context.mainWord.incelsWiki = {
      text: 'Community slang definition only.',
      url: 'https://incels.wiki/w/validword',
    }
    expect(hasCredibleMainSource(context)).toBe(false)
  })

  test('extractEtymonlineRelatedEntries finds linked relation entries from escaped page payloads', () => {
    const html = String.raw`{\"word\":\"contradict\",\"desc\":\"assert the contrary\"},{\"word\":\"contra\",\"desc\":\"Latin preposition meaning against\"},{\"word\":\"*deik-\",\"desc\":\"PIE root meaning to show\"},{\"key\":\"syn_ant\",\"word\":\"contravene\",\"desc\":\"from Latin contra + venire\"},{\"word\":\"gainsay\",\"desc\":\"literally say against\"},{\"word\":\"contradictory\"}`

    expect(extractEtymonlineRelatedEntries(html, 'contradict')).toEqual([
      'contra',
      '*deik-',
      'contravene',
      'gainsay',
    ])
  })

  test('fetchEtymonline preserves long cleaned entries for prompt-time clipping', async () => {
    const tailEvidence = 'tail evidence from Proto-Testic *werd- "speak"'
    const longEntry = `1590s, from Latin initium. ${'middle '.repeat(400)} ${tailEvidence}`

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const kvUrl = process.env.ETYMOLOGY_KV_REST_API_URL
      if (kvUrl && url.startsWith(kvUrl)) {
        return upstashMissResponse(init)
      }

      return new Response(
        `<html><body><section class="prose-lg">${longEntry}</section></body></html>`,
        { status: 200 }
      )
    }) as typeof fetch

    const result = await fetchEtymonline('longword')

    expect(result?.text.length).toBeGreaterThan(2000)
    expect(result?.text).toContain(tailEvidence)
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

describe('extractRootsQuick full sources', () => {
  test('preserves tail evidence in the fallback root-extraction prompt', async () => {
    const previousKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = previousKey ?? 'test-openrouter-key'
    const tailEvidence = 'tailroot appears only in this final derivation clue'
    let capturedInput = ''

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.includes('openrouter.ai/api/v1/responses')) {
        return new Response(JSON.stringify({ result: null }), { status: 200 })
      }

      const requestBody = JSON.parse(String(init?.body)) as { input?: string }
      capturedInput = requestBody.input ?? ''
      return new Response(
        JSON.stringify({
          output_text: '{"roots":["tailroot"]}',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 }
      )
    }) as typeof fetch

    try {
      const result = await extractRootsQuick(
        'longword',
        `${'head '.repeat(500)} ${tailEvidence}`,
        null
      )

      expect(result.roots).toEqual(['tailroot'])
      expect(capturedInput).toContain('head '.repeat(500))
      expect(capturedInput).toContain(tailEvidence)
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENROUTER_API_KEY
      } else {
        process.env.OPENROUTER_API_KEY = previousKey
      }
    }
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
        multilingualDictionary: {
          text: JSON.stringify({
            pronunciations: [{ text: '/ˈtɛlɪfoʊn/', audio: 'https://example.test/telephone.mp3' }],
            entries: [
              {
                partOfSpeech: 'noun',
                definitions: [
                  { definition: 'An electronic device used for two-way talking' },
                  { definition: 'Fourth definition retained.' },
                ],
              },
              {
                partOfSpeech: 'verb',
                definitions: [{ definition: 'To call someone using a telephone' }],
              },
            ],
          }),
          url: 'https://freedictionaryapi.com/api/v1/entries/en/telephone',
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

  test('dictionary fallback retains complete phonetics, definitions and references', () => {
    const prompt = buildResearchPrompt(buildContext())

    expect(prompt).toContain('/ˈtɛlɪfoʊn/')
    expect(prompt).toContain('An electronic device used for two-way talking')
    expect(prompt).toContain('To call someone using a telephone')
    expect(prompt).toContain('.mp3')
    expect(prompt).toContain('Fourth definition retained.')
    expect(prompt).toContain('"partOfSpeech"')
  })

  test('retains full main, supplemental, root and related source text', () => {
    const context = buildContext()
    const prompt = buildResearchPrompt(context)
    expect(sourceBlocks(prompt)[0]).toBe(context.mainWord.etymonline!.text)
    expect(prompt).toContain(context.rootResearch[0].etymonlineData!.text)
    expect(prompt).toContain(context.relatedResearch[0].etymonlineData!.text)
    expect(prompt).not.toContain('source excerpt clipped')
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
        JSON.stringify({
          parse: {
            title: 'telephone',
            text: '<h2 id="English">English</h2><h3 id="Etymology">Etymology</h3><p>From French téléphone. By surface analysis, tele- + -phone.</p><h3 id="Noun">Noun</h3><p>telephone</p>',
            tocdata: {
              sections: [
                { index: '1', line: 'English', anchor: 'English', level: '2', number: '1' },
                { index: '2', line: 'Etymology', anchor: 'Etymology', level: '3', number: '1.1' },
                { index: '3', line: 'Noun', anchor: 'Noun', level: '3', number: '1.2' },
              ],
            },
          },
        }),
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
          query: {
            pages: [
              { ns: 0, title: 'Telephone', extract: 'A telephone is a telecommunications device.' },
            ],
          },
        }),
        { status: 200 }
      )
    }

    return new Response('not found', { status: 404 })
  }) as typeof fetch

  return { requestedUrls }
}

describe('conductAgenticResearch phase ordering', () => {
  test('source-defined ancestors do not wait for the root-extraction LLM', async () => {
    const savedKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
    let release!: () => void
    const rootsReady = new Promise<void>((resolve) => {
      release = resolve
    })
    let ancestorRequested = false
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      if (
        process.env.ETYMOLOGY_KV_REST_API_URL &&
        url.startsWith(process.env.ETYMOLOGY_KV_REST_API_URL)
      )
        return upstashMissResponse(init)
      if (url.includes('openrouter.ai')) {
        await rootsReady
        return Response.json({
          output_text: '{"roots":["traceword"]}',
          usage: { input_tokens: 10, output_tokens: 2 },
        })
      }
      if (url.includes('etymonline.com/word/traceword'))
        return new Response('<section class="prose-lg">1590s, from Latin nexus.</section>')
      if (new URL(url).searchParams.get('page') === 'nexus') ancestorRequested = true
      return new Response('not found', { status: 404 })
    }) as typeof fetch
    const pending = conductAgenticResearch('traceword')
    try {
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(ancestorRequested).toBe(true)
      release()
      const context = await pending
      expect(context.identifiedRoots).toEqual(['traceword'])
      expect(context.mainWord.etymonline?.text).toContain('from Latin nexus')
      expect(context.totalSourcesFetched).toBeLessThanOrEqual(CONFIG.maxTotalFetches)
    } finally {
      release()
      try {
        await pending
      } finally {
        if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
        else process.env.OPENROUTER_API_KEY = savedKey
      }
    }
  })

  test('optional sources resolving after root identification still land in the synthesis context', async () => {
    const { requestedUrls } = installFetchRouter({ wikipediaDelayMs: 150 })
    const events: StreamEvent[] = []

    const context = await conductAgenticResearch('telephone', undefined, (event) =>
      events.push(event)
    )

    // Roots were derived on-CPU from the Wiktionary formula — no LLM call
    expect(context.identifiedRoots).toEqual(['télé-', 'phone', 'tele-', '-phone'])
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

    expect(abortedFetches).toBe(4)
  })
})

describe('phrase research scope', () => {
  test('useful components preserve each language and phrase particles', () => {
    expect(phraseComponents('plot armour', 'en')).toEqual(['plot', 'armour'])
    expect(phraseComponents('pomme de terre', 'fr')).toEqual(['pomme', 'terre'])
    expect(phraseComponents('ferro da stiro', 'it')).toEqual(['ferro', 'stiro'])
    expect(phraseComponents('fin de semana', 'es')).toEqual(['fin', 'semana'])
    expect(phraseComponents('fim de semana', 'pt')).toEqual(['fim', 'semana'])
  })
  test('component sources never admit an otherwise unconfirmed phrase', () => {
    const context: ResearchContext = {
      language: 'fr',
      mainWord: { word: 'pomme de terre', etymonline: null, wiktionary: null },
      rootResearch: [
        {
          root: 'pomme',
          relationship: 'component',
          etymonlineData: null,
          wiktionaryData: { text: 'From Latin pomum', url: 'https://en.wiktionary.org/wiki/pomme' },
          relatedTerms: [],
        },
      ],
      identifiedRoots: [],
      relatedResearch: [],
      totalSourcesFetched: 0,
    }
    expect(hasCredibleMainSource(context)).toBe(false)
  })
})

test('component variants preserve query identity, separate scopes and actual HTTP budget', async () => {
  const requests: string[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const kvUrl = process.env.ETYMOLOGY_KV_REST_API_URL
    if (kvUrl && url.startsWith(kvUrl)) return upstashMissResponse(init)
    requests.push(url)
    if (url.includes('wiktionary.org/w/api.php')) {
      const term = new URL(url).searchParams.get('page') ?? ''
      const paragraph =
        term === 'armour'
          ? 'Alternative spelling of <a href="/wiki/armor" title="armor">armor</a>.'
          : term === 'armor'
            ? 'Alternative spelling of <a href="/wiki/armour" title="armour">armour</a>.'
            : 'A component definition.'
      return Response.json({
        parse: {
          title: term,
          text: `<h2 id="English">English</h2><h3 id="Noun">Noun</h3><p>${paragraph}</p>`,
          tocdata: {
            sections: [
              { index: '1', line: 'English', anchor: 'English', level: '2', number: '1' },
              { index: '2', line: 'Noun', anchor: 'Noun', level: '3', number: '1.1' },
            ],
          },
        },
      })
    }
    return new Response('missing', { status: 404 })
  }) as typeof fetch
  const context: ResearchContext = {
    language: 'en',
    mainWord: { word: 'plot armour', etymonline: null, wiktionary: null },
    rootResearch: [],
    identifiedRoots: [],
    relatedResearch: [],
    totalSourcesFetched: 0,
  }
  const budget = new SourceFetchBudget(16)
  await expandLexemes(context, budget)
  expect(context.mainWord.word).toBe('plot armour')
  expect(context.rootResearch.find((item) => item.root === 'armor')).toMatchObject({
    relationship: 'spelling-variant',
    variantOf: { word: 'armour', language: 'en' },
    relationshipSourceUrl: 'https://en.wiktionary.org/wiki/armor',
  })
  expect(
    context.rootResearch.find((item) => item.root === 'armour')?.parentHistoryId
  ).toBeUndefined()
  expect(new Set(context.rootResearch.map((item) => item.evidenceScopeId)).size).toBe(
    context.rootResearch.length
  )
  expect(requests.filter((url) => new URL(url).searchParams.get('page') === 'armour')).toHaveLength(
    1
  )
  expect(budget.attempts).toBe(requests.length)
  expect(budget.attempts).toBeLessThanOrEqual(16)
})

test('secondary edition homographs cannot corroborate the primary history', async () => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const kvUrl = process.env.ETYMOLOGY_KV_REST_API_URL
    if (kvUrl && url.startsWith(kvUrl)) return upstashMissResponse(init)
    if (url.includes('wiktionary.org/w/api.php')) {
      const primary = new URL(url).hostname === 'fr.wiktionary.org'
      const languageHeading = primary ? 'Français' : 'French'
      const heading = primary ? 'Étymologie' : 'Etymology 1'
      const sections = [
        { index: '1', line: languageHeading, anchor: languageHeading, level: '2', number: '1' },
        { index: '2', line: heading, anchor: heading.replace(' ', '_'), level: '3', number: '1.1' },
      ]
      let html = `<h2 id="${languageHeading}">${languageHeading}</h2><h3 id="${heading.replace(' ', '_')}">${heading}</h3><p>From Latin pomum.</p>`
      if (!primary) {
        sections.push({
          index: '3',
          line: 'Etymology 2',
          anchor: 'Etymology_2',
          level: '3',
          number: '1.2',
        })
        html += '<h3 id="Etymology_2">Etymology 2</h3><p>From Latin terra.</p>'
      }
      return Response.json({ parse: { title: 'pomme', text: html, tocdata: { sections } } })
    }
    return new Response('missing', { status: 404 })
  }) as typeof fetch
  const context = await conductAgenticResearch('pomme', { language: 'fr' })
  expect(context.entryContexts).toHaveLength(1)
  expect(context.entryContexts![0].source).toBe('wiktionaryNative')
  expect(context.parsedChains!.every((chain) => chain.provider === 'wiktionaryNative')).toBe(true)
  expect(context.mainWord.wiktionaryEnglish?.entryGroups).toHaveLength(2)
  expect(buildResearchPrompt(context)).toContain('From Latin terra.')
})

test('root extraction exposes context overflow and retains billed provider failure usage', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = previousKey ?? 'test-openrouter-key'
  try {
    globalThis.fetch = (async () =>
      Response.json({
        error: { message: 'context_length_exceeded' },
        usage: { input_tokens: 9, output_tokens: 2, cost: 0.03 },
      })) as unknown as typeof fetch
    await expect(extractRootsQuick('word', 'full source', null)).rejects.toThrow(
      'context_length_exceeded'
    )
    globalThis.fetch = (async () =>
      Response.json({
        error: { message: 'provider unavailable' },
        usage: { input_tokens: 9, output_tokens: 2, cost: 0.03 },
      })) as unknown as typeof fetch
    expect(await extractRootsQuick('word', 'full source', null)).toMatchObject({
      roots: [],
      usage: { inputTokens: 9, outputTokens: 2, costUSD: 0.03 },
    })
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previousKey
  }
})

describe('source rate limits are temporary failures', () => {
  const respond = (status: number, credibleWikipedia = false) => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const kvUrl = process.env.ETYMOLOGY_KV_REST_API_URL
      if (kvUrl && url.startsWith(kvUrl)) return upstashMissResponse(init)
      if (credibleWikipedia && new URL(url).hostname === 'en.wikipedia.org')
        return Response.json({
          query: { pages: [{ ns: 0, title: 'Bank', extract: 'A complete article.' }] },
        })
      return new Response('unavailable', { status })
    }) as typeof fetch
  }
  test('English and beta no-primary HTTP 429 errors bypass lexical absence', async () => {
    respond(429)
    for (const language of ['en', 'fr'] as const) {
      let error: unknown
      try {
        await conductAgenticResearch('bank', { language })
      } catch (caught) {
        error = caught
      }
      expect(classifyApiError(error).status).toBe(429)
    }
  })
  test('a credible primary bundle survives other source HTTP 429 responses', async () => {
    respond(429, true)
    const context = await conductAgenticResearch('bank')
    expect(hasCredibleMainSource(context)).toBe(true)
  })
  test('genuine HTTP 404 absence remains a no-source result', async () => {
    respond(404)
    for (const language of ['en', 'fr'] as const) {
      expect(hasCredibleMainSource(await conductAgenticResearch('bank', { language }))).toBe(false)
    }
  })
})
