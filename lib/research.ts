import { canonicalizeWord } from './orthography'
/**
 * Agentic research module for deep etymology exploration.
 * Conducts multi-source lookups to gather rich context about word origins
 * and constituent roots.
 */

import type {
  LlmUsage,
  LexemeRef,
  ResearchContext,
  ResearchEntryContext,
  RootResearchData,
  SourceRecord,
  StreamEvent,
} from './types'
import {
  parseDictionaryText,
  parseEtymonlineText,
  formatParsedChainsForPrompt,
  type ParsedEtymChain,
} from './etymologyParser'
import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { classifyApiError } from './apiError'
import {
  buildRootExtractionRequest,
  createOpenRouterResponse,
  extractOutputText,
  extractUsage,
} from './openrouterResponses'
import { LANGUAGES, languageFromName, lexicalLanguageName, type LanguageCode } from './languages'
import type { ExaBudgetRedis } from './exaBudget'
import { buildLexicalResearchGraph } from './lexemeGraph'
import { deriveEntryContexts } from './lexemeEntries'
import { SourceFetchBudget } from './sourceFetchBudget'
import { sourceEtymologyAccounts } from './sourceComparison'
import {
  createLexemeResearchSession,
  hasEtymologicalText,
  researchLexemeKey,
  type LexemeResearchSession,
  type LexemeLookupResult,
} from './lexemeResearch'
import {
  mainSourceRecords,
  rootSourceRecords,
  relatedSourceRecords,
  lexicalSourceRecords,
  sourceEvidenceRole,
  sourceSpelling,
} from './researchSources'

export interface RootExtraction {
  roots: string[]
  usage: LlmUsage | null // null when no LLM call was made (or it failed before billing)
}

/**
 * Decide whether the main-word bundle has enough independent evidence to
 * justify synthesis. Curated dictionary/encyclopedia hits can confirm a real
 * word when the two etymology-specific sources miss or are temporarily down;
 * community-only sources are not sufficient on their own.
 */
export function hasCredibleMainSource(context: ResearchContext): boolean {
  const language = context.language ?? 'en'
  return mainSourceRecords(context.mainWord).some((source) => {
    if (source.provider === 'incelsWiki' || source.provider === 'wikidataLexeme') return false
    if (language !== 'en' && ['wiktionary', 'etymonline'].includes(source.provider)) return false
    if (
      source.data.lexicalLanguage &&
      researchLexemeKey({ word: '', language: source.data.lexicalLanguage }) !==
        researchLexemeKey({ word: '', language })
    )
      return false
    return sourceEvidenceRole(source) !== 'context' || source.provider === 'wikipedia'
  })
}

function completeResearch(context: ResearchContext, budget: SourceFetchBudget): ResearchContext {
  if (budget.rateLimited && !hasCredibleMainSource(context)) {
    throw new Error('429: research sources are rate limited')
  }
  context.totalSourcesFetched = budget.attempts
  const records = mainSourceRecords(context.mainWord)
  const hasAccount =
    hasEtymologicalText(records) ||
    Boolean(context.entryContexts?.some((entry) => entry.originReference))
  const mainKey = researchLexemeKey({
    word: context.mainWord.word,
    language: context.language ?? 'en',
  })
  context.originCoverage = {
    hasAccount,
    sources: (context.sourceOutcomes ?? []).flatMap(({ lexeme, source, outcome }) => {
      const main = researchLexemeKey(lexeme) === mainKey
      const reference =
        !main &&
        lexeme.language === 'ja' &&
        source === 'wiktionaryEnglish' &&
        context.entryContexts?.some((e) => e.definitionReference?.word === lexeme.word)
      if (
        (!main && !reference) ||
        [
          'discovery',
          'wikipedia',
          'incelsWiki',
          'jmdict',
          'ninjalHistorical',
          'multilingualDictionary',
          'wikidataLexeme',
        ].includes(source)
      )
        return []
      const contributed = main
        ? hasEtymologicalText(records.filter((r) => r.provider === source))
        : context.entryContexts?.some((e) => e.originReference?.word === lexeme.word)
      return [
        {
          source,
          ...(reference ? { word: lexeme.word } : {}),
          status: outcome.status === 'found' && !contributed ? 'no_evidence' : outcome.status,
        },
      ]
    }),
  }
  if (
    hasCredibleMainSource(context) &&
    (!hasAccount ||
      context.rootResearch.some((root) => !lexicalSourceRecords(rootSourceRecords(root)).length))
  ) {
    context.incompleteResearch = true
  }
  return context
}

function projectMainSources(word: string, sources: SourceRecord[]): ResearchContext['mainWord'] {
  const data = (provider: string) =>
    sources.find((source) => source.provider === provider)?.data ?? null
  return {
    word,
    sources,
    etymonline: data('etymonline'),
    wiktionary: data('wiktionary'),
    wiktionaryEnglish: data('wiktionaryEnglish'),
    wiktionaryNative: data('wiktionaryNative'),
    wikipedia: data('wikipedia'),
    incelsWiki: data('incelsWiki'),
    multilingualDictionary: data('multilingualDictionary'),
    wikidataLexeme: data('wikidataLexeme'),
    dicionarioAberto: data('dicionarioAberto'),
  }
}

function recordLookup(context: ResearchContext, result: LexemeLookupResult): void {
  if (result.incomplete) context.incompleteResearch = true
  context.sourceOutcomes ??= []
  for (const outcome of result.outcomes) {
    if (
      !context.sourceOutcomes.some(
        (existing) =>
          researchLexemeKey(existing.lexeme) === researchLexemeKey(result.lexeme) &&
          existing.source === outcome.source
      )
    ) {
      context.sourceOutcomes.push({ lexeme: result.lexeme, ...outcome })
    }
  }
}

