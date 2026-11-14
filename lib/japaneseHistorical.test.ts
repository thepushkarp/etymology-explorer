import { expect, test } from 'bun:test'
import { fetchJapaneseHistorical } from './japaneseHistorical'
import { lexicalSourceRecords } from './researchSources'

test('historical matches retain complete records, dates, attribution and context-only scope', async () => {
  const star = await fetchJapaneseHistorical('星')
  const wamyo = star.find((record) => record.data.sourceEntryId?.startsWith('wamyo:'))!
  expect(wamyo.data.text).toContain('1617')
  expect(wamyo.data.text).toContain('説文云星万物精上所生也桑経反［和名保之］')
  expect(wamyo.data.license).toContain('CC BY 4.0')
  expect(wamyo.data.entryGroups).toBeUndefined()
  expect(lexicalSourceRecords(star)).toEqual([])
  const philosophy = await fetchJapaneseHistorical('哲学')
  expect(philosophy[0].data.text).toContain('Philosophy　哲学')
  expect(philosophy[0].data.text).toContain('1881')
  expect(philosophy[0].evidenceRole).toBe('context')
  const mamushi = await fetchJapaneseHistorical('まむし')
  expect(mamushi[0].data.text).toContain('Genkai headword data')
  expect(mamushi[0].data.text).toContain('底本所在')
  expect(mamushi[0].data.text).toContain('日国ID')
})

test('historical transcription does not imply modern lemma or cross-script identity', async () => {
  expect(await fetchJapaneseHistorical('アブ')).toHaveLength(1)
  // The released row transcribes アバキ,ク,イタ and separately supplies modern アバク.
  // Neither reconstructed inflections nor editorial modernization are lookup keys.
  expect(await fetchJapaneseHistorical('アバク')).toEqual([])
  expect(await fetchJapaneseHistorical('ほしxyz')).toEqual([])
  const controller = new AbortController()
  controller.abort()
  await expect(fetchJapaneseHistorical('星', controller.signal)).rejects.toThrow()
})
