import type { LexemeRef, SourceLexicalRelation } from './types'

/** Only affirmative, complete statements inside a native 語源 section admit edges. */
export function japaneseEtymologyRelations(
  text: string,
  subject: LexemeRef
): SourceLexicalRelation[] {
  const relations: SourceLexicalRelation[] = []
  for (const line of text.split('\n')) {
    const snippet = line.replace(/^\s*-\s*/, '').trim()
    const origin = snippet.match(
      /^(古典日本語|上代日本語|日本語)\s*「([\p{L}\p{M}ー]+)」(?:[（(][^（）()]*[）)])?\s*から[。.]?$/u
    )
    const shortening = snippet.match(
      /^「([\p{L}\p{M}ー]+)(?:…|\.\.\.)?」(?:の略(?:語)?|の[\p{L}\p{M}ー]+以下が落ちて挨拶言葉となった)[。.]?$/u
    )
    const target = origin
      ? {
          word: origin[2],
          language: {
            古典日本語: 'Classical Japanese',
            上代日本語: 'Old Japanese',
            日本語: 'Japanese',
          }[origin[1]]!,
        }
      : shortening
        ? { word: shortening[1], language: 'Japanese' }
        : undefined
    if (target && (target.word !== subject.word || target.language !== subject.language))
      relations.push({ subject, target, relation: 'derived_from', snippet })
  }
  return relations
}