function primarySource(sources: SourceRecord[], language?: LanguageCode): SourceRecord | undefined {
  const find = (provider: string) => sources.find((source) => source.provider === provider)
  return language && LANGUAGES[language].historyPrimary === 'english'
    ? (find('wiktionaryEnglish') ??
        find('wiktionary') ??
        find('wiktionaryNative') ??
        sources.find((source) => sourceEvidenceRole(source) === 'etymology'))
    : !language || language === 'en'
      ? (find('wiktionary') ??
        find('etymonline') ??
        sources.find((source) => sourceEvidenceRole(source) === 'etymology'))
      : ((find('wiktionaryNative')?.data.entryGroups?.length
          ? find('wiktionaryNative')
          : undefined) ??
        find('wiktionaryEnglish') ??
        find('wiktionaryNative') ??
        sources.find((source) => sourceEvidenceRole(source) === 'etymology'))
}

function entryChains(entry: ResearchEntryContext, word: string): ParsedEtymChain[] {
  const parsed =
    entry.source === 'etymonline'
      ? parseEtymonlineText(entry.text, word)
      : parseDictionaryText(entry.text, word, entry.source)
  const identity = {
    historyId: entry.id,
    evidenceScopeId: entry.evidenceScopeId,
    sourceUrl: entry.sourceUrl,
  }
  const relations = (entry.relations ?? []).map((relation) => ({
    source: entry.source,
    provider: entry.source,
    word,
    ...identity,
    subject: relation.subject,
    links: [
      {
        language: lexicalLanguageName(relation.target.language),
        form: relation.target.word,
        relation: relation.relation,
        rawSnippet: relation.snippet,
        isReconstructed:
          relation.target.word.startsWith('*') || relation.target.language.startsWith('Proto-'),
      },
    ],
  }))
  return [...(parsed.links.length ? [{ ...parsed, ...identity }] : []), ...relations]
}

/** Source-local groups define histories; other publishers remain independent context. */
function scopeHistories(context: ResearchContext): void {
  const language = context.language ?? 'en'
  const word = context.mainWord.word
  const sources = mainSourceRecords(context.mainWord)
  const titles = [...new Set([word, ...sources.map((source) => sourceSpelling(source, word))])]
  const entries: ResearchEntryContext[] = []
  const chains: ParsedEtymChain[] = []
  for (const title of titles) {
    const records = sources.filter((source) => sourceSpelling(source, word) === title)
    const primary =
      primarySource(records, language) ??
      lexicalSourceRecords(records).find(
        (source) => titles.length === 1 || source.provider !== 'wikidataLexeme'
      )
    if (!primary) continue
    const histories = deriveEntryContexts(
      title,
      language,
      primary.provider,
      primary.data,
      title === word ? (context.mainWord.wikidataLexeme ?? null) : null
    )
    const redirects =
      primary.data.variants?.filter((variant) => variant.relationship === 'redirect') ?? []
    if (histories.length === 1 && redirects.length === 1) {
      histories[0].entryKind = 'form'
      histories[0].formOf = { word: redirects[0].word, language }
    }
    for (const entry of histories) {
      if (title !== word) {
        // Source-local anchors can be identical on two differently cased pages.
        entry.id += ':initial-capital'
        entry.evidenceScopeId += ':initial-capital'
      }
      if (titles.length > 1) entry.sourceTitle = title
      entries.push(entry)
      if (sourceEvidenceRole(primary) === 'etymology') chains.push(...entryChains(entry, title))
    }
  }
  // A secondary dictionary can attest a spelling even when the primary
  // independently defines it. Only the primary can retire its own history.
  const retired = new Set<string>()
  for (const record of sources) {
    if (record.data.incomplete) continue
    const title = sourceSpelling(record, word)
    for (const group of record.data.entryGroups ?? []) {
      const form = group.caseForm
      if (!form) continue
      const targets = entries.filter(
        (e) =>
          e.sourceTitle === form.target &&
          !e.caseForm?.only &&
          sources.some(
            (s) =>
              s.provider === e.source &&
              !s.data.incomplete &&
              sourceSpelling(s, word) === form.target &&
              sourceEvidenceRole(s) !== 'context'
          )
      )
      if (!targets.length) continue
      const matchingPos = targets.filter(
        (e) =>
          e.source === record.provider &&
          e.sectionHeadings.some((heading) => form.headings.includes(heading))
      )
      const destinations = matchingPos.length ? matchingPos : targets
      const donor = entries.find(
        (e) => e.sourceTitle === title && e.sourceUrl === record.data.url && e.caseForm === form
      )
      // Scope a secondary dictionary's independent definitions to this title
      // only when it has a single history. The metadata supplies meanings only.
      const owners = entries.filter((entry) => entry.sourceTitle === title)
      const owner = donor ?? (owners.length === 1 ? owners[0] : undefined)
      if (owner && form.independent?.length)
        owner.independentDefinitions = [
          ...(owner.independentDefinitions ?? []),
          ...form.independent,
        ]
      const only = donor && form.only && !donor.etymologyText && !donor.relations?.length
      if (only) retired.add(donor.id)
      for (const dest of destinations) {
        const variants = (dest.spellingVariants ??= [])
        if (
          !variants.some(
            (v) =>
              v.sourceUrl === record.data.url &&
              v.previousHistoryId === (only ? donor.id : undefined)
          )
        )
          variants.push({
            word: title,
            sourceUrl: record.data.url,
            ...(only ? { previousHistoryId: donor.id } : {}),
            ...(destinations.length > 1 ? { entryOnly: true } : {}),
          })
      }
    }
  }
  if (!entries.length) {
    const fallback =
      sources.find((s) => s.provider === 'wikipedia') ??
      sources.find((s) => s.provider === 'multilingualDictionary') ??
      lexicalSourceRecords(sources)[0]
    entries.push({
      id: `history:${language}:${encodeURIComponent(word)}:unresolved`,
      evidenceScopeId: `scope:${language}:${encodeURIComponent(word)}:unresolved`,
      source: fallback?.provider ?? 'multilingualDictionary',
      heading: word,
      text: fallback?.data.text ?? '',
      sectionHeadings: [],
      sourceUrl: fallback?.data.url ?? '',
      entryKind: 'unresolved',
    })
  }
  // A second publisher may have supplied substantive definitions for a title
  // whose primary dictionary contains only a spelling reference.
  for (const entry of entries) if (entry.independentDefinitions?.length) retired.delete(entry.id)
  context.entryContexts = entries.filter((entry) => !retired.has(entry.id))
  context.parsedChains = chains.filter((chain) => !chain.historyId || !retired.has(chain.historyId))
  context.lexicalGraph = buildLexicalResearchGraph(
    word,
    language,
    context.entryContexts,
    context.parsedChains
  )
}

