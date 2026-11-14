import { getCachedEntry } from './cache'
import { assembleLookupGroup, isKanaWord, lookupGroupSeed } from './lookupGroups'
import { normalizeScriptTargets } from './scriptTargets'
import type { WordEntry } from './types'

/** Follow a saved kana index or an explicit romanization offer; never expand a direct kanji search. */
export async function getLookupGroup(word: string, entry?: WordEntry) {
  if (!isKanaWord(word) && !/^[\p{Script=Latin}\p{Mark}' -]+$/u.test(word)) return undefined
  entry ??= (await getCachedEntry(word, { durableOnly: true }))?.entry
  if (!entry) return undefined
  let seed = lookupGroupSeed(entry)
  if (!seed) {
    const targets = normalizeScriptTargets(entry.otherScripts).filter(
      (target) => target.language === 'ja'
    )
    const kana = targets.filter((target) => isKanaWord(target.word))
    if (kana.length === 1) {
      const owner = await getCachedEntry(kana[0].word, { durableOnly: true })
      seed = owner ? lookupGroupSeed(owner.entry) : undefined
    }
    if (!seed && targets.length)
      seed = {
        reading: word,
        romanizations: [word],
        members: targets,
      }
  }
  if (!seed) return undefined
  const words = [
    ...new Set([...seed.members.map((member) => member.word), ...seed.romanizations, word]),
  ]
  const entries: (WordEntry | undefined)[] = []
  // Limit concurrent Redis reads without dropping any source-listed candidates.
  for (let offset = 0; offset < words.length; offset += 4) {
    entries.push(
      ...(await Promise.all(
        words
          .slice(offset, offset + 4)
          .map(async (target) =>
            target === entry.word
              ? entry
              : (await getCachedEntry(target, { durableOnly: true }))?.entry
          )
      ))
    )
  }
  return assembleLookupGroup(
    seed,
    entries.filter((value): value is WordEntry => Boolean(value))
  )
}
