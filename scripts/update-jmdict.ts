import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RELEASE_API = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest'
const OUTPUT_DIR = join(process.cwd(), 'data', 'jmdict')
const DISCOVERY_PATH = join(process.cwd(), 'data', 'discovery-words.json')
const SHARD_COUNT = 64

interface SourceForm {
  common: boolean
  text: string
  tags: string[]
  appliesToKanji?: string[]
}

interface SourceSense {
  partOfSpeech: string[]
  misc: string[]
  info: string[]
  languageSource: Array<{ lang?: string; text?: string; wasei?: boolean; partial?: boolean }>
  gloss: Array<{ lang: string; text: string }>
}

interface SourceWord {
  id: string
  kanji: SourceForm[]
  kana: SourceForm[]
  sense: SourceSense[]
}

interface SourceDictionary {
  version: string
  dictDate: string
  words: SourceWord[]
}

interface CompactEntry {
  id: string
  k: Array<[string, 0 | 1]>
  r: Array<[string, 0 | 1, string[]]>
  p: string[]
  g: string[]
  s: Array<{ l: string; t?: string; w?: true; p?: true }>
}

function shardFor(key: string): string {
  const byte = createHash('sha256').update(key).digest()[0]
  return String(byte % SHARD_COUNT).padStart(2, '0')
}

function normalizeKey(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function compactEntry(word: SourceWord): CompactEntry {
  const pos = new Set<string>()
  const glosses: string[] = []
  const sources: CompactEntry['s'] = []

  for (const sense of word.sense) {
    for (const tag of sense.partOfSpeech) pos.add(tag)
    for (const gloss of sense.gloss) {
      if (gloss.lang === 'eng' && glosses.length < 4 && !glosses.includes(gloss.text)) {
        glosses.push(gloss.text)
      }
    }
    for (const source of sense.languageSource ?? []) {
      if (!source.lang || sources.length >= 6) continue
      const compact = {
        l: source.lang,
        ...(source.text ? { t: source.text } : {}),
        ...(source.wasei ? { w: true as const } : {}),
        ...(source.partial ? { p: true as const } : {}),
      }
      if (!sources.some((entry) => JSON.stringify(entry) === JSON.stringify(compact))) {
        sources.push(compact)
      }
    }
  }

  return {
    id: word.id,
    k: word.kanji.map((form) => [form.text, form.common ? 1 : 0]),
    r: word.kana.map((form) => [form.text, form.common ? 1 : 0, form.appliesToKanji ?? ['*']]),
    p: [...pos],
    g: glosses,
    s: sources,
  }
}

function japaneseDiscoveryWords(dictionary: SourceDictionary): string[] {
  const curated = ['学校', 'コーヒー', 'ありがとう', 'パン']
  const excludedMisc = new Set(['arch', 'obs', 'rare', 'vulg', 'derog', 'sl', 'dated'])
  const allowedPos = /^(?:n|v|adj|adv|int|exp)/
  const unsuitableGloss = /\b(?:breasts?|feces|faeces|urine|fart|penis|vagina|porn|sexual)\b/i
  const candidates = dictionary.words
    .filter(
      (word) => word.kanji.some((form) => form.common) || word.kana.some((form) => form.common)
    )
    .filter((word) =>
      word.sense.some((sense) => sense.partOfSpeech.some((pos) => allowedPos.test(pos)))
    )
    .filter((word) =>
      word.sense.every((sense) => sense.misc.every((tag) => !excludedMisc.has(tag)))
    )
    .filter((word) =>
      word.sense.every((sense) => sense.gloss.every((gloss) => !unsuitableGloss.test(gloss.text)))
    )
    .map(
      (word) =>
        word.kanji.find((form) => form.common)?.text ??
        word.kana.find((form) => form.common)?.text ??
        ''
    )
    .filter(
      (word) =>
        /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ]+$/u.test(word) &&
        word.length > 1 &&
        word.length <= 35
    )
  return [...new Set([...curated, ...candidates])].slice(0, 446)
}