export function scopeEnglishHistories(context: ResearchContext): void {
  scopeHistories(context)
}

/** Components describe their own lexemes, never attest the phrase's history. */
export function phraseComponents(word: string, language: LanguageCode): string[] {
  const particles = new Set(LANGUAGES[language].particles)
  if (!/\s/u.test(word)) return []
  return [...new Set(word.split(/\s+/u).map(canonicalizeWord))]
    .filter((part) => part.length > 1 && !particles.has(part))
    .slice(0, CONFIG.maxRootsToExplore)
}

interface ExpansionCandidate {
  lexeme: LexemeRef
  relationship: NonNullable<RootResearchData['relationship']>
  parentWord?: string
  parentHistoryId?: string
  evidenceScopeId?: string
  sourceUrl?: string
}

function rootLookup(result: LexemeLookupResult, candidate: ExpansionCandidate): RootResearchData {
  const data = (provider: string) =>
    result.sources.find((source) => source.provider === provider)?.data ?? null
  return {
    root: candidate.lexeme.word,
    lexeme: candidate.lexeme,
    sources: result.sources,
    relationship: candidate.relationship,
    parentHistoryId: candidate.parentHistoryId,
    variantOf:
      candidate.relationship === 'spelling-variant' || candidate.relationship === 'redirect'
        ? {
            word: candidate.parentWord ?? candidate.lexeme.word,
            language: candidate.lexeme.language,
          }
        : undefined,
    relationshipSourceUrl: candidate.sourceUrl,
    evidenceScopeId:
      candidate.evidenceScopeId ??
      `scope:${researchLexemeKey(candidate.lexeme)}:${candidate.relationship}:${candidate.parentHistoryId ?? 'independent'}`,
    etymonlineData: data('etymonline'),
    wiktionaryData: data('wiktionary') ?? data('wiktionaryEnglish'),
    wiktionaryEnglish: data('wiktionaryEnglish'),
    wiktionaryNative: data('wiktionaryNative'),
    relatedTerms: [],
  }
}

/** The first four unique attested ancestors retain every source-history attachment. */
export function ancestorCandidates(context: ResearchContext): ExpansionCandidate[] {
  const selected = new Map<string, ExpansionCandidate[]>()
  const mainKey = researchLexemeKey({
    word: context.mainWord.word,
    language: context.language ?? 'en',
  })
  for (const chain of context.parsedChains ?? [])
    for (const link of chain.links) {
      const lexeme = { word: link.form, language: link.language }
      const key = researchLexemeKey(lexeme)
      if (link.isReconstructed || key === mainKey) continue
      if (!selected.has(key) && selected.size >= CONFIG.maxRootsToExplore) continue
      const bindings = selected.get(key) ?? []
      if (
        !bindings.some(
          (candidate) =>
            candidate.parentHistoryId === chain.historyId &&
            candidate.evidenceScopeId === chain.evidenceScopeId
        )
      ) {
        bindings.push({
          lexeme,
          relationship: link.relation === 'compound_from' ? 'component' : 'root',
          parentHistoryId: chain.historyId,
          evidenceScopeId: chain.evidenceScopeId,
          sourceUrl: chain.sourceUrl,
        })
      }
      selected.set(key, bindings)
    }
  return [...selected.values()].flat()
}

/** A source-attested target does not identify one of several homonymous histories. */
function bindContinuation(
  context: ResearchContext,
  candidate: ExpansionCandidate,
  result: LexemeLookupResult,
  discovered: ExpansionCandidate[]
): void {
  const parent = context.entryContexts?.find((entry) => entry.id === candidate.parentHistoryId)
  if (!parent) return
  const directTarget =
    parent.formOf && researchLexemeKey(parent.formOf) === researchLexemeKey(result.lexeme)
  const attested = context.parsedChains?.some(
    (chain) =>
      chain.historyId === parent.id &&
      candidate.evidenceScopeId &&
      chain.evidenceScopeId === candidate.evidenceScopeId &&
      chain.links.some(
        (link) =>
          researchLexemeKey({ word: link.form, language: link.language }) ===
          researchLexemeKey(result.lexeme)
      )
  )
  if (!directTarget && !attested) return
  const primary = primarySource(result.sources, languageFromName(result.lexeme.language))
  if (
    !primary ||
    sourceEvidenceRole(primary) !== 'etymology' ||
    primary.data.entryGroups?.length !== 1
  )
    return
  if (
    [primary.data.requestedWord, primary.data.resolvedWord].some(
      (word) => word && canonicalizeWord(word) !== canonicalizeWord(result.lexeme.word)
    ) ||
    (primary.data.lexicalLanguage &&
      lexicalLanguageName(primary.data.lexicalLanguage) !==
        lexicalLanguageName(result.lexeme.language))
  )
    return
  const group = primary.data.entryGroups[0]
  if (!directTarget && group.relations?.some((relation) => relation.relation === 'compound_from'))
    return
  const language = languageFromName(result.lexeme.language)
  if (
    language &&
    deriveEntryContexts(result.lexeme.word, language, primary.provider, primary.data, null)
      .length !== 1
  )
    return
  const scope = `scope:continuation:${researchLexemeKey(result.lexeme)}:${primary.provider}:${group.anchor}`
  if (
    context.parsedChains?.some(
      (chain) => chain.historyId === parent.id && chain.evidenceScopeId === scope
    )
  )
    return
  const entry: ResearchEntryContext = {
    id: parent.id,
    source: primary.provider,
    heading: group.heading,
    text: group.text,
    relations: group.relations,
    etymologyText: group.etymologyText,
    sectionHeadings: group.sections.map((section) => section.heading),
    evidenceScopeId: scope,
    sourceUrl: group.sourceUrl ?? primary.data.url,
    entryKind: 'lemma',
  }
  const chains = entryChains(entry, result.lexeme.word).map((chain) => ({
    ...chain,
    subject: chain.subject ?? result.lexeme,
  }))
  context.parsedChains = [...(context.parsedChains ?? []), ...chains]
  if (directTarget) {
    for (const chain of chains)
      for (const link of chain.links) {
        if (link.relation !== 'compound_from' || link.isReconstructed) continue
        discovered.push({
          lexeme: { word: link.form, language: link.language },
          relationship: 'component',
          parentHistoryId: parent.id,
          evidenceScopeId: scope,
          sourceUrl: entry.sourceUrl,
        })
      }
  }
}

