/** Publisher identities are shared by prompts, cache validation, and attribution. */
export const SOURCE_PROVIDER_IDS = [
  'etymonline',
  'wiktionary',
  'incelsWiki',
  'wikipedia',
  'wiktionaryEnglish',
  'wiktionaryNative',
  'wikidataLexeme',
  'multilingualDictionary',
  'dicionarioAberto',
  'americanHeritage',
  'deMauro',
  'dle',
  'americanismos',
  'tlfi',
  'littre',
  'academie',
  'priberam',
  'michaelis',
  'bosworthToller',
  'lewisShort',
  'lsj',
  'jmdict',
  'oncoj',
  'ninjalHistorical',
] as const

export type SourceProviderId = (typeof SOURCE_PROVIDER_IDS)[number]

/** Retrieval services and mirrors never create an independent evidence family. */
export const SOURCE_FAMILY_IDS = [
  'etymonline',
  'wiktionary',
  'wikipedia',
  'incelsWiki',
  'wikidata',
  'dicionarioAberto',
  'americanHeritage',
  'deMauro',
  'raeAsale',
  'tlfi',
  'littre',
  'academieFrancaise',
  'priberam',
  'michaelis',
  'bosworthToller',
  'lewisShort',
  'lsj',
  'jmdict',
  'oncoj',
  'ninjalHistorical',
  'other',
] as const

export type SourceFamilyId = (typeof SOURCE_FAMILY_IDS)[number]

export function sourceFamily(provider: SourceProviderId): SourceFamilyId {
  if (
    ['wiktionary', 'wiktionaryEnglish', 'wiktionaryNative', 'multilingualDictionary'].includes(
      provider
    )
  )
    return 'wiktionary'
  if (provider === 'wikidataLexeme') return 'wikidata'
  if (provider === 'dle' || provider === 'americanismos') return 'raeAsale'
  if (provider === 'academie') return 'academieFrancaise'
  return provider as SourceFamilyId
}