async function latestAsset(): Promise<{ tag: string; url: string; name: string }> {
  const response = await fetch(RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EtymEx-JMdict-Updater' },
  })
  if (!response.ok) throw new Error(`GitHub release lookup failed: ${response.status}`)
  const release = (await response.json()) as {
    tag_name: string
    assets: Array<{ name: string; browser_download_url: string }>
  }
  const asset = release.assets.find((candidate) =>
    /^jmdict-eng-.*\.json\.tgz$/.test(candidate.name)
  )
  if (!asset) throw new Error('Latest jmdict-simplified release has no English JMdict archive')
  return { tag: release.tag_name, url: asset.browser_download_url, name: asset.name }
}

async function downloadDictionary(asset: { url: string; name: string }): Promise<string> {
  const directory = await Bun.$`mktemp -d ${join(tmpdir(), 'etymex-jmdict.XXXXXX')}`.text()
  const tempDirectory = directory.trim()
  const archive = join(tempDirectory, asset.name)
  const response = await fetch(asset.url)
  if (!response.ok) throw new Error(`JMdict download failed: ${response.status}`)
  await Bun.write(archive, await response.arrayBuffer())
  const extraction = Bun.spawn(['tar', '-xzf', archive, '-C', tempDirectory])
  if ((await extraction.exited) !== 0) throw new Error('Unable to extract JMdict archive')
  const filename = (await readdir(tempDirectory)).find((entry) => entry.endsWith('.json'))
  if (!filename) throw new Error('JMdict archive did not contain a JSON file')
  return join(tempDirectory, filename)
}

async function main() {
  const asset = await latestAsset()
  const dictionaryPath = await downloadDictionary(asset)
  const dictionary = JSON.parse(await readFile(dictionaryPath, 'utf8')) as SourceDictionary
  const shards = new Map<string, Map<string, CompactEntry[]>>()
  let indexedForms = 0

  for (const word of dictionary.words) {
    const entry = compactEntry(word)
    if (entry.g.length === 0 || entry.r.length === 0) continue
    const keys = new Set([...entry.k.map(([text]) => text), ...entry.r.map(([text]) => text)])
    for (const rawKey of keys) {
      const key = normalizeKey(rawKey)
      if (!key) continue
      const shardId = shardFor(key)
      const shard = shards.get(shardId) ?? new Map<string, CompactEntry[]>()
      const entries = shard.get(key) ?? []
      entries.push(entry)
      shard.set(key, entries)
      shards.set(shardId, shard)
      indexedForms += 1
    }
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  const outputNames = new Set<string>()
  for (let index = 0; index < SHARD_COUNT; index += 1) {
    const shardId = String(index).padStart(2, '0')
    const filename = `${shardId}.json.gz`
    outputNames.add(filename)
    const entries = Object.fromEntries([...(shards.get(shardId) ?? new Map()).entries()])
    await writeFile(join(OUTPUT_DIR, filename), gzipSync(JSON.stringify(entries), { level: 9 }))
  }

  const manifest = {
    schemaVersion: 1,
    source: 'JMdict English via scriptin/jmdict-simplified',
    sourceRelease: asset.tag,
    dictionaryVersion: dictionary.version,
    dictionaryDate: dictionary.dictDate,
    generatedAt: new Date().toISOString(),
    entryCount: dictionary.words.length,
    indexedForms,
    shardCount: SHARD_COUNT,
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://www.edrdg.org/edrdg/licence.html',
  }
  await writeFile(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  const discovery = JSON.parse(await readFile(DISCOVERY_PATH, 'utf8')) as Record<string, string[]>
  discovery.ja = japaneseDiscoveryWords(dictionary)
  if (discovery.ja.length !== 446) {
    throw new Error(`Expected 446 Japanese discovery words, generated ${discovery.ja.length}`)
  }
  await writeFile(DISCOVERY_PATH, `${JSON.stringify(discovery, null, 2)}\n`)

  for (const filename of await readdir(OUTPUT_DIR)) {
    if (filename !== 'manifest.json' && !outputNames.has(filename)) {
      // These are deterministic generated shards inside the dedicated output
      // directory; unlink keeps the updater portable to Ubuntu CI runners.
      await unlink(join(OUTPUT_DIR, filename))
    }
  }

  console.log(
    `JMdict ${dictionary.dictDate}: ${dictionary.words.length} entries, ${indexedForms} forms, ${SHARD_COUNT} shards`
  )
}

await main()
