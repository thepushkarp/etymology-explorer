import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

export interface JmdictEntry {
  id: string
  /** Kanji spellings: text, common flag. */
  k: Array<[string, 0 | 1]>
  /** Kana readings: text, common flag, applicable kanji spellings. */
  r: Array<[string, 0 | 1, string[]]>
  p: string[]
  g: string[]
  s: Array<{ l: string; t?: string; w?: true; p?: true }>
}

type DictionaryShard = Record<string, JmdictEntry[]>

const SHARD_COUNT = 64
const MAX_RESIDENT_SHARDS = 12
const residentShards = new Map<string, DictionaryShard>()
const pendingShards = new Map<string, Promise<DictionaryShard>>()

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function shardFor(key: string): string {
  const byte = createHash('sha256').update(key).digest()[0]
  return String(byte % SHARD_COUNT).padStart(2, '0')
}

async function readShard(shardId: string): Promise<DictionaryShard> {
  const cached = residentShards.get(shardId)
  if (cached) {
    residentShards.delete(shardId)
    residentShards.set(shardId, cached)
    return cached
  }

  const pending = pendingShards.get(shardId)
  if (pending) return pending

  const load = readFile(join(process.cwd(), 'data', 'jmdict', `${shardId}.json.gz`))
    .then((compressed) => JSON.parse(gunzipSync(compressed).toString('utf8')) as DictionaryShard)
    .then((shard) => {
      residentShards.set(shardId, shard)
      while (residentShards.size > MAX_RESIDENT_SHARDS) {
        const oldest = residentShards.keys().next().value as string | undefined
        if (!oldest) break
        residentShards.delete(oldest)
      }
      return shard
    })
    .finally(() => pendingShards.delete(shardId))

  pendingShards.set(shardId, load)
  return load
}

/** Read only the deterministic gzip shards required by these surface forms. */
export async function lookupJmdictKeys(keys: string[]): Promise<Map<string, JmdictEntry[]>> {
  const normalizedKeys = [...new Set(keys.map(normalize).filter(Boolean))]
  const shardIds = [...new Set(normalizedKeys.map(shardFor))]
  const shards = await Promise.all(shardIds.map(async (id) => [id, await readShard(id)] as const))
  const byShard = new Map(shards)
  return new Map(
    normalizedKeys.map((key) => [key, byShard.get(shardFor(key))?.[key] ?? []] as const)
  )
}

export function resetJapaneseDictionaryCacheForTests(): void {
  residentShards.clear()
  pendingShards.clear()
}