export async function expandLexemes(
  context: ResearchContext,
  budget: SourceFetchBudget,
  signal?: AbortSignal,
  session: LexemeResearchSession = createLexemeResearchSession({ budget, signal })
): Promise<void> {
  const language = context.language ?? 'en'
  const word = context.mainWord.word
  const history = context.entryContexts?.length === 1 ? context.entryContexts[0] : undefined
  if (language === 'ja') {
    const references = (context.entryContexts ?? []).filter((entry) => entry.definitionReference)
    const words = [...new Set(references.map((entry) => entry.definitionReference!.word))].slice(
      0,
      CONFIG.maxRootsToExplore
    )
    for (const target of words) {
      if (target === word) continue
      const result = await session.lookup(
        { word: target, language },
        { progressLanguage: language, skipOptionalSources: true }
      )
      recordLookup(context, result)
      const source = result.sources.find(
        (s) => s.provider === 'wiktionaryEnglish' && s.data.resolvedWord === target
      )
      if (!source || source.data.incomplete) continue
      for (const entry of references) {
        const ref = entry.definitionReference!
        if (ref.word !== target) continue
        const matches = source.data.entryGroups?.filter((g) =>
          g.sections.some(
            (s) =>
              s.heading === ref.heading &&
              s.japaneseDefinitions?.some(
                (d) =>
                  d.readings.includes(word) &&
                  d.glosses.some((gloss) => ref.glosses.includes(gloss))
              )
          )
        )
        if (matches?.length !== 1 || !matches[0].etymologyText) continue
        const group = matches[0]
        const url = `${source.data.url}#${encodeURIComponent(group.anchor)}`
        entry.etymologyText = group.etymologyText
        entry.originReference = { word: target, url }
        entry.text += `\n${target} (${group.heading}): ${group.etymologyText}`
        const chains = entryChains(
          {
            ...entry,
            sourceUrl: url,
            text: group.etymologyText!,
            relations: group.relations
              ?.filter(
                (r) =>
                  r.subject.word === target &&
                  lexicalLanguageName(r.subject.language) === 'Japanese'
              )
              .map((r) => ({ ...r, subject: { word, language } })),
          },
          word
        )
        context.parsedChains = [...(context.parsedChains ?? []), ...chains]
      }
    }
  }
  const seen = new Set([researchLexemeKey({ word, language })])
  const variants = mainSourceRecords(context.mainWord).flatMap(
    (source) => source.data.variants ?? []
  )
  const ancestors = ancestorCandidates(context)
  context.identifiedRootLexemes = [
    ...new Map(
      ancestors.map((candidate) => [researchLexemeKey(candidate.lexeme), candidate.lexeme])
    ).values(),
  ]

  const fetchWave = async (candidates: ExpansionCandidate[]): Promise<ExpansionCandidate[]> => {
    const admitted = candidates.filter((candidate) => {
      if (researchLexemeKey(candidate.lexeme) === researchLexemeKey({ word, language }))
        return false
      return !context.rootResearch.some(
        (existing) =>
          existing.lexeme &&
          researchLexemeKey(existing.lexeme) === researchLexemeKey(candidate.lexeme) &&
          existing.relationship === candidate.relationship &&
          existing.parentHistoryId === candidate.parentHistoryId &&
          existing.variantOf?.word ===
            (candidate.relationship === 'redirect' || candidate.relationship === 'spelling-variant'
              ? candidate.parentWord
              : undefined)
      )
    })
    const newlyDiscovered = new Set(
      admitted
        .filter((candidate) => !seen.has(researchLexemeKey(candidate.lexeme)))
        .map((candidate) => researchLexemeKey(candidate.lexeme))
    )
    const unique = [
      ...new Map(
        admitted.map((candidate) => [researchLexemeKey(candidate.lexeme), candidate.lexeme])
      ).values(),
    ]
    unique.forEach((lexeme) => seen.add(researchLexemeKey(lexeme)))
    const results = await session.lookupMany(unique, {
      progressLanguage: language,
      skipOptionalSourcesFor: (lexeme) =>
        admitted
          .filter((candidate) => researchLexemeKey(candidate.lexeme) === researchLexemeKey(lexeme))
          .every((candidate) => candidate.relationship === 'root'),
    })
    const byKey = new Map(results.map((result) => [researchLexemeKey(result.lexeme), result]))
    results.forEach((result) => recordLookup(context, result))
    const discovered: ExpansionCandidate[] = []
    for (const candidate of admitted) {
      const result = byKey.get(researchLexemeKey(candidate.lexeme))!
      context.rootResearch.push(rootLookup(result, candidate))
      bindContinuation(context, candidate, result, discovered)
      if (!newlyDiscovered.has(researchLexemeKey(candidate.lexeme))) continue
      for (const variant of result.sources.flatMap((source) => source.data.variants ?? [])) {
        discovered.push({
          lexeme: { word: variant.word, language: candidate.lexeme.language },
          relationship: variant.relationship,
          parentWord: candidate.lexeme.word,
          parentHistoryId: candidate.parentHistoryId,
          sourceUrl: variant.url,
        })
      }
    }
    return discovered
  }
  const initial: ExpansionCandidate[] = [
    ...ancestors,
    ...variants.slice(0, CONFIG.maxRootsToExplore).map((variant) => ({
      lexeme: { word: variant.word, language },
      relationship: variant.relationship,
      parentWord: word,
      parentHistoryId: history?.id,
      sourceUrl: variant.url,
    })),
    ...phraseComponents(word, language).map((component) => ({
      lexeme: { word: component, language },
      relationship: 'component' as const,
    })),
  ]
  // One wave interleaves general and specialist providers across each lexical purpose.
  const discovered = await fetchWave(initial)
  const linkedKeys = new Set<string>()
  const linked = discovered.filter((candidate) => {
    const key = researchLexemeKey(candidate.lexeme)
    if (!linkedKeys.has(key) && linkedKeys.size >= CONFIG.maxRootsToExplore) return false
    linkedKeys.add(key)
    return true
  })
  await fetchWave(linked)
  context.lexicalGraph = buildLexicalResearchGraph(
    word,
    language,
    context.entryContexts ?? [],
    context.parsedChains ?? []
  )
  signal?.throwIfAborted()
}

