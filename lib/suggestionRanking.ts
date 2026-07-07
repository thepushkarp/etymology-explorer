/**
 * Rank words against a query: prefix matches first, then substring matches.
 * Pure and dependency-free so both client (history) and server (wordlist)
 * suggestion paths share the same ordering.
 */
export function rankMatches(words: string[], normalizedQuery: string, limit: number): string[] {
  const seen = new Set<string>()
  const prefixMatches: string[] = []
  const substringMatches: string[] = []

  for (const word of words) {
    if (seen.has(word)) {
      continue
    }

    if (word.startsWith(normalizedQuery)) {
      prefixMatches.push(word)
      seen.add(word)
    }
  }

  for (const word of words) {
    if (seen.has(word)) {
      continue
    }

    if (word.includes(normalizedQuery)) {
      substringMatches.push(word)
      seen.add(word)
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit)
}
