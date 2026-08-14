import type {
  AncestryGraph,
  JapaneseLexicalStratum,
  LearnerEtymologyResult,
  LlmUsage,
  PartOfSpeech,
  ResearchContext,
  SourceReference,
} from '@/lib/types'
import { CONFIG } from '@/lib/config'
import {
  buildSynthesisRequest,
  createOpenRouterResponse,
  extractOutputText,
  extractUsage,
  streamOpenRouterResponse,
} from '@/lib/openrouterResponses'
import { createSectionScanner } from '@/lib/sectionScanner'
import { LearnerEtymologyResultSchema } from '@/lib/schemas/etymology'
import { stripNullsDeep } from '@/lib/schemas/llm-schema'

const JAPANESE_SYSTEM_PROMPT = `You are a careful historical lexicographer writing for an English-speaking learner of Japanese.

The JSON schema controls shape. These rules control truth:
- The JMdict block fixes lexical identity, reading, sense, and part of speech. It is not proof of origin.
- Origin, formation, dates, strata, and historical forms must be supported by the Wiktionary or WOLD blocks. Never fill a gap from memory.
- Distinguish how a written form works from where the word came from. Kanji meanings or visual components are not word etymology.
- Do not infer a Chinese origin merely because a word uses kanji. Respect ateji, kun readings, native words, and Japanese coinages.
- For compounds, list morphemes only when the source explicitly analyzes them. Otherwise use an opaque formation with the whole word.
- For loans, show source form -> Japanese adaptation when the source supplies both.
- Do not claim pitch accent. Do not invent Proto-Japonic, Altaic, Austronesian, Korean, or other reconstructed ancestry.
- When sources disagree, say so. Keep uncertainty visible.
- Keep prose in English. Keep Japanese forms in Japanese script and put readings in kana.
- LORE is 3-5 concise sentences: concrete, memorable, and source-bound. No generic opening such as "The word X...".
- Copy language, word, entryId, reading, romaji, pronunciation, definition, and evidenceState exactly from the identity block.
- Set sources to an empty array; the server attaches authoritative source records.`

function sourceBlock(name: string, text: string | undefined): string {
  if (!text) return ''
  return `<source_data name="${name}">\n${text.slice(0, 6000)}\n</source_data>`
}

function buildPrompt(context: ResearchContext): string {
  const candidate = context.japaneseCandidate
  if (!candidate) throw new Error('Japanese synthesis requires a resolved JMdict candidate')
  const identity = {
    language: 'ja',
    word: candidate.lemma,
    entryId: candidate.entryId,
    reading: candidate.reading,
    romaji: candidate.romaji,
    pronunciation: candidate.reading,
    definition: candidate.gloss,
    evidenceState: 'grounded',
    alternateForms: candidate.alternateForms ?? [],
    partOfSpeech: candidate.partOfSpeech,
  }
  return [
    `Analyze this resolved Japanese lexeme.\n<identity>\n${JSON.stringify(identity)}\n</identity>`,
    sourceBlock('JMdict lexical identity', context.mainWord.jmdict?.text),
    sourceBlock('English Wiktionary Japanese section', context.mainWord.wiktionaryEnglish?.text),
    sourceBlock('Japanese Wiktionary 語源 section', context.mainWord.wiktionaryNative?.text),
    sourceBlock('World Loanword Database', context.mainWord.wold?.text),
    sourceBlock('Wikidata Lexeme', context.mainWord.wikidataLexeme?.text),
  ]
    .filter(Boolean)
    .join('\n\n')
}

function parseResult(text: string): LearnerEtymologyResult {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]
  const candidates = [trimmed, fenced].filter((value): value is string => Boolean(value))
  for (const candidate of candidates) {
    try {
      return stripNullsDeep(JSON.parse(candidate)) as LearnerEtymologyResult
    } catch {
      continue
    }
  }
  throw new Error('Could not parse Japanese synthesis output')
}

function sourceText(context: ResearchContext): string {
  return [
    context.mainWord.wiktionaryEnglish?.text,
    context.mainWord.wiktionaryNative?.text,
    context.mainWord.wold?.text,
  ]
    .filter(Boolean)
    .join('\n')
}

