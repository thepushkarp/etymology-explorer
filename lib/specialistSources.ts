import { CONFIG } from './config'
import { fetchWithTimeout } from './fetchUtils'
import { safeError } from './errorUtils'
import type { LanguageCode } from './languages'
import { canonicalizeWord } from './orthography'
import { decodeHtmlEntities } from './sourceText'
import type { SourceData, SourceFamilyId, SourceProviderId } from './types'
import { cleanWiktionaryHtml, type WiktionaryEntryGroup } from './wiktionaryEntryGroups'
import { fetchJmdict } from './jmdict'
import { fetchJapaneseHistorical } from './japaneseHistorical'

export interface SpecialistSourceResult {
  provider: SourceProviderId
  sourceFamily: SourceFamilyId
  evidenceRole: 'etymology' | 'lexical' | 'context'
  data: SourceData
}

export interface SpecialistProvider {
  id: string
  family: string
  languages: readonly LanguageCode[]
  /** Versioned local indexes do not need a second, potentially stale Redis copy. */
  local?: boolean
  fetch(word: string, signal?: AbortSignal): Promise<SpecialistSourceResult[]>
}

interface Element {
  tag: string
  attributes: Record<string, string>
  start: number
  body: number
  end: number
  children: Element[]
}

// Source HTML contains nested entry containers and custom dictionary tags.
// Keep byte ranges instead of flattening the page before identifying entries.
function elements(html: string): Element {
  const root: Element = {
    tag: '',
    attributes: {},
    start: 0,
    body: 0,
    end: html.length,
    children: [],
  }
  const stack = [root]
  const tokens = /<!--[\s\S]*?-->|<\/?[a-z][a-z\d:-]*(?:[^>"']|"[^"]*"|'[^']*')*>/gi
  for (const token of html.matchAll(tokens)) {
    const raw = token[0]
    if (raw.startsWith('<!--')) continue
    const tag = /^<\/?([\w:-]+)/.exec(raw)![1].toLowerCase()
    if (raw.startsWith('</')) {
      const index = stack.findLastIndex((node) => node.tag === tag)
      if (index > 0) {
        for (const node of stack.splice(index)) node.end = token.index + raw.length
      }
      continue
    }
    const attributes: Record<string, string> = {}
    for (const attr of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes[attr[1].toLowerCase()] = decodeHtmlEntities(attr[2] ?? attr[3] ?? attr[4])
    }
    const node: Element = {
      tag,
      attributes,
      start: token.index,
      body: token.index + raw.length,
      end: html.length,
      children: [],
    }
    stack[stack.length - 1].children.push(node)
    if (
      /\/>$/.test(raw) ||
      /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|wbr)$/.test(tag)
    ) {
      node.end = node.body
    } else stack.push(node)
  }
  return root
}

function all(root: Element, predicate: (node: Element) => boolean): Element[] {
  return root.children.flatMap((node) => [
    ...(predicate(node) ? [node] : []),
    ...all(node, predicate),
  ])
}

function hasClass(node: Element, name: string): boolean {
  return (node.attributes.class ?? '').split(/\s+/).includes(name)
}

function fragment(html: string, node: Element): string {
  return html.slice(node.start, node.end)
}

function plain(html: string): string {
  return cleanWiktionaryHtml(html)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function headword(html: string): string {
  return canonicalizeWord(plain(html.replace(/<(?:sup|ei)\b[^>]*>[\s\S]*?<\/(?:sup|ei)>/gi, '')))
}

function exact(value: string, word: string): boolean {
  return canonicalizeWord(value) === canonicalizeWord(word)
}

function group(
  id: string,
  heading: string,
  text: string,
  etymology = '',
  sourceUrl?: string
): WiktionaryEntryGroup {
  return {
    index: id,
    number: id,
    heading,
    anchor: id,
    level: 2,
    text,
    sourceUrl,
    sections: etymology
      ? [
          {
            index: `${id}:etymology`,
            number: id,
            heading: 'Etymology',
            anchor: `${id}:etymology`,
            level: 3,
            path: [heading, 'Etymology'],
            text: etymology,
          },
        ]
      : [],
  }
}

function result(
  provider: SourceProviderId,
  sourceFamily: SourceFamilyId,
  word: string,
  language: LanguageCode,
  url: string,
  groups: WiktionaryEntryGroup[],
  evidenceRole: 'etymology' | 'lexical' = 'etymology'
): SpecialistSourceResult[] {
  if (!groups.length) return []
  if (!groups.some((entry) => entry.sections.length)) evidenceRole = 'lexical'
  return [
    {
      provider,
      sourceFamily,
      evidenceRole,
      data: {
        text: groups.map((entry) => entry.text).join('\n\n'),
        url,
        language,
        sourceFamily,
        evidenceRole,
        requestedWord: word,
        resolvedWord: word,
        entryGroups: groups.map((entry) => ({ ...entry, sourceUrl: entry.sourceUrl ?? url })),
      },
    },
  ]
}

async function page(url: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': 'EtymologyExplorer/1.0 (educational project)' } },
    CONFIG.timeouts.source,
    signal
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Dictionary fetch ${url} failed: HTTP ${response.status}`)
  return response.text()
}

function settledEntryGroups(
  entries: PromiseSettledResult<WiktionaryEntryGroup[]>[],
  links: string[],
  signal?: AbortSignal
): WiktionaryEntryGroup[][] {
  signal?.throwIfAborted()
  return entries.map((entry, index) => {
    if (entry.status === 'fulfilled') return entry.value
    console.warn(
      `[SpecialistSources] Entry fetch failed for ${links[index]}:`,
      safeError(entry.reason)
    )
    return []
  })
}

function trustedLink(href: string | undefined, origin: string, pathPrefix: string): string | null {
  if (!href) return null
  const url = new URL(href, origin)
  return url.origin === origin &&
    url.pathname.startsWith(pathPrefix) &&
    !url.username &&
    !url.password
    ? url.href
    : null
}

async function fetchAhd(word: string, signal?: AbortSignal): Promise<SpecialistSourceResult[]> {
  const url = `https://ahdictionary.com/word/search.html?q=${encodeURIComponent(word)}`
  const html = await page(url, signal)
  if (!html) return []
  const root = elements(html)
  const container = all(root, (node) => node.attributes.id === 'results')[0]
  if (!container) return []
  const groups = all(container, (node) => node.tag === 'table').flatMap((node) => {
    const title = all(node, (child) => hasClass(child, 'rtseg'))[0]
    const bold = title && all(title, (child) => child.tag === 'b')[0]
    if (!bold || !exact(headword(fragment(html, bold)).replace(/·/g, ''), word)) return []
    const id = all(node, (child) => child.tag === 'a' && Boolean(child.attributes.name))[0]
      ?.attributes.name
    if (!id) return []
    const etymology = all(node, (child) => hasClass(child, 'etyseg'))
      .map((child) => plain(fragment(html, child)))
      .join('\n')
    return [group(id, plain(fragment(html, bold)), plain(fragment(html, node)), etymology)]
  })
  return result('americanHeritage', 'americanHeritage', word, 'en', url, groups)
}

async function fetchDeMauro(word: string, signal?: AbortSignal): Promise<SpecialistSourceResult[]> {
  const origin = 'https://dizionario.internazionale.it'
  const url = `${origin}/cerca/${encodeURIComponent(word)}`
  const html = await page(url, signal)
  if (!html) return []
  const links = all(
    elements(html),
    (node) =>
      node.tag === 'a' && (hasClass(node, 'serp-lemma-title') || hasClass(node, 'serp-poli-title'))
  )
    .filter((node) => exact(headword(fragment(html, node)), word))
    .map((node) => trustedLink(node.attributes.href, origin, '/parola/'))
    .filter((link): link is string => Boolean(link))
  const entryLinks = [...new Set(links)]
  const entries = await Promise.allSettled(
    entryLinks.map(async (link) => {
      const entry = await page(link, signal)
      if (!entry) return []
      const root = elements(entry)
      const title = all(root, (node) => node.tag === 'h1').find((node) =>
        exact(headword(fragment(entry, node)), word)
      )
      const lemmaSections = all(root, (node) => node.attributes.id === 'lemma_lemma')
      const etymology = lemmaSections.length > 1 ? lemmaSections.at(-1) : undefined
      const description = all(root, (node) => node.attributes.id === 'descrizione')[0]
      if (!title || !description) return []
      const text = plain(entry.slice(title.start, description.end))
      return [
        group(
          new URL(link).pathname,
          plain(fragment(entry, title)),
          text,
          etymology ? plain(fragment(entry, etymology)) : '',
          link
        ),
      ]
    })
  )
  const groups = settledEntryGroups(entries, entryLinks, signal).flat()
  if (entryLinks.length && !groups.length) {
    const failure = entries.find((entry) => entry.status === 'rejected')
    if (failure) throw failure.reason
    throw new Error(`De Mauro advertised entries could not be read for ${word}`)
  }
  const records = result('deMauro', 'deMauro', word, 'it', url, groups)
  if (groups.length < entryLinks.length) records[0].data.incomplete = true
  return records
}

async function fetchDle(word: string, signal?: AbortSignal): Promise<SpecialistSourceResult[]> {
  const url = `https://dle.rae.es/${encodeURIComponent(word)}`
  const html = await page(url, signal)
  if (!html) return []
  const groups = all(
    elements(html),
    (node) => node.tag === 'article' && exact(node.attributes['data-word'] ?? '', word)
  )
    .map((node) => {
      const id = node.attributes.id
      const etymology = all(node, (child) => child.attributes['data-dle-type'] === '1')
        .map((child) => plain(fragment(html, child)))
        .join('\n')
      return group(
        id,
        `${word} ${node.attributes['data-homonym-index'] ?? ''}`.trim(),
        plain(fragment(html, node)),
        etymology
      )
    })
    .filter((entry) => Boolean(entry.index))
  return result('dle', 'raeAsale', word, 'es', url, groups)
}

async function fetchDamer(word: string, signal?: AbortSignal): Promise<SpecialistSourceResult[]> {
  const url = `https://www.asale.org/damer/${encodeURIComponent(word)}`
  const html = await page(url, signal)
  if (!html) return []
  const groups = all(
    elements(html),
    (node) => node.tag === 'entry' && exact(node.attributes.header ?? '', word)
  ).map((node) =>
    group(node.attributes.id || node.attributes.key, word, plain(fragment(html, node)))
  )
  return result('americanismos', 'raeAsale', word, 'es', url, groups, 'lexical')
}

async function fetchCnrtl(word: string, signal?: AbortSignal): Promise<SpecialistSourceResult[]> {
  const url = `https://www.cnrtl.fr/etymologie/${encodeURIComponent(word)}`
  const html = await page(url, signal)
  if (!html) return []
  const payload = /window\.__PINIA__\s*=\s*([\s\S]*?)<\/script>/i
    .exec(html)?.[1]
    .trim()
    .replace(/;\s*$/, '')
  if (!payload) throw new Error(`CNRTL response missing dictionary payload for ${word}`)
  const state = JSON.parse(payload) as {
    payload?: {
      responses?: Record<
        string,
        { header?: { form?: string }; content?: Array<{ id: string; content: string[] }> }
      >
    }
  }
  const entry = Object.values(state.payload?.responses ?? {}).find((value) =>
    exact(value.header?.form ?? '', word)
  )
  if (!entry) return []
  return (
    [
      ['tlfi', 'tlfi'],
      ['littre', 'littre'],
      ['academie9', 'academieFrancaise'],
    ] as const
  ).flatMap(([id, family]) => {
    const contents = entry.content?.find((item) => item.id === id)?.content ?? []
    const groups = contents.flatMap((content) => {
      if (typeof content !== 'string') return []
      const root = elements(content)
      const article = all(root, (node) =>
        node.attributes.id?.startsWith(
          id === 'tlfi' ? 'TLFI_' : id === 'littre' ? 'LITTRE_' : 'ACA9_'
        )
      )[0]
      const title = article && all(article, (node) => hasClass(node, 's-entry'))[0]
      if (!article || !title) return []
      const etymology = all(article, (node) => hasClass(node, 's-section'))
        .filter((node) => {
          const heading = all(node, (child) => hasClass(child, 's-section-title'))[0]
          return heading && /^Étymologie/i.test(plain(fragment(content, heading)))
        })
        .map((node) => plain(fragment(content, node)))
        .join('\n')
      return [
        group(
          article.attributes.id,
          plain(fragment(content, title)),
          plain(fragment(content, article)),
          etymology
        ),
      ]
    })
    return result(
      id === 'academie9' ? 'academie' : id,
      family,
      word,
      'fr',
      url,
      groups,
      id === 'academie9' ? 'lexical' : 'etymology'
    )
  })
}

async function fetchPriberam(
  word: string,
  signal?: AbortSignal
): Promise<SpecialistSourceResult[]> {
  const url = `https://dicionario.priberam.org/pt-pt/${encodeURIComponent(word)}`
  const html = await page(url, signal)
  if (!html) return []
  const root = elements(html)
  const container = all(root, (node) => node.attributes.id === 'resultados')[0]
  if (!container) return []
  const groups = all(container, (node) => hasClass(node, 'dp-definicao')).flatMap((node, index) => {
    const heading = all(node, (child) => hasClass(child, 'dp-definicao-header'))[0]
    const title = heading && all(heading, (child) => hasClass(child, 'varpt'))[0]
    if (!title || !exact(headword(fragment(html, title)), word)) return []
    // Both locale presentations share an entry. Keep the explicitly selected
    // Portuguese version once, rather than counting duplicate text as evidence.
    let entry = fragment(html, node)
    const duplicates = all(node, (child) => hasClass(child, 'varpb'))
    for (const duplicate of duplicates
      .filter(
        (child) =>
          !duplicates.some(
            (parent) => parent !== child && parent.start < child.start && parent.end >= child.end
          )
      )
      .sort((a, b) => b.start - a.start)) {
      entry = entry.slice(0, duplicate.start - node.start) + entry.slice(duplicate.end - node.start)
    }
    const text = plain(entry)
    const etymology = all(node, (child) => hasClass(child, 'dp-seccao-icon'))
      .map((child) => plain(fragment(html, child)))
      .filter((text) => /^Origem:/i.test(text))
      .join('\n')
    return [
      group(
        `priberam:${canonicalizeWord(word)}:${index + 1}`,
        plain(fragment(html, title)),
        text,
        etymology
      ),
    ]
  })
  return result('priberam', 'priberam', word, 'pt', url, groups)
}

async function fetchMichaelis(
  word: string,
  signal?: AbortSignal
): Promise<SpecialistSourceResult[]> {
  const origin = 'https://michaelis.uol.com.br'
  const url = `${origin}/moderno-portugues/busca/portugues-brasileiro/${encodeURIComponent(word)}/`
  const html = await page(url, signal)
  if (!html) return []
  function extract(html: string, url: string): WiktionaryEntryGroup[] {
    const root = elements(html)
    const node = all(
      root,
      (node) => node.tag === 'div' && hasClass(node, 'verbete') && hasClass(node, 'bs-component')
    )[0]
    const title = node && all(node, (child) => child.tag === 'e1')[0]
    if (!node || !title || !exact(plain(fragment(html, title)), word)) return []
    const text = plain(fragment(html, node))
    const number = all(node, (child) => child.tag === 'ei')[0]
    const id = `${new URL(url).pathname}${number ? `#${plain(fragment(html, number))}` : ''}`
    const etymology = /ETIMOLOGIA\s*([\s\S]*)/i.exec(text)?.[1] ?? ''
    return [group(id, word, text, etymology, url)]
  }
  const groups = extract(html, url)
  if (!groups.length) return []
  const root = elements(html)
  const linksContainer = all(root, (node) => node.attributes.id === 'lista_verbetes_links')[0]
  const links = linksContainer
    ? all(linksContainer, (node) => node.tag === 'a')
        .filter((node) => exact(headword(fragment(html, node)), word))
        .map((node) => trustedLink(node.attributes.href, origin, '/palavra/'))
        .filter((link): link is string => Boolean(link))
    : []
  const entryLinks = [...new Set(links)]
  const entries = await Promise.allSettled(
    entryLinks.map(async (link) => {
      const entry = await page(link, signal)
      return entry ? extract(entry, link) : []
    })
  )
  const siblings = settledEntryGroups(entries, entryLinks, signal)
  groups.push(...siblings.flat())
  const records = result('michaelis', 'michaelis', word, 'pt', url, groups)
  // An advertised exact homograph is part of this lookup even when its source
  // link is malformed or its response cannot be matched. Keep useful entries,
  // but do not allow their absence to become a complete cached dictionary page.
  if (siblings.some((entries) => entries.length === 0)) records[0].data.incomplete = true
  return records
}

/** Central orchestration owns source caching and scheduling against the HTTP budget. */
export const SPECIALIST_PROVIDERS: readonly SpecialistProvider[] = [
  { id: 'americanHeritage', family: 'americanHeritage', languages: ['en'], fetch: fetchAhd },
  { id: 'deMauro', family: 'deMauro', languages: ['it'], fetch: fetchDeMauro },
  { id: 'dle', family: 'raeAsale', languages: ['es'], fetch: fetchDle },
  { id: 'americanismos', family: 'raeAsale', languages: ['es'], fetch: fetchDamer },
  { id: 'cnrtl', family: 'cnrtl', languages: ['fr'], fetch: fetchCnrtl },
  { id: 'priberam', family: 'priberam', languages: ['pt'], fetch: fetchPriberam },
  { id: 'michaelis', family: 'michaelis', languages: ['pt'], fetch: fetchMichaelis },
  { id: 'jmdict', family: 'jmdict', languages: ['ja'], local: true, fetch: fetchJmdict },
  {
    id: 'ninjalHistorical',
    family: 'ninjalHistorical',
    languages: ['ja'],
    local: true,
    fetch: fetchJapaneseHistorical,
  },
]

/**
 * Recovered Académie pages include their original etymology, unlike the CNRTL
 * projection. Extraction services flatten alphabetical navigation into the
 * article, so only the explicit etymology paragraph receives a history scope;
 * the complete recovered document remains available as independent context.
 */
export function parseDiscoveredSpecialist(
  word: string,
  language: LanguageCode,
  document: { url: string; text: string; title?: string }
): SpecialistSourceResult[] {
  if (language !== 'fr') return []
  let url: URL
  try {
    url = new URL(document.url)
  } catch {
    return []
  }
  if (
    url.origin !== 'https://www.dictionnaire-academie.fr' ||
    url.username ||
    url.password ||
    !/^\/article\/A9[A-Z]\d+$/.test(url.pathname)
  )
    return []
  const id = url.pathname.split('/').at(-1)!
  const matchesHeading = (heading: string) =>
    exact(
      heading
        .replace(/^[✻*]\s*/, '')
        .replace(/^[IVXLCDM]+\.\s+/, '')
        .split(',')[0],
      word
    )
  if (/<h2\b/i.test(document.text)) {
    const root = elements(document.text)
    const article = all(root, (node) => node.attributes.id === id && hasClass(node, 's_Article'))[0]
    const container = article ?? root
    const headings = all(container, (node) => node.tag === 'h2')
    if (headings.length !== 1) return []
    const heading = plain(fragment(document.text, headings[0]))
    if (!matchesHeading(heading)) return []
    const etymologies = all(
      container,
      (node) =>
        hasClass(node, 's_zEtym') ||
        (node.tag === 'p' && /^Étymologie\s*:/i.test(plain(fragment(document.text, node))))
    )
    if (etymologies.length !== 1) return []
    const etymology = plain(fragment(document.text, etymologies[0]))
    const text = article ? plain(fragment(document.text, article)) : `${heading}\n${etymology}`
    const records = result('academie', 'academieFrancaise', word, 'fr', url.href, [
      group(id, heading, text, etymology, url.href),
    ])
    // A source-owned article container provides complete entry boundaries.
    // Without it, retain the recovered document as unaligned context only.
    if (!article) records[0].data.text = plain(document.text)
    records[0].data.sourceEntryId = id
    return records
  }
  const headings = [...document.text.matchAll(/^##\s+(.+)$/gm)]
  if (headings.length !== 1) return []
  const heading = headings[0][1].trim()
  if (!matchesHeading(heading)) return []
  const body = document.text.slice(headings[0].index + headings[0][0].length)
  const etymology = /^Étymologie\s*:\s*[^\n]+(?:\n(?!\s*$|#|- )[^\n]+)*/m.exec(body)?.[0].trim()
  if (!etymology) return []
  const records = result('academie', 'academieFrancaise', word, 'fr', url.href, [
    group(id, heading, `${heading}\n${etymology}`, etymology, url.href),
  ])
  records[0].data.text = document.text
  records[0].data.sourceEntryId = id
  return records
}
