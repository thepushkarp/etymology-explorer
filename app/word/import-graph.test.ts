import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Budget invariant: crawler traffic to /word/[word] must NEVER trigger LLM
 * spend. This test statically walks the transitive import graph of the word
 * page and asserts the research/LLM pipeline modules are absent.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..')
const ENTRY = join(REPO_ROOT, 'app', 'word', '[...segments]', 'page.tsx')

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts']

// Matches static imports/re-exports, dynamic import(), and side-effect imports
const IMPORT_SPECIFIER_PATTERN =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) {
    base = join(REPO_ROOT, specifier.slice(2))
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = resolve(dirname(fromFile), specifier)
  } else {
    return null // bare specifier (node_modules / builtins) — out of scope
  }

  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...SOURCE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null // non-source assets (css, json) — nothing to walk
}

function collectModuleGraph(entry: string): Set<string> {
  const visited = new Set<string>()
  const queue: string[] = [entry]

  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || visited.has(file)) continue
    visited.add(file)
    if (!SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext))) continue

    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1] ?? match[2] ?? match[3]
      if (!specifier) continue
      const resolved = resolveSpecifier(specifier, file)
      if (resolved) queue.push(resolved)
    }
  }

  return visited
}

describe('/word/[word] module graph (LLM spend invariant)', () => {
  const graph = collectModuleGraph(ENTRY)

  test('walker traverses the page graph (sanity)', () => {
    expect(graph.has(ENTRY)).toBe(true)
    expect(graph.has(join(REPO_ROOT, 'lib', 'cache.ts'))).toBe(true)
    expect(graph.has(join(REPO_ROOT, 'components', 'EtymologyCard.tsx'))).toBe(true)
    expect(graph.size).toBeGreaterThan(10)
  })

  test('never imports the research or LLM pipeline', () => {
    const forbidden = ['lib/research.ts', 'lib/llm.ts', 'lib/openrouterResponses.ts']
    for (const relativePath of forbidden) {
      const absolutePath = join(REPO_ROOT, relativePath)
      // Guard: if the module was renamed, this test must be updated, not skipped
      expect(existsSync(absolutePath)).toBe(true)
      expect(graph.has(absolutePath)).toBe(false)
    }
  })

  test('the shared multilingual route preserves the cache-only server graph', () => {
    expect(graph.has(join(REPO_ROOT, 'lib', 'cache.ts'))).toBe(true)
    for (const relativePath of ['lib/research.ts', 'lib/llm.ts', 'lib/openrouterResponses.ts']) {
      expect(graph.has(join(REPO_ROOT, relativePath))).toBe(false)
    }
  })
})
