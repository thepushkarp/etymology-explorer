import { getCachedEntry, getCachedSpellingEntry } from './cache'
import { assembleLookupGroup, isKanaWord, lookupGroupSeed } from './lookupGroups'
import { normalizeScriptTargets } from './scriptTargets'
import type { WordEntry } from './types'

/** Follow a saved kana index or an explicit romanization offer; never expand a direct kanji search. */
export async function getLookupGroup(word: string, entry?: WordEntry) {
  if (!isKanaWord(word) && !/^[\p{Script=Latin}\p{Mark}' -]+$/u.test(word)) return undefined
  const aliases = new Map<string, string>()
  const reads = new Map<string, Promise<WordEntry | undefined>>()
  const read = (target: string, japanese = false) => {
    const key = `${japanese}:${target}`
    if (!reads.has(key))
      reads.set(
        key,
        (async () => {
          const [saved, alias] = await Promise.all([
            target === entry?.word
              ? Promise.resolve({ entry })
              : getCachedEntry(target, { durableOnly: true }),
            japanese ? getCachedSpellingEntry(target, 'ja') : null,
          ])
          if (alias) aliases.set(target, alias.word)
          return alias?.entry ?? saved?.entry
        })()
      )
    return reads.get(key)!
  }
  entry ??= await read(word, isKanaWord(word))
  if (!entry) return undefined
  let seed = lookupGroupSeed(entry)
  if (!seed && aliases.has(word))
    seed = lookupGroupSeed({ ...entry, word }) ?? {
      reading: word,
      romanizations: [],
      members: [{ word, language: 'ja' }],
    }
  if (!seed) {
    const targets = normalizeScriptTargets(entry.otherScripts).filter(
      (target) => target.language === 'ja'
    )
    const kana = targets.filter((target) => isKanaWord(target.word))
    if (kana.length === 1) {
      const owner = await read(kana[0].word, true)
      seed = owner ? lookupGroupSeed({ ...owner, word: kana[0].word }) : undefined
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
        words.slice(offset, offset + 4).map((target) =>
          read(
            target,
            seed.members.some((member) => member.word === target)
          )
        )
      ))
    )
  }
  return assembleLookupGroup(
    seed,
    entries.filter((value): value is WordEntry => Boolean(value)),
    aliases
  )
}
