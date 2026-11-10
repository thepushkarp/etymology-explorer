import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EtymologyResult, WordEntry } from './types'
import { etymologyResult } from '@/lib/testSupport/etymologyResult'
import {
  landingSearchPreviews,
  parseRecentSearchPreviews,
  recentSearchPreview,
} from './recentSearchPreview'
import { getRecentSearches, recordRecentSearch } from './recentSearches'

const result: EtymologyResult = etymologyResult({
  word: 'nice',
  pronunciation: '/naɪs/',
  definition: 'Pleasant.',
  lore: 'From Latin nescius, ignorant.',
})

function entry(value: EtymologyResult): WordEntry {
  return {
    word: value.word,
    languages: [value.language],
    entries: { [value.language]: value },
    otherLanguages: [],
    tracedAt: new Date().toISOString(),
    revision: 1,
  }
}

describe('recent search previews', () => {
  test('uses the selected language and primary history, with a bounded whole-word teaser', () => {
    const primaryLore = '*A* word with an old history. '.repeat(8)
    const italian = etymologyResult({
      language: 'it',
      word: ' CÀSA ',
      definition: 'House.',
      lore: 'Projected lore.',
    })
    italian.histories[0].lore = primaryLore
    const preview = recentSearchPreview(entry(italian))!
    expect(preview.word).toBe('càsa')
    expect(preview.teaser.startsWith('A word with an old history.')).toBe(true)
    expect(preview.teaser.length).toBeLessThanOrEqual(120)
    expect(preview.teaser.endsWith('…')).toBe(true)
    expect(preview.language).toBe('it')
    const english = (lore: string) =>
      etymologyResult({ word: 'nice', definition: 'Pleasant.', lore })
    expect(recentSearchPreview(entry(english('  ')))?.teaser).toBe('Pleasant.')
    expect(recentSearchPreview(entry(english('From *hūsą to *house*.')))?.teaser).toBe(
      'From *hūsą to house.'
    )
  })

  test('deduplicates normalized words and fills remaining slots from curated entries', () => {
    const recent = [
      { word: 'NiCe', language: 'en' as const, teaser: 'A recent story.' },
      { word: 'nice', language: 'en' as const, teaser: 'Duplicate.' },
      { word: 'bad\ninput', language: 'fr' as const, teaser: 'Invalid.' },
      { word: 'empty', language: 'it' as const, teaser: '' },
    ]
    const curated = ['nice', 'villain', 'muscle', 'window'].map((word) => ({
      word,
      language: 'en' as const,
      teaser: 'A curated story.',
    }))
    expect(landingSearchPreviews(recent, curated)).toEqual([
      { word: 'nice', language: 'en' as const, teaser: 'A recent story.' },
      ...curated.slice(1),
    ])
    expect(parseRecentSearchPreviews({ word: 'nice' })).toEqual([])
  })

  test('only records matching cached results and keeps reads cache-free', async () => {
    const client = { get: mock(async () => []), eval: mock(async () => 1) }
    const load = mock(async () => ({ entry: entry(result), stale: false }))
    expect(await recordRecentSearch('  NICE ', client, load)).toBe(true)
    expect(load).toHaveBeenCalledWith('nice')
    const args = client.eval.mock.calls[0] as unknown as [string, string[], string[]]
    expect(args[1]).toEqual(['recent-searches:v3'])
    expect(JSON.parse(args[2][0])).toEqual({ word: 'nice', language: 'en', teaser: result.lore })
    expect(await recordRecentSearch('other', client, load)).toBe(false)
    expect(await recordRecentSearch('nice', client, async () => null)).toBe(false)
    expect(client.eval).toHaveBeenCalledTimes(1)
    load.mockClear()
    expect(await getRecentSearches(client)).toEqual([])
    expect(load).not.toHaveBeenCalled()
    expect(await getRecentSearches(null)).toEqual([])
    const mixed = {
      ...client,
      get: mock(async () => [
        ...Array.from({ length: 16 }, (_, index) => ({
          word: `word${String.fromCharCode(97 + index)}`,
          language: 'en',
          teaser: 'English.',
        })),
        { word: 'fenêtre', language: 'fr', teaser: 'French.' },
      ]),
    }
    expect(await getRecentSearches(mixed, 'fr')).toEqual([
      { word: 'fenêtre', language: 'fr', teaser: 'French.' },
    ])
  })
})

// Exercise the actual Lua script when a local Redis binary is available; no
// shared service, configured credentials, or production keys are used.
describe.skipIf(!Bun.which('redis-server') || !Bun.which('redis-cli'))(
  'recent searches Redis concurrency',
  () => {
    let directory: string
    let socket: string
    let server: ReturnType<typeof Bun.spawn>

    async function command(args: string[]): Promise<unknown> {
      const process = Bun.spawn(['redis-cli', '--json', '-s', socket, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const output = await new Response(process.stdout).text()
      if ((await process.exited) !== 0) throw new Error(await new Response(process.stderr).text())
      return JSON.parse(output)
    }

    const client = {
      async get(key: string): Promise<unknown> {
        const value = await command(['GET', key])
        return typeof value === 'string' ? JSON.parse(value) : value
      },
      eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
        return command(['EVAL', script, String(keys.length), ...keys, ...args.map(String)])
      },
    }

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), 'etymex-recents-'))
      socket = join(directory, 'redis.sock')
      server = Bun.spawn(
        ['redis-server', '--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'],
        { stdout: 'ignore', stderr: 'ignore' }
      )
      const deadline = Date.now() + 3000
      while (!existsSync(socket) && Date.now() < deadline) await Bun.sleep(10)
      if (!existsSync(socket)) throw new Error('Local test Redis did not start')
    })

    afterAll(async () => {
      server?.kill()
      if (server) await server.exited
      if (directory) rmSync(directory, { recursive: true, force: true })
    })

    test('keeps 20 unique concurrent successes and promotes repeats in one list', async () => {
      const words = Array.from(
        { length: 26 },
        (_, index) => `word${String.fromCharCode(97 + index)}`
      )
      const load = async (word: string) => ({ entry: entry({ ...result, word }), stale: false })
      await Promise.all(words.map((word) => recordRecentSearch(word, client, load)))
      const pool = (await client.get('recent-searches:v3')) as Array<{ word: string }>
      expect(pool).toHaveLength(20)
      expect(new Set(pool.map((entry) => entry.word)).size).toBe(20)
      const repeated = pool[15].word
      await recordRecentSearch(repeated, client, load)
      const promoted = (await client.get('recent-searches:v3')) as Array<{ word: string }>
      expect(promoted).toHaveLength(20)
      expect(promoted[0].word).toBe(repeated)
      const sample = await getRecentSearches(client)
      expect(sample).toHaveLength(4)
      expect(new Set(sample.map((entry) => entry.word)).size).toBe(4)
      expect(
        sample.every((entry) => promoted.some((candidate) => candidate.word === entry.word))
      ).toBe(true)
    })
  }
)
