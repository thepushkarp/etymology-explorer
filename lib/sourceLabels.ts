const SOURCE_LABELS: Record<string, string> = {
  etymonline: 'Etymonline',
  wiktionary: 'Wiktionary',
  wikipedia: 'Wikipedia',
  incelswiki: 'Incels Wiki',
  wiktionaryenglish: 'English Wiktionary',
  wiktionarynative: 'Native Wiktionary',
  multilingualdictionary: 'FreeDictionaryAPI',
  wikidatalexeme: 'Wikidata Lexemes',
  dicionarioaberto: 'Dicionário Aberto',
  americanheritage: 'American Heritage',
  demauro: 'De Mauro',
  dle: 'RAE / ASALE',
  americanismos: 'Americanismos',
  cnrtl: 'CNRTL',
  tlfi: 'TLFi',
  littre: 'Littré',
  academie: 'Académie française',
  priberam: 'Priberam',
  michaelis: 'Michaelis',
  bosworthtoller: 'Bosworth–Toller',
  lewisshort: 'Lewis & Short',
  lsj: 'LSJ',
  jmdict: 'JMdict / EDRDG (via Jisho)',
  oncoj: 'Oxford–NINJAL Corpus of Old Japanese',
  exa: 'Exa retrieval',
  synthesized: 'AI synthesis',
}

/** Case- and space-insensitive key for a source name. */
export function sourceKey(source: string): string {
  return source.toLowerCase().replace(/\s+/g, '')
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[sourceKey(source)] ?? source
}
