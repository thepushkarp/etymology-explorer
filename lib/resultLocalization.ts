import type {
  BetaEtymologyResult,
  BilingualText,
  DisplayEtymologyResult,
  EtymologyResult,
  EnglishEtymologyResult,
} from './types'
import { LANGUAGES, type BetaLanguageCode } from './languages'

export type ResultLocale = 'en' | 'local'

export interface DisplayHistoryChoice {
  id: string
  label: string
  entryKind: 'lemma' | 'form' | 'unresolved'
  formOf?: { word: string; language: string }
  partsOfSpeech: string[]
}

function pick(text: BilingualText, locale: ResultLocale): string {
  return text[locale]
}

export function localizeResult(
  result: EtymologyResult,
  locale: ResultLocale = 'local',
  historyId?: string
): DisplayEtymologyResult {
  const language = result.language ?? 'en'
  if (language === 'en') {
    const english = result as EnglishEtymologyResult
    return { ...english, language: 'en' }
  }
  if (language === 'ja') {
    return result as DisplayEtymologyResult
  }

  const beta = result as BetaEtymologyResult
  // Progressive beta sections and legacy in-memory fixtures may not have
  // received the histories field yet. Their top-level entry remains a safe
  // projection until the terminal, schema-validated result arrives.
  const histories = beta.histories ?? []
  const history =
    histories.find((candidate) => candidate.id === historyId) ??
    histories.find((candidate) => candidate.id === beta.primaryHistoryId) ??
    histories[0] ??
    beta
  return {
    ...beta,
    pronunciation: history.pronunciation,
    definition: pick(history.definition, locale),
    lore: pick(history.lore, locale),
    roots: history.roots.map((root) => ({ ...root, meaning: pick(root.meaning, locale) })),
    // The beta schema does not yet attach language identity to suggestion
    // strings, so they must not become guessed selected-language links.
    suggestions: undefined,
    ancestryGraph: {
      ...history.ancestryGraph,
      branches: history.ancestryGraph.branches.map((branch) => ({
        ...branch,
        stages: branch.stages.map((stage) => ({ ...stage, note: pick(stage.note, locale) })),
      })),
      convergencePoints: history.ancestryGraph.convergencePoints?.map((point) => ({
        ...point,
        meaning: pick(point.meaning, locale),
      })),
      mergePoint: history.ancestryGraph.mergePoint
        ? {
            ...history.ancestryGraph.mergePoint,
            note: pick(history.ancestryGraph.mergePoint.note, locale),
          }
        : undefined,
      postMerge: history.ancestryGraph.postMerge?.map((stage) => ({
        ...stage,
        note: pick(stage.note, locale),
      })),
    },
    partsOfSpeech: history.partsOfSpeech?.map((part) => ({
      ...part,
      definition: pick(part.definition, locale),
    })),
    modernUsage: beta.modernUsage
      ? {
          ...beta.modernUsage,
          slangDefinition: beta.modernUsage.slangDefinition
            ? pick(beta.modernUsage.slangDefinition, locale)
            : undefined,
          popularizedBy: beta.modernUsage.popularizedBy
            ? pick(beta.modernUsage.popularizedBy, locale)
            : undefined,
          contexts: beta.modernUsage.contexts?.map((text) => pick(text, locale)),
          notableReferences: beta.modernUsage.notableReferences?.map((text) => pick(text, locale)),
        }
      : undefined,
  }
}

export function localizeHistoryChoices(
  result: EtymologyResult,
  locale: ResultLocale = 'local'
): DisplayHistoryChoice[] {
  if (
    (result.language ?? 'en') === 'en' ||
    !('histories' in result) ||
    !Array.isArray(result.histories)
  )
    return []
  return result.histories.map((history) => ({
    id: history.id,
    label: pick(history.label, locale),
    entryKind: history.entryKind,
    formOf: history.formOf,
    partsOfSpeech: Array.from(new Set((history.partsOfSpeech ?? []).map((part) => part.pos))),
  }))
}

type SectionLabels = {
  ancestry: string
  story: string
  usage: string
  usageNote: string
  usageUnavailable: string
  modernUsage: string
  related: string
  kin: string
  sources: string
  references: string
}

const LOCAL_LABELS: Record<BetaLanguageCode, SectionLabels> = {
  it: {
    ancestry: 'Ascendenza della parola',
    story: 'La storia',
    usage: 'Uso nel tempo',
    usageNote: 'Nota sul corpus',
    usageUnavailable: 'I dati storici sull’uso non sono ancora disponibili per questo corpus.',
    modernUsage: 'Uso moderno',
    related: 'Parole correlate',
    kin: 'Parenti linguistici',
    sources: 'Fonti',
    references: 'Ulteriori riferimenti accademici',
  },
  es: {
    ancestry: 'Ascendencia de la palabra',
    story: 'La historia',
    usage: 'Uso a través del tiempo',
    usageNote: 'Nota del corpus',
    usageUnavailable: 'Los datos históricos de uso aún no están disponibles para este corpus.',
    modernUsage: 'Uso moderno',
    related: 'Palabras relacionadas',
    kin: 'Familia lingüística',
    sources: 'Fuentes',
    references: 'Otras referencias académicas',
  },
  fr: {
    ancestry: 'Ascendance du mot',
    story: "L'histoire",
    usage: 'Usage au fil du temps',
    usageNote: 'Note sur le corpus',
    usageUnavailable:
      "Les données historiques d'usage ne sont pas encore disponibles pour ce corpus.",
    modernUsage: 'Usage moderne',
    related: 'Mots apparentés',
    kin: 'Parenté linguistique',
    sources: 'Sources',
    references: 'Autres références savantes',
  },
  pt: {
    ancestry: 'Ascendência da palavra',
    story: 'A história',
    usage: 'Uso ao longo do tempo',
    usageNote: 'Nota do corpus',
    usageUnavailable: 'Os dados históricos de uso ainda não estão disponíveis para este corpus.',
    modernUsage: 'Uso moderno',
    related: 'Palavras relacionadas',
    kin: 'Família linguística',
    sources: 'Fontes',
    references: 'Outras referências académicas',
  },
}

const ENGLISH_LABELS: SectionLabels = {
  ancestry: 'Word Ancestry',
  story: 'The Story',
  usage: 'Usage over time',
  usageNote: 'Corpus note',
  usageUnavailable: 'Usage history is not available for this corpus yet.',
  modernUsage: 'Modern Usage',
  related: 'Related Words',
  kin: 'Kin & Kindred',
  sources: 'Sources',
  references: 'Further scholarly references',
}

export function resultLabels(language: BetaLanguageCode, locale: ResultLocale): SectionLabels {
  return locale === 'en' ? ENGLISH_LABELS : LOCAL_LABELS[language]
}

export function selectedLanguageName(language: BetaLanguageCode): string {
  return LANGUAGES[language].nativeName
}