export async function extractRootsQuick(
  word: string,
  etymonlineText: string | null,
  wiktionaryText: string | null,
  signal?: AbortSignal
): Promise<RootExtraction> {
  const sourceText = [etymonlineText, wiktionaryText]
    .filter((text): text is string => Boolean(text))
    .map((text) => sanitizeSourceText(text))
    .join('\n\n')

  if (!sourceText) {
    return { roots: [], usage: null }
  }

  const prompt = `Analyze this etymology data and extract the ETYMOLOGICAL root morphemes of the word "${word}".

Rules:
- Preserve all accents, vowel-length marks, modifier letters and affix hyphens exactly as supplied by the source. Never replace a historical form with a similarly spelled modern word.
- Extract roots that carry independent meaning and have their own etymology worth researching.
- Include prefixes only when they are productive and meaningfully change the word (for example, "contra-" in "contradict").
- Exclude inflectional or low-signal suffixes such as -ed, -ing, -ly, -tion, -ible, and -ous unless the source data makes them etymologically central.
- For single-morpheme words with no compound structure, return just the word itself.

Source data:
${sourceText}

Return ONLY a JSON object with a "roots" array of root strings (the actual morphemes, not full words).
Examples:
- For "telephone": ["tele", "phone"]
- For "autobiography": ["auto", "bio", "graph"]
- For "incredible": ["cred"]
- For "contradict": ["contra", "dict"]
- For "cat": ["cat"]

Return the JSON object only, no explanation:`

  let response
  try {
    const request = buildRootExtractionRequest(prompt)
    request.instructions =
      'Extract root morphemes only. Return {"roots":["root"]} with lowercase strings and no commentary.'

    response = await createOpenRouterResponse(request, CONFIG.timeouts.rootExtraction, signal)
  } catch (error) {
    if (signal?.aborted || classifyApiError(error).status === 422) throw error
    console.error('Root extraction error:', safeError(error))
    const usage =
      error && typeof error === 'object' && 'usage' in error
        ? (error as { usage?: LlmUsage }).usage
        : undefined
    return { roots: [], usage: usage ?? null }
  }

  // The call was billed even if the output is unusable — always report usage.
  const usage = extractUsage(response)
  try {
    return { roots: parseRootsArray(extractOutputText(response)), usage }
  } catch (error) {
    if (classifyApiError(error).status === 422) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { usage })
    }
    console.error('Root extraction error:', safeError(error))
    return { roots: [], usage }
  }
}

/**
 * Parse a JSON array of roots from LLM response
 */
function parseRootsArray(text: string): string[] {
  const normalizeRoots = (parsed: unknown): string[] => {
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as { roots?: unknown }).roots)
    ) {
      return normalizeRoots((parsed as { roots: unknown[] }).roots)
    }

    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(canonicalizeWord)
      .slice(0, CONFIG.maxRootsToExplore)
  }

  try {
    return normalizeRoots(JSON.parse(text))
  } catch {
    const jsonMatch = text.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) return []

    try {
      return normalizeRoots(JSON.parse(jsonMatch[0]))
    } catch {
      return []
    }
  }
}

const TERM_PATTERN = /[\p{L}*][\p{L}\p{M}\p{N}*'’ʼ‐‑.-]*/gu
const LOW_SIGNAL_TERMS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'word',
  'latin',
  'greek',
  'english',
  'french',
  'german',
  'middle',
  'old',
  'ancient',
  'proto',
  'indo-european',
])

/**
 * Inflectional suffixes and formula noise words that are not worth a
 * dedicated root-research fetch (mirrors the LLM extraction prompt rules).
 * The last row catches structural words that leak out of derivation
 * formulas like "from ne 'not' + stem of scire".
 */
const LOW_SIGNAL_AFFIXES = new Set([
  's',
  'es',
  'ed',
  'en',
  'ing',
  'ly',
  'er',
  'est',
  'y',
  'ie',
  'ness',
  'ment',
  'tion',
  'sion',
  'ible',
  'able',
  'ous',
  'al',
  'ish',
  'ity',
  'root',
  'stem',
  'word',
  'form',
  'prefix',
  'suffix',
])

/**
 * Matches explicit derivation formulas in source text, e.g.
 *   "From doom +\u200E scrolling"
 *   "equivalent to in- +\u200E credible"
 *   "By surface analysis, tele- +\u200E -phone"
 *   "derived from tele- (prefix meaning 'from a distance') +\u200E -phone"
 *   'from télé- "far" (see tele- ) + phōnē "sound, voice"'
 * Each morpheme may carry parenthetical or quoted gloss annotations before
 * the "+". Wiktionary inserts U+200E LEFT-TO-RIGHT MARK after "+" — strip
 * it before matching (the callers do this via extractDerivationParts).
 */
const FORMULA_ANNOTATION = /\([^)]*\)|"[^"]*"|“[^”]*”/
const DERIVATION_FORMULA_PATTERN = new RegExp(
  String.raw`\b(?:from|equivalent to|modelled after|modeled after|surface analysis[,:]?|compound of)` +
    String.raw`\s+((?:[\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+(?:\s*(?:${FORMULA_ANNOTATION.source}))*\s*\+\s*)+[\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)`,
  'giu'
)

/**
 * Extract the individual morphemes of every "X + Y (+ Z)" derivation formula
 * in the text, stripping gloss annotations. Returns raw parts — callers
 * normalize/filter them.
 */
function extractDerivationParts(text: string): string[] {
  const cleaned = text.normalize('NFC').replace(/[\u200E\u200F]/g, '')
  const annotations = new RegExp(FORMULA_ANNOTATION.source, 'gu')
  const parts: string[] = []
  for (const match of cleaned.matchAll(DERIVATION_FORMULA_PATTERN)) {
    for (const part of match[1].split(/\s*\+\s*/)) {
      const bare = part.replace(annotations, ' ').trim()
      if (bare) parts.push(bare)
    }
  }
  return parts
}