function evidenceStratum(context: ResearchContext): JapaneseLexicalStratum {
  const text = sourceText(context)
  if (/"stratum":"wago"|\bNative Japanese\b|\b和語\b/i.test(text)) return 'native'
  if (/"stratum":"kango"|\bSino-Japanese\b|\b漢語\b/i.test(text)) return 'sino-japanese'
  if (/"stratum":"gairaigo"|\bloanword\b|\b外来語\b/i.test(text)) return 'loanword'
  if (/"stratum":"konshugo"|\bhybrid\b|\b混種語\b/i.test(text)) return 'hybrid'
  if (/wasei|和製/i.test(text)) return 'wasei'
  return 'uncertain'
}

function sourcesFor(context: ResearchContext): SourceReference[] {
  const sources: SourceReference[] = [
    {
      name: 'jmdict',
      url: context.mainWord.jmdict?.url,
      word: context.mainWord.word,
      sourceFamily: 'jmdict',
      license: 'CC BY-SA 4.0',
      licenseUrl: '/licenses/JMdict.md',
    },
  ]
  if (context.mainWord.wiktionaryEnglish) {
    sources.push({
      name: 'wiktionaryEnglish',
      url: context.mainWord.wiktionaryEnglish.url,
      word: context.mainWord.word,
      sourceFamily: 'wiktionary',
      license: 'CC BY-SA 4.0',
    })
  }
  if (context.mainWord.wiktionaryNative) {
    sources.push({
      name: 'wiktionaryNative',
      url: context.mainWord.wiktionaryNative.url,
      word: context.mainWord.word,
      sourceFamily: 'wiktionary',
      license: 'CC BY-SA 4.0',
    })
  }
  if (context.mainWord.wold) {
    sources.push({
      name: 'wold',
      url: context.mainWord.wold.url,
      word: context.mainWord.word,
      sourceFamily: 'wold',
      license: 'CC BY 3.0 DE',
      licenseUrl: 'https://wold.clld.org/',
    })
  }
  if (context.mainWord.wikidataLexeme) {
    sources.push({
      name: 'wikidataLexeme',
      url: context.mainWord.wikidataLexeme.url,
      word: context.mainWord.word,
      sourceFamily: 'wikidata',
      license: 'CC0',
    })
  }
  return sources
}

function normalizePartOfSpeech(labels: string[]): PartOfSpeech[] {
  const output: PartOfSpeech[] = []
  for (const label of labels) {
    const value: PartOfSpeech | null = label.includes('verb')
      ? 'verb'
      : label.includes('adjective')
        ? 'adjective'
        : label.includes('adverb')
          ? 'adverb'
          : label.includes('interjection')
            ? 'interjection'
            : label.includes('pronoun')
              ? 'pronoun'
              : label.includes('noun')
                ? 'noun'
                : null
    if (value && !output.includes(value)) output.push(value)
  }
  return output
}

function pruneUnsupportedJapaneseStages(graph: AncestryGraph<string>, evidence: string): void {
  const allowed = (stage: { stage: string; form: string }) => {
    if (/proto-|reconstructed|altaic|austronesian/i.test(stage.stage)) return false
    if (stage.form.startsWith('*')) return false
    return evidence.includes(stage.form)
  }
  graph.branches = graph.branches
    .map((branch) => ({
      ...branch,
      stages: branch.stages
        .filter(allowed)
        .map((stage) => ({ ...stage, confidence: 'medium' as const })),
    }))
    .filter((branch) => branch.stages.length > 0)
  graph.postMerge = graph.postMerge?.filter(allowed).map((stage) => ({
    ...stage,
    confidence: 'medium' as const,
  }))
  graph.convergencePoints = undefined
}

