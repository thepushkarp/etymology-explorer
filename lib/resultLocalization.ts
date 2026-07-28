import type {
  BetaEtymologyResult,
  BilingualText,
  DisplayEtymologyResult,
  EtymologyResult,
  EnglishEtymologyResult,
} from './types'
import { LANGUAGES, type BetaLanguageCode } from './languages'

export type ResultLocale = 'en' | 'local'

function pick(text: BilingualText, locale: ResultLocale): string {
  return text[locale]
}

export function localizeResult(
  result: EtymologyResult,
  locale: ResultLocale = 'local'
): DisplayEtymologyResult {
  const language = result.language ?? 'en'
  if (language === 'en') {
    const english = result as EnglishEtymologyResult
    return { ...english, language: 'en' }
  }

  const beta = result as BetaEtymologyResult
  return {
    ...beta,
    definition: pick(beta.definition, locale),
    lore: pick(beta.lore, locale),
    roots: beta.roots.map((root) => ({ ...root, meaning: pick(root.meaning, locale) })),
    // The beta schema does not yet attach language identity to suggestion
    // strings, so they must not become guessed selected-language links.
    suggestions: undefined,
    ancestryGraph: {
      ...beta.ancestryGraph,
      branches: beta.ancestryGraph.branches.map((branch) => ({
        ...branch,
        stages: branch.stages.map((stage) => ({ ...stage, note: pick(stage.note, locale) })),
      })),
      convergencePoints: beta.ancestryGraph.convergencePoints?.map((point) => ({
        ...point,
        meaning: pick(point.meaning, locale),
      })),
      mergePoint: beta.ancestryGraph.mergePoint
        ? {
            ...beta.ancestryGraph.mergePoint,
            note: pick(beta.ancestryGraph.mergePoint.note, locale),
          }
        : undefined,
      postMerge: beta.ancestryGraph.postMerge?.map((stage) => ({
        ...stage,
        note: pick(stage.note, locale),
      })),
    },
    partsOfSpeech: beta.partsOfSpeech?.map((part) => ({
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

type SectionLabels = {
  ancestry: string
  story: string
  usage: string
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