/**
 * Normalize a raw CPU root candidate without changing lexical marks or
 * affix boundaries. Source page titles must not determine root spelling.
 * Reject reconstructed forms, the word itself, and inflectional suffixes.
 */
function normalizeRootCandidate(term: string, word: string): string | null {
  const normalized = canonicalizeWord(term)
    .replace(/[\u200E\u200F]/g, '')
    .replace(/^[.,;:]+/, '')
    .replace(/[.,;:]+$/, '')
    .trim()

  if (!normalized || normalized.includes('*')) return null
  if (/\s/.test(normalized)) return null
  if (normalized.length < 2) return null
  if (normalized === word) return null
  if (LOW_SIGNAL_AFFIXES.has(normalized.replace(/^[-‐‑]+|[-‐‑]+$/g, ''))) return null
  return normalized
}

/**
 * CPU-only root extraction: derivation formulas ("From X + Y",
 * "equivalent to X + Y") plus hyphen-marked affix morphemes from the
 * pre-parsed chains. When this finds at least one root, the LLM
 * extraction call is skipped entirely.
 */
export function extractRootsCpu(
  word: string,
  etymonlineText: string | null,
  wiktionaryText: string | null,
  parsedChains: ParsedEtymChain[]
): string[] {
  const normalizedWord = canonicalizeWord(word)
  const combinedText = [etymonlineText, wiktionaryText].filter(Boolean).join('\n')
  const candidates = extractDerivationParts(combinedText)

  for (const chain of parsedChains) {
    for (const link of chain.links) {
      if (link.isReconstructed) continue
      const form = link.form.replace(/[\u200E\u200F]/g, '')
      // Affix notation ("tele-", "-phone") marks a morpheme worth researching
      if (/^[-‐‑]\p{L}/u.test(form) || /[\p{L}\p{M}][-‐‑]$/u.test(form)) {
        candidates.push(form)
      }
    }
  }

  const roots: string[] = []
  for (const candidate of candidates) {
    const normalized = normalizeRootCandidate(candidate, normalizedWord)
    if (normalized && !roots.includes(normalized)) {
      roots.push(normalized)
    }
  }

  return roots.slice(0, CONFIG.maxRootsToExplore)
}

function normalizeCandidateTerm(term: string): string | null {
  const normalized = canonicalizeWord(term).replace(/[.,;:()]+$/g, '')
  if (!normalized) return null
  if (LOW_SIGNAL_TERMS.has(normalized)) return null
  if (normalized.length < 3 && !normalized.startsWith('*')) return null
  return normalized
}

/**
 * Extract related terms mentioned in source text
 */