export function finalizeGroundedResult(
  generated: LearnerEtymologyResult,
  context: ResearchContext
): LearnerEtymologyResult {
  const candidate = context.japaneseCandidate
  if (!candidate) throw new Error('Japanese result lost its lexical identity')
  const evidence = sourceText(context)
  const componentEvidence = evidence.replaceAll(candidate.lemma, '')
  const partsSupported = generated.formation.parts.every(
    (part) =>
      ((part.role === 'adaptation' || part.role === 'whole') && part.form === candidate.lemma) ||
      componentEvidence.includes(part.form)
  )
  const formationSupported =
    generated.formation.kind === 'opaque' ||
    (generated.formation.kind === 'compound' &&
      /analyzable compound|compound|複合語/i.test(evidence) &&
      partsSupported) ||
    (generated.formation.kind === 'borrowing' &&
      /sourceWord|borrowed|loanword|借用|外来語/i.test(evidence) &&
      partsSupported) ||
    ((generated.formation.kind === 'derivation' ||
      generated.formation.kind === 'historical-development') &&
      partsSupported)
  const formation = formationSupported
    ? generated.formation
    : {
        kind: 'opaque' as const,
        parts: [
          {
            form: candidate.lemma,
            reading: candidate.reading,
            meaning: candidate.gloss,
            role: 'whole' as const,
          },
        ],
        result: candidate.lemma,
        note: 'The available sources do not support a reliable internal breakdown.',
      }
  const ancestryGraph = generated.ancestryGraph
  pruneUnsupportedJapaneseStages(ancestryGraph, evidence)
  const result: LearnerEtymologyResult = {
    ...generated,
    language: 'ja',
    word: candidate.lemma,
    entryId: candidate.entryId,
    reading: candidate.reading,
    romaji: candidate.romaji,
    alternateForms: candidate.alternateForms ?? [],
    pronunciation: candidate.reading,
    definition: candidate.gloss,
    lexicalStratum: evidenceStratum(context),
    evidenceState: 'grounded',
    formation,
    ancestryGraph,
    roots: generated.roots.filter(
      (root) =>
        !root.root.startsWith('*') &&
        componentEvidence.includes(root.root) &&
        evidence.includes(root.origin)
    ),
    partsOfSpeech: normalizePartOfSpeech(candidate.partOfSpeech).map((pos) => ({
      pos,
      definition: candidate.gloss,
    })),
    modernUsage: undefined,
    ngram: undefined,
    sources: sourcesFor(context),
  }
  const validated = LearnerEtymologyResultSchema.safeParse(result)
  if (!validated.success) {
    throw new Error(`Japanese schema validation failed: ${validated.error.issues[0]?.message}`)
  }
  return validated.data as LearnerEtymologyResult
}

export function buildJapaneseLexicalOnlyResult(context: ResearchContext): LearnerEtymologyResult {
  const candidate = context.japaneseCandidate
  if (!candidate) throw new Error('Japanese lexical result requires a resolved entry')
  const result: LearnerEtymologyResult = {
    language: 'ja',
    word: candidate.lemma,
    entryId: candidate.entryId,
    reading: candidate.reading,
    romaji: candidate.romaji,
    alternateForms: candidate.alternateForms ?? [],
    pronunciation: candidate.reading,
    definition: candidate.gloss,
    lexicalStratum: 'uncertain',
    evidenceState: 'lexical_only',
    formation: {
      kind: 'opaque',
      parts: [
        {
          form: candidate.lemma,
          reading: candidate.reading,
          meaning: candidate.gloss,
          role: 'whole',
        },
      ],
      result: candidate.lemma,
      note: 'The available sources do not support a reliable internal breakdown.',
    },
    originSummary: 'Reliable origin evidence was not found in the sources available to EtymEx.',
    ancestryGraph: { branches: [] },
    roots: [],
    lore: 'This entry is established as a Japanese word, but its history is not documented well enough in the available evidence to tell a responsible origin story. EtymEx leaves that gap visible rather than turning a plausible guess into a fact.',
    partsOfSpeech: normalizePartOfSpeech(candidate.partOfSpeech).map((pos) => ({
      pos,
      definition: candidate.gloss,
    })),
    suggestions: undefined,
    modernUsage: undefined,
    sources: sourcesFor(context),
  }
  return LearnerEtymologyResultSchema.parse(result) as LearnerEtymologyResult
}

export async function synthesizeJapaneseFromResearch(
  context: ResearchContext,
  options?: { signal?: AbortSignal; onSection?: (section: string, data: unknown) => void }
): Promise<{ result: LearnerEtymologyResult; usage: LlmUsage }> {
  const request = buildSynthesisRequest(buildPrompt(context), undefined, 'ja')
  request.instructions = JAPANESE_SYSTEM_PROMPT
  let text = ''
  let usage: LlmUsage
  if (options?.onSection) {
    const scanner = createSectionScanner((section, data) =>
      options.onSection?.(section, stripNullsDeep(data))
    )
    const response = await streamOpenRouterResponse(
      request,
      (token) => {
        text += token
        scanner.push(token)
      },
      CONFIG.timeouts.llm,
      options.signal
    )
    if (!text) {
      text = extractOutputText(response)
      scanner.push(text)
    }
    usage = extractUsage(response)
  } else {
    const response = await createOpenRouterResponse(request, CONFIG.timeouts.llm, options?.signal)
    text = extractOutputText(response)
    usage = extractUsage(response)
  }
  try {
    return { result: finalizeGroundedResult(parseResult(text), context), usage }
  } catch (error) {
    if (error && typeof error === 'object') Object.assign(error, { usage })
    throw error
  }
}