export function extractRelatedTerms(
  text: string,
  excludeWords: string[],
  seedTerms: string[] = []
): string[] {
  const patterns = [
    /related to ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /cognate with ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /see also ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /compare ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /akin to ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /ultimately (?:derived )?from [^.\n;:]*?([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /borrowed from [^.\n;:]*?([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /derived from [^.\n;:]*?([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /inherited from [^.\n;:]*?([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /from (\w+) ["']([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)["']/giu,
  ]

  const scores = new Map<string, number>()
  const excludeLower = new Set(excludeWords.map(canonicalizeWord))

  const addCandidate = (term: string, score: number) => {
    const normalized = normalizeCandidateTerm(term)
    if (!normalized || excludeLower.has(normalized)) return
    scores.set(normalized, (scores.get(normalized) ?? 0) + score)
  }

  for (const term of seedTerms) {
    addCandidate(term, 5)
  }

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      for (const candidate of match.slice(1).filter(Boolean)) {
        for (const token of candidate.match(TERM_PATTERN) ?? []) {
          addCandidate(token, 3)
        }
      }
    }
  }

  // Derivation formulas ("From X + Y", "equivalent to X + Y") are high-signal
  for (const part of extractDerivationParts(text)) {
    const trimmed = canonicalizeWord(part)
    if (LOW_SIGNAL_AFFIXES.has(trimmed.replace(/^[-‐‑]+|[-‐‑]+$/g, ''))) continue
    addCandidate(trimmed, 4)
  }

  for (const match of text.matchAll(/\*[\p{L}\d₀-₉ʰʷʸ'-]+/gu)) {
    addCandidate(match[0], 4)
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([term]) => term)
    .slice(0, CONFIG.maxRelatedWordsPerRoot)
}

function emitProgress(callback: ((event: StreamEvent) => void) | undefined, event: StreamEvent) {
  if (!callback) return
  try {
    callback(event)
  } catch (error) {
    console.error('[Research] Progress callback error:', safeError(error))
  }
}

/** All lexical purposes use the same language-aware source plan and shared HTTP budget. */
export async function conductAgenticResearch(
  word: string,
  options?: {
    skipOptionalSources?: boolean
    signal?: AbortSignal
    language?: LanguageCode
    exaBudgetClient?: ExaBudgetRedis | null
    session?: LexemeResearchSession
    budget?: SourceFetchBudget
  },
  onProgress?: (event: StreamEvent) => void
): Promise<ResearchContext> {
  const budget =
    options?.budget ??
    options?.session?.getBudget() ??
    new SourceFetchBudget(CONFIG.maxTotalFetches)
  if (options?.session && options.budget && options.session.getBudget() !== options.budget)
    throw new Error('Research session and source budget must share the same counter')
  const normalizedWord = canonicalizeWord(word)
  const language = options?.language ?? 'en'
  const signal = options?.signal ?? options?.session?.signal
  const progress = onProgress
    ? (event: StreamEvent) => onProgress({ ...event, language } as StreamEvent)
    : undefined
  const session =
    options?.session ??
    createLexemeResearchSession({
      budget,
      signal,
      onProgress: progress,
      exaBudgetClient: options?.exaBudgetClient,
    })
  const context: ResearchContext = {
    language,
    mainWord: projectMainSources(normalizedWord, []),
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: 0,
    rawSources: {},
  }
  let rootWork: Promise<string[]> | undefined
  try {
    const identifyRoots = async (): Promise<string[]> => {
      const entries = context.entryContexts ?? []
      const parsed = context.parsedChains ?? []
      if (language !== 'en') return []
      const cpu = [
        ...new Set([
          ...phraseComponents(normalizedWord, language),
          ...extractRootsCpu(normalizedWord, context.mainWord.etymonline?.text ?? null, null, []),
          ...entries.flatMap((entry) =>
            extractRootsCpu(
              normalizedWord,
              entry.text,
              null,
              parsed.filter((chain) => chain.historyId === entry.id)
            )
          ),
        ]),
      ].slice(0, CONFIG.maxRootsToExplore)
      let roots = cpu
      if (
        !cpu.length &&
        entries.length === 1 &&
        lexicalSourceRecords(mainSourceRecords(context.mainWord)).some(
          (source) => sourceEvidenceRole(source) === 'etymology'
        )
      ) {
        const extracted = await extractRootsQuick(normalizedWord, entries[0].text, null, signal)
        roots = extracted.roots
        if (extracted.usage) context.llmUsage = extracted.usage
      }
      context.identifiedRoots = roots
      emitProgress(progress, { type: 'roots_identified', roots })
      return roots
    }
    const main = await session.lookup(
      { word: normalizedWord, language },
      {
        primary: true,
        progressLanguage: language,
        skipOptionalSources: options?.skipOptionalSources,
        onCore(sources) {
          if (!sources.length) return
          context.mainWord = projectMainSources(normalizedWord, sources)
          scopeHistories(context)
          rootWork = identifyRoots()
          void rootWork.catch(() => {})
        },
      }
    )
    context.mainWord = projectMainSources(normalizedWord, main.sources)
    recordLookup(context, main)
    scopeHistories(context)
    context.rawSources = {
      wikipedia: context.mainWord.wikipedia?.text,
      dateAttested: context.parsedChains?.find((chain) => chain.dateAttested)?.dateAttested,
    }
    emitProgress(progress, {
      type: 'parsing_complete',
      chainCount: context.parsedChains?.length ?? 0,
    })
    rootWork ??= identifyRoots()
    const [identifiedRoots] = await Promise.all([
      rootWork,
      expandLexemes(context, budget, signal, session),
    ])
    if (language !== 'en') {
      context.identifiedRoots = context.identifiedRootLexemes?.map((lexeme) => lexeme.word) ?? []
      emitProgress(progress, { type: 'roots_identified', roots: context.identifiedRoots })
    }
    const rootsToFetch = identifiedRoots
      .filter(
        (root) =>
          root !== normalizedWord &&
          root.length > 1 &&
          !context.rootResearch.some(
            (existing) => canonicalizeWord(existing.root) === canonicalizeWord(root)
          )
      )
      .slice(0, CONFIG.maxRootsToExplore)
    const extraRoots = await session.lookupMany(
      rootsToFetch.map((root) => ({ word: root, language })),
      { progressLanguage: language }
    )
    for (const result of extraRoots) {
      recordLookup(context, result)
      const owners = (context.entryContexts ?? []).filter((entry) =>
        extractRootsCpu(normalizedWord, entry.text, null, []).includes(result.lexeme.word)
      )
      const bindings = owners.length ? owners : [undefined]
      for (const owner of bindings)
        context.rootResearch.push(
          rootLookup(result, {
            lexeme: result.lexeme,
            relationship: 'root',
            parentHistoryId: owner?.id,
          })
        )
      emitProgress(progress, {
        type: 'root_research',
        root: result.lexeme.word,
        source: result.sources.map((source) => source.provider).join('+'),
        status: lexicalSourceRecords(result.sources).length ? 'complete' : 'failed',
      })
    }
    if (language === 'en') {
      const sources = mainSourceRecords(context.mainWord)
      const relatedTerms = extractRelatedTerms(
        sources.map((source) => source.data.text).join('\n'),
        [normalizedWord, ...context.rootResearch.map((root) => root.root)],
        sources.flatMap((source) => source.data.relatedEntries ?? [])
      )
      const related = await session.lookupMany(
        relatedTerms.map((term) => ({ word: term, language })),
        { progressLanguage: language }
      )
      for (const result of related) {
        recordLookup(context, result)
        context.relatedResearch.push({
          term: result.lexeme.word,
          lexeme: result.lexeme,
          sources: result.sources,
          etymonlineData:
            result.sources.find((source) => source.provider === 'etymonline')?.data ?? null,
        })
      }
    }
    signal?.throwIfAborted()
    return completeResearch(context, budget)
  } catch (error) {
    // Root extraction overlaps source work. Await it even when a sibling fails so every billed
    // call is visible to the route's error accounting before research rejects.
    let rootError: unknown
    if (rootWork)
      await rootWork.catch((failure) => {
        rootError = failure
      })
    const usage =
      context.llmUsage ??
      (rootError && typeof rootError === 'object' && 'usage' in rootError
        ? (rootError as { usage?: LlmUsage }).usage
        : undefined)
    if (usage) {
      const failure = error instanceof Error ? error : new Error(String(error))
      Object.assign(failure, { usage })
      throw failure
    }
    throw error
  }
}

/**
 * Sanitize source text for safe embedding inside <source_data> XML tags.
 * Strips XML tags, control characters, and Unicode directional overrides
 * to prevent prompt injection via source data.
 */
function sanitizeSourceText(text: string): string {
  let sanitized = text
  // Strip ALL XML-like tags
  sanitized = sanitized.replace(/<\/?[a-zA-Z][^>]*>/g, '')
  // Neutralize control characters (U+0000–U+001F except \n \t)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  // Neutralize Unicode directional overrides
  sanitized = sanitized.replace(/[\u200E\u200F\u202A-\u202E]/g, '')
  return sanitized
}

/**
 * Build a rich prompt from research context for final synthesis.
 * Source data is wrapped in <source_data> XML tags for prompt injection
 * defense. Full source content and parsed evidence are retained.
 */
export function buildResearchPrompt(context: ResearchContext): string {
  const sections: string[] = [
    'Research components and variants independently. Component origins do not prove the whole phrase history. Preserve the requested query spelling.',
    'Wikipedia, community sources, and sources marked context provide context only. They cannot independently establish an ancestor or ancestry edge. Sources marked lexical supply senses, forms, or pronunciation only; never infer ancestry from a definition.',
  ]
  const appendSources = (sources: SourceRecord[]) => {
    for (const source of sources) {
      sections.push(
        `\n<source_data name="${source.provider}" evidence_role="${sourceEvidenceRole(source)}" source_family="${source.sourceFamily}">\n${sanitizeSourceText(source.data.text)}\n</source_data>`
      )
      sections.push(
        `Source identity: ${sanitizeSourceText(
          JSON.stringify({
            requestedWord: source.data.requestedWord,
            resolvedWord: source.data.resolvedWord,
            lexicalLanguage: source.data.lexicalLanguage,
            url: source.data.url,
            variants: source.data.variants,
            retrieval: source.data.retrieval,
            incomplete: source.data.incomplete,
          })
        )}`
      )
      if (source.data.relatedEntries?.length)
        sections.push(
          `${source.provider === 'etymonline' ? 'Etymonline' : source.provider} linked entries: ${source.data.relatedEntries.join(', ')}`
        )
      if (source.data.variants?.length)
        sections.push(
          `Explicit source variants for ${source.data.requestedWord ?? context.mainWord.word}: ${sanitizeSourceText(JSON.stringify(source.data.variants))}`
        )
    }
  }
  sections.push(`=== Main Word: "${context.mainWord.word}" ===`)
  appendSources(mainSourceRecords(context.mainWord))
  if (context.entryContexts?.length) {
    sections.push('\n=== Immutable Lexical Histories ===')
    sections.push(
      'Keep every history ID independent. Do not merge, split, rename, or move evidence between histories. Unscoped complete source text stays independent context; matching spelling alone cannot align it to a history.'
    )
    for (const entry of context.entryContexts) {
      sections.push(
        `\n<source_data name="${entry.source}" history_id="${entry.id}" evidence_scope_id="${entry.evidenceScopeId}">\n${sanitizeSourceText(entry.text)}\n</source_data>`
      )
      if (entry.sourceTitle)
        sections.push(
          `Dictionary headword: ${sanitizeSourceText(entry.sourceTitle)}. Keep its meanings and origin accounts scoped to this spelling, including any uncertainty or disagreement between sources.`
        )
      if (entry.caseForm && !entry.caseForm.only)
        sections.push(
          'This spelling also has independent definitions. Describe those definitions here. The spelling reference points to the other headword.'
        )
      if (entry.independentDefinitions?.length)
        sections.push(
          'Include the independently attested definitions for this spelling in its label and parts of speech.',
          '<source_data name="independent_definitions">' +
            sanitizeSourceText(JSON.stringify(entry.independentDefinitions)) +
            '</source_data>'
        )
      if (entry.sectionHeadings.length)
        sections.push(`Section context: ${entry.sectionHeadings.join(' > ')}`)
    }
  }
  if (context.entryContexts?.some((entry) => entry.source === 'multilingualDictionary'))
    sections.push(
      'FreeDictionaryAPI supplies senses, forms and pronunciation only. Its unresolved histories must have empty roots and ancestry graphs, and must clearly state that the available evidence does not establish the origin. Never infer an origin from a definition.'
    )
  if (context.identifiedRoots.length)
    sections.push(
      `\n=== Root Research Candidates (independent histories; not a combined derivation formula) ===\n${context.identifiedRoots.join(', ')}`
    )
  if (context.identifiedRootLexemes?.length)
    sections.push(
      `Language-tagged ancestors: ${context.identifiedRootLexemes.map((lexeme) => `${lexeme.language}:${lexeme.word}`).join(', ')}`
    )
  if (context.lexicalGraph)
    sections.push(
      `\n=== Source-Built Lexical Graph ===\n${sanitizeSourceText(JSON.stringify({ histories: context.lexicalGraph.histories, nodes: context.lexicalGraph.nodes, edges: context.lexicalGraph.edges }))}`
    )
  for (const root of context.rootResearch) {
    sections.push(
      `\n=== ${root.relationship ?? 'root'}: "${root.root}"; language=${root.lexeme?.language ?? context.language ?? 'en'}; parent_history=${root.parentHistoryId ?? 'none'}; evidence_scope=${root.evidenceScopeId ?? 'independent'}; variant_of=${root.variantOf ? `${root.variantOf.language}:${root.variantOf.word}` : 'none'}; relationship_source=${root.relationshipSourceUrl ?? 'none'} ===`
    )
    appendSources(rootSourceRecords(root))
    if (root.relatedTerms.length)
      sections.push(`Related terms found: ${root.relatedTerms.join(', ')}`)
  }
  for (const related of context.relatedResearch) {
    sections.push(`\n=== Related Term: "${related.term}" ===`)
    appendSources(relatedSourceRecords(related))
  }
  if (context.parsedChains?.length)
    sections.push('\n' + formatParsedChainsForPrompt(context.parsedChains))
  const accounts = sourceEtymologyAccounts(mainSourceRecords(context.mainWord))
  if (accounts.length)
    sections.push(
      '\n=== Source-local Etymology Accounts for the Requested Lexeme ===',
      'Each account retains its publisher and source entry boundaries. These are not pre-aligned histories or a declaration that sources disagree. Compare accounts only where the lexical language, defined sense, and forms establish the same referent. Immutable history IDs govern entry boundaries, not agreement between publishers. If accounts for the same sense materially differ in transmission route or dated attestations, attribute the alternatives in that history’s lore; do not silently choose one account or call its date the first recorded use. These unaligned accounts do not authorize changes to the primary history’s ancestryGraph: use its scoped source_data and parsed-chain forms for that graph, and describe alternatives in the lore.',
      `<source_data name="source_local_etymology_accounts">\n${sanitizeSourceText(JSON.stringify(accounts))}\n</source_data>`
    )
  if (
    context.incompleteResearch ||
    context.sourceOutcomes?.some(({ outcome }) =>
      ['blocked', 'unavailable', 'budget_skipped'].includes(outcome.status)
    )
  )
    sections.push(
      'Some source lookups are incomplete. Absence of retrieved evidence is not evidence that a word or historical form never existed.'
    )
  return sections.join('\n')
}
